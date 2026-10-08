// kna/app/(tabs)/chat.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { goBackOr } from '../../utils/navigation';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../components/Tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { db } from '../../config/backend';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../utils/scale';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';
import { askClinicAssistant, type ChatTurn, type ReplyAction } from '../../services/chatbot';
import { CHATBOT_STUDY_MODE, KAI_DISCLAIMER, KAI_DISCLAIMER_SHORT, STUDY_NOTICE } from '../../config/studyMode';

type BubbleMessage = {
  id: string;
  text: string;
  sender: 'patient' | 'admin' | 'bot';
  createdAt: number;
  senderName?: string;
  /** Navigation replies carry a button (open the vaccination card / Appts). */
  action?: ReplyAction;
};
type Mode = 'bot' | 'admin';

type StaffButtonState = 'trigger' | 'resume';

const pendingTriggerKey = (uid: string) => `kna:pendingEscalation:${uid}`;

const BOT_NAME = 'KAI';
const BOT_SENDER_LABEL = 'KAI (K&A AI Assistant)';
const STAFF_SENDER_LABEL = 'K&A Staff';
const PATIENT_SENDER_LABEL = 'You';

const C = {
  red: '#1E3A8A',
  redLight: '#EFF6FF',
  bg: '#F8F9FA',
  border: '#E9ECEF',
  text: '#1A1D1F',
  textSub: '#6C757D',
  userBubble: '#1E3A8A',
  aiBubble: '#F1F3F5',
};

const SUGGESTIONS = [
  { icon: 'time', label: 'Clinic hours?' },
  { icon: 'calendar', label: 'How do I book an appointment?' },
  { icon: 'location', label: 'Where is the clinic?' },
  { icon: 'phone-portrait', label: 'How do I use this app?' },
];

function renderFormattedMessage(rawText: string, isPatient: boolean) {
  if (!rawText) return null;
  // 1. Normalize line bullets and remove markdown heading hashes
  const cleaned = rawText
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\*\-\+]\s+/gm, '• ')
    .replace(/\n[\*\-\+]\s+/g, '\n• ');

  // 2. Parse bold blocks: **bold** or <b>bold</b>
  const regex = /(\*\*.*?\*\*|<b>.*?<\/b>)/gs;
  const parts = cleaned.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;
    const isBold =
      (part.startsWith('**') && part.endsWith('**')) ||
      (part.startsWith('<b>') && part.endsWith('</b>'));
    if (isBold) {
      const inner = part.startsWith('**') ? part.slice(2, -2) : part.slice(3, -4);
      const cleanInner = inner.replace(/\*/g, '');
      return (
        <Text
          key={idx}
          style={{
            fontWeight: '800',
            color: isPatient ? '#FFFFFF' : '#0F172A',
          }}
        >
          {cleanInner}
        </Text>
      );
    }
    // Plain text: strip out any stray raw asterisks or markdown backticks
    const plain = part.replace(/\*/g, '').replace(/`/g, '');
    return plain;
  });
}

// Small round avatar beside a bubble, like the admin Messages page: the
// patient's own photo (or a person icon) beside "You", the K&A logo beside
// clinic staff (staff messages carry no staff id, and staff photos are not
// readable from the patient app), and KAI's mark beside the assistant.
const AVATAR = scale(30);
function ChatAvatar({ sender, photo }: { sender: BubbleMessage['sender']; photo: string | null }) {
  if (sender === 'patient') {
    return photo
      ? <Image source={{ uri: photo }} style={s.avatar} accessibilityIgnoresInvertColors />
      : <View style={[s.avatar, s.avatarIcon]}><Ionicons name="person" size={AVATAR * 0.55} color="#64748B" /></View>;
  }
  if (sender === 'admin') {
    return (
      <View style={[s.avatar, s.avatarLogo]}>
        <Image source={require('../../assets/logo-white-nobg.png')} style={{ width: AVATAR * 0.78, height: AVATAR * 0.78 }} resizeMode="contain" />
      </View>
    );
  }
  return <View style={[s.avatar, s.avatarBot]}><Ionicons name="sparkles" size={AVATAR * 0.5} color="#FFFFFF" /></View>;
}

export default function ChatScreen() {
  const { user, mrn } = usePatientAuth();

  const [mode, setMode] = useState<Mode>('bot');

  // The patient's profile photo for their own bubbles: the clinic-synced copy
  // (patientAvatars/{mrn}), else the one saved on this phone by the profile
  // screen.
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    AsyncStorage.getItem(`kna:avatar:${user.uid}`)
      .then(v => { if (!cancelled && v) setMyPhoto(v); })
      .catch(() => {});
    if (mrn) {
      getDoc(doc(db, 'patientAvatars', mrn))
        .then(snap => { const url = snap.exists() ? (snap.data() as any)?.dataUrl : null; if (!cancelled && url) setMyPhoto(url); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [user?.uid, mrn]);

  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [threadLoaded, setThreadLoaded] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [endingConversation, setEndingConversation] = useState(false);

  const [lastReplyNeedsEscalation, setLastReplyNeedsEscalation] = useState(false);
  const [pendingTriggerLoaded, setPendingTriggerLoaded] = useState(false);

  const [botMessages, setBotMessages] = useState<BubbleMessage[]>([]);
  const [botTyping, setBotTyping] = useState(false);

  const [adminMessages, setAdminMessages] = useState<BubbleMessage[]>([]);
  const [adminMessagesLoaded, setAdminMessagesLoaded] = useState(false);

  const [showEscalationModal, setShowEscalationModal] = useState(false);
  const [chatError, setChatError] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const insets = useSafeAreaInsets();
  const navBarHeight = verticalScale(80) + insets.bottom;
  // Android runs edge-to-edge (app.json android.edgeToEdgeEnabled). Reanimated
  // reads the keyboard inset natively. The bottom nav bar stays in its stationary
  // position at the bottom of the screen; the composer lifts above the keyboard
  // by keyboard.height minus navBarHeight.
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true });
  const keyboardLift = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'android' ? Math.max(0, keyboard.height.value - navBarHeight) : 0,
  }));
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);

  const goBack = () => goBackOr(router, '/');
  const goBackRef = useRef(goBack);
  useEffect(() => { goBackRef.current = goBack; });

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => { goBackRef.current(); return true; }
    );
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 80);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── The patient's open conversation, straight from the server ───────────
  // Re-evaluated on every mount and kept live, so the staff button reflects
  // the true conversation state rather than anything cached on the device.
  // Resolved threads are excluded, which is what guarantees an archived
  // conversation is never reopened.
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chatThreads'),
      where('patientUid', '==', user.uid),
      where('resolved', '==', false),
    );
    return onSnapshot(q, (snap) => {
      // Defensive: if more than one open thread somehow exists, take the most
      // recent so the patient always lands on the live conversation.
      const open = snap.docs
        .map(d => ({ id: d.id, lastMessageAt: (d.data() as any).lastMessageAt ?? 0 }))
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];
      setOpenThreadId(open?.id ?? null);
      setThreadLoaded(true);
      // Staff resolved the thread while the patient was sitting in it — drop
      // them back to the bot rather than leaving a dead view open.
      if (!open) setMode('bot');
    }, (err) => {
      console.error('Open thread listener error:', err);
      setOpenThreadId(null);
      setThreadLoaded(true);
    });
  }, [user?.uid]);

  // ── Restore a pending trigger left over from a previous session ─────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    AsyncStorage.getItem(pendingTriggerKey(user.uid))
      .then(v => { if (!cancelled) setLastReplyNeedsEscalation(v === '1'); })
      .catch(err => console.warn('Pending escalation restore failed:', err))
      .finally(() => { if (!cancelled) setPendingTriggerLoaded(true); });
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Mirror every change back to the device. Best-effort: a storage failure
  // must not break the chat, it only costs the trigger across a restart.
  const rememberPendingTrigger = (needed: boolean) => {
    setLastReplyNeedsEscalation(needed);
    if (!user) return;
    const key = pendingTriggerKey(user.uid);
    const write = needed ? AsyncStorage.setItem(key, '1') : AsyncStorage.removeItem(key);
    write.catch(err => console.warn('Pending escalation persist failed:', err));
  };

  // Derived rather than stored. An open thread always wins: the patient is
  // returned to the live conversation instead of starting a second one.
  const staffButtonState: StaffButtonState = openThreadId ? 'resume' : 'trigger';

  // The bot's last reply was one it could not answer, and there is no open
  // conversation yet — the moment the button matters most, so it is filled
  // rather than outlined. Waits for pendingTriggerLoaded so a restored trigger
  // does not flash the plain style first.
  const staffButtonUrgent =
    staffButtonState === 'trigger' && pendingTriggerLoaded && lastReplyNeedsEscalation;

  // ── Real-time messages for the active admin thread ──
  useEffect(() => {
    if (mode !== 'admin' || !openThreadId) {
      setAdminMessages([]);
      setAdminMessagesLoaded(mode !== 'admin');
      return;
    }
    setAdminMessagesLoaded(false);
    const q = query(collection(db, 'chatMessages'), where('threadId', '==', openThreadId), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
      setChatError('');
      setAdminMessages(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setAdminMessagesLoaded(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, (err) => {
      console.error('Admin chat messages listener error:', err);
      setAdminMessagesLoaded(true);
      setChatError(err?.code === 'permission-denied'
        ? 'You do not have permission to view this conversation.'
        : 'Could not load messages. Please check your connection.');
    });
  }, [mode, openThreadId]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [botMessages, botTyping]);

  // ── Staff button: resume an open conversation, or start a brand-new one ──
  const onStaffButtonPress = () => {
    // 'resume' — an open conversation already exists, just go back to it.
    if (openThreadId) {
      setMode('admin');
      return;
    }
    // 'trigger' — always creates a NEW conversation document. A resolved or
    // archived thread is never reopened; it is excluded from the open-thread
    // query above, so this path is the only way back into staff chat.
    // 'trigger' — confirm first, in the app's own popup.
    if (!user || escalating) return;
    setShowEscalationModal(true);
  };

  const startEscalation = async () => {
    if (!user || escalating) return;
    setEscalating(true);
    setChatError('');
    try {
      const patientName = user.displayName || (user.isAnonymous ? 'Guest Patient' : (user.email?.split('@')[0] ?? 'Patient'));
      await addDoc(collection(db, 'chatThreads'), {
        patientUid: user.uid,
        patientName,
        patientMrn: mrn || null,
        patientEmail: user.email || null,
        status: 'new',
        unread: true,
        resolved: false,
        lastMessage: '',
        lastMessageAt: Date.now(),
        createdAt: Date.now(),
      });
      // The open-thread listener picks the new document up and flips
      // the button to 'resume'; switching mode here opens it straight
      // away so the patient is not left tapping twice.
      setMode('admin');
      rememberPendingTrigger(false);
    } catch (e: any) {
      console.error('Escalation error:', e);
      setChatError(e?.code === 'permission-denied'
        ? 'You do not have permission to start a conversation with clinic staff.'
        : 'Could not start a conversation with clinic staff. Please try again.');
    } finally {
      setEscalating(false);
    }
  };

  // ── End the conversation from the patient side ──────────────────────────
  // Marks the same `resolved` flag staff use (ka-clinic-admin/src/features/messages/MessagesPage.jsx
  // handleArchive) rather than introducing a second notion of "done". It does
  // NOT archive: only staff archive conversations, from the Messages page, so
  // a thread the patient ends stays in the clinic's inbox.
  // Confirmations use the app's own card rather than the OS alert, so the
  // wording and styling match every other destructive step in the app.
  const [alertConfig, setAlertConfig] = useState<CustomAlertConfig>({ visible: false, title: '', message: '' });
  const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const closeThread = async () => {
    if (!openThreadId) return;
    setEndingConversation(true);
    setChatError('');
    try {
      // `unread` is deliberately left alone: it means "unread by an admin", so
      // the patient must not clear it on staff's behalf.
      await updateDoc(doc(db, 'chatThreads', openThreadId), {
        resolved: true,
        closedBy: 'patient',
        closedAt: Date.now(),
      });
      // Listener clears openThreadId, which returns the button to 'trigger'
      // and drops the view back to the bot.
      setMode('bot');
      rememberPendingTrigger(false);
    } catch (e: any) {
      console.error('End conversation error:', e);
      setChatError(e?.code === 'permission-denied'
        ? 'You do not have permission to close this conversation.'
        : 'Could not end the conversation. Please try again.');
    } finally {
      setEndingConversation(false);
    }
  };

  const endConversation = () => {
    if (!openThreadId || endingConversation) return;
    setAlertConfig({
      visible: true,
      type: 'warning',
      title: 'End this conversation?',
      message: 'This closes your conversation with clinic staff. You can start a new one any time you need more help.',
      primaryButtonText: 'End Conversation',
      isDestructive: true,
      secondaryButtonText: 'Cancel',
      onSecondaryPress: hideAlert,
      onPrimaryPress: () => {
        hideAlert();
        closeThread();
      },
    });
  };

  // ── Start a fresh assistant conversation ────────────────────────────────
  // Clears the local bot transcript so the next question is asked with no
  // history, and drops any pending escalation the old thread of questions had
  // raised. Deliberately does NOT touch an open staff conversation: that lives
  // in Firestore and is ended through endConversation, not by resetting the bot.
  const startNewBotConversation = () => {
    if (botMessages.length === 0 && !lastReplyNeedsEscalation) return;
    setAlertConfig({
      visible: true,
      type: 'info',
      title: 'Start a new conversation?',
      message: openThreadId
        ? 'This clears your chat with the K&A AI Assistant. Your open conversation with clinic staff stays exactly as it is.'
        : 'This clears your chat with the K&A AI Assistant. Anything you asked so far will no longer be shown.',
      primaryButtonText: 'Start New',
      secondaryButtonText: 'Cancel',
      onSecondaryPress: hideAlert,
      onPrimaryPress: () => {
        hideAlert();
        setBotMessages([]);
        setInput('');
        setChatError('');
        rememberPendingTrigger(false);
      },
    });
  };

  // One message in flight at a time. The keyboard's Send key (onSubmitEditing)
  // ignores the disabled Send button, and can fire twice on some keyboards,
  // which sent the same question twice and showed the answer twice. A ref,
  // not state, so a second call in the same tick sees it immediately.
  const sendingRef = useRef(false);

  // ── Bot mode: ask the shared K&A Health Assistant engine (api/chatbot.js) ──
  const sendBotMessage = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setInput('');
    const history: ChatTurn[] = botMessages.map(m => ({ role: m.sender === 'patient' ? 'user' : 'bot', text: m.text }));
    setBotMessages(m => [...m, { id: `u-${Date.now()}`, text, sender: 'patient', createdAt: Date.now() }]);
    setBotTyping(true);
    let reply;
    try {
      reply = await askClinicAssistant(text, history);
    } finally {
      setBotTyping(false);
      sendingRef.current = false;
    }
    setBotMessages(m => [...m, {
      id: `b-${Date.now()}`, text: reply.text, sender: 'bot',
      createdAt: Date.now(), senderName: BOT_SENDER_LABEL, action: reply.action,
    }]);
    // Drives the staff button's trigger state. Only the latest reply counts —
    // a follow-up the bot *can* answer clears the offer again.
    rememberPendingTrigger(reply.needsEscalation);
    if (reply.needsEscalation && !openThreadId) {
      setShowEscalationModal(true);
    }
  };

  // ── Admin mode: message the escalated thread ──
  const sendAdminMessage = async () => {
    const text = input.trim();
    if (!text || !openThreadId || !user || sendingRef.current) return;
    sendingRef.current = true;
    setInput('');
    setSending(true);
    try {
      await addDoc(collection(db, 'chatMessages'), {
        threadId: openThreadId,
        text,
        sender: 'patient',
        senderName: user.displayName || 'Patient',
        createdAt: Date.now(),
      });
      await updateDoc(doc(db, 'chatThreads', openThreadId), {
        lastMessage: text,
        lastMessageAt: Date.now(),
        status: 'pending',
        unread: true,
      });
    } catch (e: any) {
      console.error('Send message error:', e);
      setChatError(e?.code === 'permission-denied'
        ? 'You do not have permission to send messages.'
        : 'Message failed to send. Please try again.');
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const send = (override?: string) => (mode === 'admin' ? sendAdminMessage() : sendBotMessage(override));

  // Buttons under KAI's personal-info answers.
  const openReplyAction = (action: ReplyAction) => {
    if (action.target === 'appointments') router.navigate('/appt');
    // Home, scrolled to the vaccination card (t makes a repeat tap a new navigation).
    else router.navigate({ pathname: '/', params: { tab: 'Records', t: String(Date.now()) } });
  };

  const messages = mode === 'admin' ? adminMessages : botMessages;
  const messagesLoaded = mode === 'admin' ? adminMessagesLoaded : true;
  const typing = mode === 'admin' ? sending : botTyping;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />

      {/* Safe area top padding + header */}
      <View style={[s.header, { paddingTop: Math.max(insets.top, verticalScale(20)), paddingBottom: verticalScale(14), minHeight: verticalScale(74) + insets.top }]}>
        <Tap style={s.headerBtn} onPress={goBack} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Tap>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text style={s.headerTitle}>{mode === 'admin' ? (<><Text style={{ color: C.red, fontWeight: '900' }}>K&A</Text> Clinic Staff</>) : (<><Text style={{ color: C.red, fontWeight: '900' }}>{BOT_NAME}</Text> · AI Assistant</>)}</Text>
          <Text style={s.headerSubtitle}>{mode === 'admin' ? 'Chatting with clinic staff' : 'K&A Virtual Assistant · Helpdesk'}</Text>
        </View>
        {/* Refresh — starts a fresh assistant conversation. Bot view only */}
        {mode === 'bot' ? (
          <Tap
            style={s.headerBtn}
            onPress={startNewBotConversation}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Start a new conversation with KAI"
          >
            <Ionicons name="refresh" size={20} color={C.text} />
          </Tap>
        ) : (
          <View style={{ width: scale(44), height: scale(44) }} />
        )}
      </View>

      {/* Body with KeyboardHandling */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <Animated.View style={[{ flex: 1 }, keyboardLift]}>
          {/* Persistent KAI disclaimer (and the study-mode notice). */}
          {mode === 'bot' && (
            <View style={s.disclaimer} accessibilityRole="text">
              <Ionicons name="information-circle-outline" size={16} color="#1E3A8A" style={{ marginTop: 1 }} />
              <Text style={s.disclaimerTxt}>{KAI_DISCLAIMER}</Text>
            </View>
          )}
          {mode === 'bot' && CHATBOT_STUDY_MODE && (
            <View style={s.studyNotice} accessibilityRole="text">
              <Ionicons name="flask-outline" size={14} color="#92400E" />
              <Text style={s.studyNoticeTxt}>{STUDY_NOTICE}</Text>
            </View>
          )}
          {chatError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), padding: scale(14), backgroundColor: C.redLight }}>
              <Ionicons name="alert-circle-outline" size={16} color={C.red} />
              <Text style={{ color: C.red, fontSize: moderateScale(12.5), flex: 1 }}>{chatError}</Text>
            </View>
          ) : null}

          {!threadLoaded || !messagesLoaded ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.red} size="large" />
            </View>
          ) : messages.length === 0 ? (
            <ScrollView contentContainerStyle={s.emptyContent} keyboardShouldPersistTaps="handled">
              <View style={s.hero}>
                <View style={s.heroIcon}>
                  <Ionicons name={mode === 'admin' ? 'person-circle' : 'medical'} size={34} color={C.red} />
                </View>
                <Text style={s.heroTitle}>{mode === 'admin' ? 'Message the Clinic' : `Hi! I'm ${BOT_NAME}`}</Text>
                <Text style={s.heroSub}>
                  {mode === 'admin'
                    ? 'Send a message and clinic staff will reply here'
                    : "I'm the K&A Clinic virtual assistant. Ask about office hours, the clinic's location and contact details, booking an appointment, or finding your way around the app."}
                </Text>
              </View>
              {mode === 'bot' && (
                <View style={s.grid}>
                  {SUGGESTIONS.map((sug, i) => (
                    <Tap key={i} style={s.card} onPress={() => sendBotMessage(sug.label)} activeOpacity={0.8}>
                      <View style={s.cardIconBox}>
                        <Ionicons name={sug.icon as any} size={20} color={C.red} />
                      </View>
                      <Text style={s.cardText}>{sug.label}</Text>
                    </Tap>
                  ))}
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView ref={scrollRef} contentContainerStyle={s.chatScroll} keyboardShouldPersistTaps="handled">
              {messages.map((m) => {
                const isPatient = m.sender === 'patient';
                const senderLabel = m.sender === 'bot'
                  ? BOT_SENDER_LABEL
                  : m.sender === 'admin'
                    ? (m.senderName || STAFF_SENDER_LABEL)
                    : PATIENT_SENDER_LABEL;
                return (
                  <View key={m.id} style={[s.msgRow, isPatient ? s.msgUser : s.msgAi]}>
                    {!isPatient && <ChatAvatar sender={m.sender} photo={myPhoto} />}
                    <View style={[s.msgColumn, isPatient ? s.msgColumnOwn : s.msgColumnOther]}>
                      {senderLabel && (
                        <Text style={[s.senderLabel, isPatient && s.senderLabelOwn]}>{senderLabel}</Text>
                      )}
                      <View style={[s.bubble, isPatient ? s.bubbleUser : s.bubbleAi]}>
                        <Text style={[s.msgText, isPatient && { color: '#fff' }]}>
                          {renderFormattedMessage(m.text, isPatient)}
                        </Text>
                      </View>
                      {m.action && (
                        <Pressable
                          onPress={() => openReplyAction(m.action!)}
                          accessibilityRole="button"
                          android_ripple={{ color: 'rgba(30,58,138,0.12)' }}
                          style={({ pressed }) => [s.replyAction, pressed && Platform.OS === 'ios' && { opacity: 0.8 }]}
                        >
                          <Ionicons name={m.action.target === 'appointments' ? 'calendar-outline' : 'list-outline'} size={15} color={C.red} />
                          <Text style={s.replyActionTxt}>{m.action.label}</Text>
                          <Ionicons name="chevron-forward" size={14} color={C.red} />
                        </Pressable>
                      )}
                    </View>
                    {isPatient && <ChatAvatar sender="patient" photo={myPhoto} />}
                  </View>
                );
              })}
              {typing && (
                <ActivityIndicator color={C.red} style={{ alignSelf: 'flex-start', marginLeft: scale(20) }} />
              )}
            </ScrollView>
          )}

          {/* Bot view controls */}
          {mode === 'bot' && threadLoaded && openThreadId && (
            <View style={s.actionRow}>
              <Tap
                style={s.flexBtnPrimary}
                onPress={onStaffButtonPress}
                disabled={escalating}
                activeOpacity={0.7}
              >
                {escalating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="arrow-undo-outline" size={15} color="#fff" />
                    <Text style={s.flexBtnPrimaryTxt}>Back to Clinic Staff</Text>
                  </>
                )}
              </Tap>

              <Tap style={s.flexBtnSecondary} onPress={endConversation} disabled={endingConversation} activeOpacity={0.7}>
                {endingConversation ? (
                  <ActivityIndicator color={C.red} size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={15} color={C.red} />
                    <Text style={s.flexBtnSecondaryTxt}>Done / End</Text>
                  </>
                )}
              </Tap>
            </View>
          )}

          {/* Staff view */}
          {mode === 'admin' && threadLoaded && openThreadId && (
            <View style={s.actionRow}>
              <Tap style={s.flexBtnSecondary} onPress={() => setMode('bot')} activeOpacity={0.7}>
                <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textSub} />
                <Text style={s.flexBtnSecondaryTxt}>Ask Assistant</Text>
              </Tap>

              <Tap style={s.flexBtnPrimary} onPress={endConversation} disabled={endingConversation} activeOpacity={0.7}>
                {endingConversation ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={15} color="#fff" />
                    <Text style={s.flexBtnPrimaryTxt}>Done / End</Text>
                  </>
                )}
              </Tap>
            </View>
          )}

          {/* Bottom Chat Input Box */}
          <View
            style={[
              s.inputContainer,
              {
                paddingBottom: verticalScale(10),
              },
            ]}
          >
            <View style={s.inputWrapper}>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder={mode === 'admin' ? 'Message the clinic...' : 'Type a message...'}
                placeholderTextColor="#6B7280"
                returnKeyType="send"
                onSubmitEditing={() => send()}
              />
              <Tap style={[s.sendBtn, (sending || botTyping || !input.trim()) && { opacity: 0.4 }]} onPress={() => send()} disabled={sending || botTyping || !input.trim()}>
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </Tap>
            </View>
            {mode === 'bot' && <Text style={s.inputDisclaimer}>{KAI_DISCLAIMER_SHORT}</Text>}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* ── BOTTOM NAV BAR ── Anchored stationary at the bottom of the screen */}
      <View style={[nav.bar, { height: navBarHeight, paddingBottom: verticalScale(8) + insets.bottom }]}>
        <Tap style={nav.tab} activeOpacity={0.7} onPress={() => router.navigate('/')}>
          <Ionicons name="home-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Home</Text>
        </Tap>
        <Tap style={nav.tab} activeOpacity={0.7} onPress={() => router.navigate('/appt')}>
          <Ionicons name="calendar-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Appts</Text>
        </Tap>
        <Tap style={nav.tab} activeOpacity={0.7}>
          <Ionicons name="chatbubble-ellipses" size={24} color={C.red} />
          <Text style={[nav.label, nav.labelActive]}>Chat</Text>
        </Tap>
        <Tap style={nav.tab} activeOpacity={0.7} onPress={() => router.navigate('/profile')}>
          <Ionicons name="person-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Account</Text>
        </Tap>
      </View>

      <CustomAlertModal config={alertConfig} onClose={hideAlert} />

      {/* Talk to clinic staff: shown after a clinical reply, confirms before a
          new staff conversation is created. */}
      <CustomAlertModal
        config={{
          visible: showEscalationModal,
          type: 'chat',
          title: 'Talk to clinic staff?',
          message: "This starts a conversation with K&A Clinic staff. They'll reply here during clinic hours.",
          secondaryButtonText: 'Cancel',
          onSecondaryPress: () => setShowEscalationModal(false),
          primaryButtonText: 'Start chat',
          onPrimaryPress: () => { setShowEscalationModal(false); startEscalation(); },
        }}
        onClose={() => setShowEscalationModal(false)}
      />
    </View>
  );
}

const nav = StyleSheet.create({
  bar: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderTopWidth: 1, borderColor: '#F1F5F9',
    paddingTop: verticalScale(6), paddingHorizontal: scale(4),
    elevation: 20, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 },
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%' },
  label: { fontSize: moderateScale(11), color: '#64748B', marginTop: verticalScale(3), fontWeight: '600' },
  labelActive: { color: C.red, fontWeight: '800' },
});

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(14),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4FA',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  headerBtn: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  headerTitle: {
    fontSize: moderateScale(21),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.4,
    textAlign: 'center',
  },

  headerSubtitle: {
    fontSize: moderateScale(12.5),
    color: '#64748B',
    marginTop: verticalScale(2),
    fontWeight: '500',
    textAlign: 'center',
  },

  emptyContent: {
    padding: scale(24),
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: verticalScale(20),
  },

  hero: {
    alignItems: 'center',
    marginBottom: verticalScale(30),
  },

  heroIcon: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(24),
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },

  heroTitle: {
    fontSize: moderateScale(24),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },

  heroSub: {
    fontSize: moderateScale(13.5),
    color: '#64748B',
    marginTop: verticalScale(6),
    fontWeight: '500',
    textAlign: 'center',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  card: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: scale(16),
    borderRadius: scale(18),
    marginBottom: verticalScale(14),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  cardIconBox: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardText: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    color: '#1E293B',
    marginTop: verticalScale(10),
  },

  chatScroll: {
    padding: scale(16),
    paddingBottom: verticalScale(30),
  },

  msgRow: {
    flexDirection: 'row',
    marginBottom: verticalScale(16),
    width: '100%',
  },

  msgUser: { justifyContent: 'flex-end', alignItems: 'flex-end', gap: scale(8) },
  msgAi: { justifyContent: 'flex-start', alignItems: 'flex-end', gap: scale(8) },

  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden' },
  avatarIcon: { backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  avatarLogo: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  avatarBot: { backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },

  replyAction: {
    flexDirection: 'row', alignItems: 'center', gap: scale(6),
    marginTop: verticalScale(8), paddingHorizontal: scale(14), minHeight: verticalScale(40),
    borderRadius: scale(14), borderWidth: 1.5, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF',
    overflow: 'hidden',
  },
  replyActionTxt: { fontSize: moderateScale(13), fontWeight: '700', color: C.red },

  // Width is capped by msgColumn instead; see the comment at the call site.
  bubble: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderRadius: scale(20),
  },

  // Leaves room for the avatar beside the bubble.
  msgColumn: {
    maxWidth: '78%',
  },

  // Keeps a short bubble hugging its own side of the thread rather than
  // stretching to the full 85% the column allows.
  msgColumnOwn: {
    alignItems: 'flex-end',
  },

  msgColumnOther: {
    alignItems: 'flex-start',
  },

  bubbleUser: {
    backgroundColor: C.userBubble,
    borderBottomRightRadius: scale(4),
  },

  bubbleAi: {
    backgroundColor: C.aiBubble,
    borderBottomLeftRadius: scale(4),
  },

  msgText: {
    fontSize: moderateScale(15),
    lineHeight: moderateScale(22),
    color: C.text,
  },

  botActions: {
    marginHorizontal: scale(16),
    marginBottom: verticalScale(10),
    gap: scale(8),
  },

  escalateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(10),
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: C.red,
    backgroundColor: C.redLight,
  },

  // The bot just gave a reply it could not answer — the button is already
  // present, so draw attention to it rather than revealing it.
  escalateBtnUrgent: {
    backgroundColor: C.red,
    borderColor: C.red,
  },

  escalateBtnText: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: C.red,
  },

  escalateBtnTextUrgent: {
    color: '#fff',
  },

  senderLabel: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: C.textSub,
    marginBottom: verticalScale(4),
    marginLeft: scale(6),
  },

  // The patient's own bubbles sit on the right, so their label follows.
  senderLabelOwn: {
    textAlign: 'right',
    marginLeft: 0,
    marginRight: scale(6),
  },

  staffActions: {
    flexDirection: 'row',
    gap: scale(8),
    marginHorizontal: scale(16),
    marginBottom: verticalScale(10),
  },

  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(10),
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: '#fff',
  },

  secondaryBtnText: {
    fontSize: moderateScale(12.5),
    fontWeight: '600',
    color: C.textSub,
  },

  // Shared by the staff-view row and the stacked bot-view column, so `flex: 1`
  // lives on the row's children (s.rowItem) rather than here — in a column it
  // would stretch the button to fill the remaining height.
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(10),
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: C.red,
    backgroundColor: C.redLight,
  },

  rowItem: {
    flex: 1,
  },

  endBtnText: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: C.red,
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    marginHorizontal: scale(16),
    marginBottom: verticalScale(10),
  },
  flexBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(11),
    borderRadius: scale(14),
    backgroundColor: C.red,
  },
  flexBtnPrimaryTxt: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  flexBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: verticalScale(11),
    borderRadius: scale(14),
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.redLight,
  },
  flexBtnSecondaryTxt: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: C.red,
  },

  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: scale(8),
    paddingHorizontal: scale(14), paddingVertical: verticalScale(9),
    backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#DBEAFE',
  },
  disclaimerTxt: { flex: 1, fontSize: moderateScale(12), lineHeight: moderateScale(17), color: '#1E3A8A', fontWeight: '500' },
  studyNotice: {
    flexDirection: 'row', alignItems: 'center', gap: scale(6),
    paddingHorizontal: scale(14), paddingVertical: verticalScale(6),
    backgroundColor: '#FEF3C7', borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  studyNoticeTxt: { flex: 1, fontSize: moderateScale(11.5), color: '#92400E', fontWeight: '700' },
  inputDisclaimer: { fontSize: moderateScale(10.5), color: '#64748B', textAlign: 'center', marginTop: verticalScale(6) },

  inputContainer: {
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: '#fff',
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: scale(26),
    paddingHorizontal: scale(10),
    paddingVertical: 0,
    borderWidth: 1.5,
    borderColor: C.border,
    height: verticalScale(48),
  },

  input: {
    flex: 1,
    height: verticalScale(48),
    fontSize: moderateScale(16),
    color: C.text,
    paddingHorizontal: scale(8),
    paddingVertical: 0,
    textAlignVertical: 'center',
  },

  sendBtn: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
