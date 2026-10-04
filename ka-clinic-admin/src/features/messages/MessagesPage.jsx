// ka-clinic-admin/src/features/messages/MessagesPage.jsx
import { addDoc, collection, deleteField, doc, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { Archive, AlertCircle, CheckCheck, Clock, Inbox, MessageSquare, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db, listen } from '../../lib/firebase';
import { deleteArchivedConversation } from '../../lib/patientArchive';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';


import { SkeletonRows } from '../../components/Skeleton';
/* ─── avatar initials ───────────────────────────────────────── */
const initials = (name) => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

const AVATAR_COLORS = [
  '#3D5AFE', '#06B6D4', '#F59E0B', '#8B5CF6', '#EF4444',
  '#10B981', '#EC4899', '#F97316',
];
const avatarColor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

/* ─── time formatter ────────────────────────────────────────── */
const formatTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Math.floor((Date.now() - d) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

/* ─── archive date formatter ────────────────────────────────── */
// Archived rows show an absolute date rather than "2h ago" — for a
// conversation closed weeks ago, the relative form stops being useful, and
// this is what distinguishes several archived conversations from the same
// patient in the list.
const formatArchivedDate = (ts) => {
  if (!ts) return 'Archived';
  return `Archived ${new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

/* ─── FILTER TABS ───────────────────────────────────────────── */
// Pending/Replied/Resolved are gone as filters: they described the thread's
// reply state rather than what an admin needs to do next. The action behind
// "Resolved" now lives on the Archive button, and archived conversations get
// their own section instead of a tab.
const FILTERS = ['all', 'unread'];

/* ─── views ─────────────────────────────────────────────────── */
// Active and Archive are physically separate lists over disjoint data
// (archived != true vs. archived == true), so a patient's old conversations
// can never collide with their current one.
const VIEW_ACTIVE = 'active';
const VIEW_ARCHIVE = 'archive';

export default function MessagesPage() {
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  // Active / Archive are separate sections of this page. Archived
  // conversations are read-only here and can be restored or deleted; the
  // nightly job still deletes them 30 days after archiving.
  const [view, setView] = useState(VIEW_ACTIVE);
  // 'archive' | 'restore' | 'delete' while its confirmation is open.
  const [confirmAction, setConfirmAction] = useState(null);
  const selectedId = selectedThread?.id;
  useEffect(() => { setConfirmAction(null); }, [selectedId]);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  /* ── real-time chatThreads listener ────────────────────────── */
  useEffect(() => {
    let unsub;
    const fetchThreads = () => {
      try {
        const q = query(collection(db, 'chatThreads'), orderBy('lastMessageAt', 'desc'));
        unsub = listen(q, snap => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setThreads(data);
          // Deliberately does NOT auto-select the first thread: selecting a
          // thread marks it read, and a conversation should only count as read
          // once an admin has actually opened it.
          setSelectedThread(prev => (prev ? data.find(t => t.id === prev.id) || prev : null));
          setLoadingThreads(false);
        }, err => {
          console.warn('Ordered chatThreads query failed, falling back to unordered:', err);
          const fallbackQ = query(collection(db, 'chatThreads'));
          unsub = listen(fallbackQ, snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setThreads(data);
            setSelectedThread(prev => (prev ? data.find(t => t.id === prev.id) || prev : null));
            setLoadingThreads(false);
          });
        });
      } catch (err) {
        console.warn('Query catch fallback:', err);
        const fallbackQ = query(collection(db, 'chatThreads'));
        unsub = listen(fallbackQ, snap => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setThreads(data);
          setSelectedThread(prev => (prev ? data.find(t => t.id === prev.id) || prev : null));
          setLoadingThreads(false);
        });
      }
    };

    fetchThreads();
    return () => { if (unsub) unsub(); };
  }, []);

  /* ── real-time chatMessages listener for selected thread ──── */
  useEffect(() => {
    if (!selectedThread?.id) {
      setMessages([]);
      return;
    }

    let unsub;
    const fetchMessages = () => {
      try {
        const q = query(
          collection(db, 'chatMessages'),
          where('threadId', '==', selectedThread.id),
          orderBy('createdAt', 'asc'),
          limit(100)
        );
        unsub = listen(q, snap => {
          setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, err => {
          console.warn('Ordered chatMessages query failed, falling back to unordered filter:', err);
          const fallbackQ = query(
            collection(db, 'chatMessages'),
            where('threadId', '==', selectedThread.id),
            limit(100)
          );
          unsub = listen(fallbackQ, snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            setMessages(data);
          });
        });
      } catch (err) {
        const fallbackQ = query(
          collection(db, 'chatMessages'),
          where('threadId', '==', selectedThread.id),
          limit(100)
        );
        unsub = listen(fallbackQ, snap => {
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          data.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          setMessages(data);
        });
      }
    };

    fetchMessages();
    return () => { if (unsub) unsub(); };
  }, [selectedThread?.id]);

  /* ── auto-mark thread as read when selected ────────────────── */
  useEffect(() => {
    if (selectedThread?.unread && selectedThread?.id) {
      updateDoc(doc(db, 'chatThreads', selectedThread.id), { unread: false }).catch(err => {
        console.warn('Mark read error:', err);
      });
    }
  }, [selectedThread?.id, selectedThread?.unread]);

  /* ── auto-scroll to bottom ─────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── archiving ─────────────────────────────────────────────── */
  // Conversations are archived only by staff, with the Archive button below.
  // Nothing archives them automatically. The nightly job
  // (api/notifications.js archiveReadConversations) only deletes conversations
  // that have been in the Archive for more than 30 days.

  /* ── archive thread: close it if open, then file it away ───── */
  // One action, two effects: closing the conversation (which returns the
  // patient to the assistant) and archiving it. `resolved` is the single
  // source of truth for open/closed — the patient app derives its "Talk to
  // Clinic Staff" button by querying for an unresolved thread, so setting it
  // is all that is needed on that side.
  const handleArchive = async () => {
    if (!selectedThread?.id || resolving) return;
    setResolving(true);
    try {
      const now = Date.now();
      await updateDoc(doc(db, 'chatThreads', selectedThread.id), {
        resolved: true,
        unread: false,
        archived: true,
        archivedAt: now,
        // Preserve who closed it: a thread the patient already ended keeps
        // their attribution rather than being reattributed to staff.
        ...(selectedThread.resolved ? {} : { closedBy: 'staff', closedAt: now }),
      });
      // It has just left the Active list — drop the selection so the pane
      // does not keep showing a conversation that is no longer there.
      setSelectedThread(null);
      setConfirmAction(null);
    } catch (err) {
      console.error('Archive thread error:', err);
      alert('Failed to archive the conversation. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  // Restoring puts an archived conversation back in Active. It stays closed
  // (resolved); the patient app is unaffected.
  const handleRestore = async () => {
    if (!selectedThread?.id || resolving) return;
    setResolving(true);
    try {
      await updateDoc(doc(db, 'chatThreads', selectedThread.id), { archived: false, archivedAt: deleteField() });
      setSelectedThread(null);
      setConfirmAction(null);
    } catch (err) {
      console.error('Restore thread error:', err);
      alert('Failed to restore the conversation. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  // Permanent: the thread and all of its messages.
  const handleDelete = async () => {
    if (!selectedThread?.id || resolving) return;
    setResolving(true);
    try {
      await deleteArchivedConversation(selectedThread.id);
      setSelectedThread(null);
      setConfirmAction(null);
    } catch (err) {
      console.error('Delete thread error:', err);
      alert('Failed to delete the conversation. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  /* ── send admin reply ──────────────────────────────────────── */
  const handleSend = async () => {
    if (!reply.trim() || !selectedThread?.id || sending) return;
    const text = reply.trim();
    setReply('');
    setSending(true);

    try {
      await addDoc(collection(db, 'chatMessages'), {
        threadId: selectedThread.id,
        text,
        sender: 'admin',
        senderName: 'K&A Clinic',
        createdAt: Date.now(),
      });

      await updateDoc(doc(db, 'chatThreads', selectedThread.id), {
        lastMessage: text,
        lastMessageAt: Date.now(),
        status: 'replied',
        unread: false,
      });
    } catch (err) {
      console.error('Send reply error:', err);
      alert('Failed to send reply. Please try again.');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  /* ── filter & search logic ─────────────────────────────────── */
  // Active and Archive are disjoint by construction — a thread is in exactly
  // one of them — so two conversations from the same patient can never appear
  // as ambiguous duplicates across the two lists.
  const matchesSearch = (t) => {
    const q = search.toLowerCase();
    return (t.patientName || '').toLowerCase().includes(q) ||
           (t.lastMessage || '').toLowerCase().includes(q);
  };

  const activeThreads = threads.filter(t => !t.archived && matchesSearch(t));
  const archivedThreads = threads
    .filter(t => t.archived && matchesSearch(t))
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));

  const archivedCount = threads.filter(t => t.archived).length;
  const activeCount = threads.length - archivedCount;
  const filteredThreads = view === VIEW_ARCHIVE
    ? archivedThreads
    : activeThreads.filter(t => (filter === 'unread' ? t.unread : true));

  // Unread only ever counts Active — an archived conversation is done, and
  // should never keep a badge alive in the header.
  const unreadCount = threads.filter(t => t.unread && !t.archived).length;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-gray-50 p-6 overflow-hidden">
      <div className="flex flex-1 min-h-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* ── LEFT SIDEBAR: THREAD LIST ────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 border-r border-gray-100 flex flex-col min-h-0 bg-white">

          {/* Header */}
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-gray-900">
                  {view === VIEW_ARCHIVE ? 'Archive' : 'Patient Messages'}
                </h1>
                {view === VIEW_ACTIVE && unreadCount > 0 && (
                  <span className="text-[11px] font-bold bg-[#3B50DF] text-white px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
            </div>

            {/* Active / Archive — separate sections, not filter tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl" role="tablist">
              <button
                role="tab"
                aria-selected={view === VIEW_ACTIVE}
                onClick={() => { setView(VIEW_ACTIVE); setSelectedThread(null); setConfirmAction(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  view === VIEW_ACTIVE ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Inbox size={13} /> Active ({activeCount})
              </button>
              <button
                role="tab"
                aria-selected={view === VIEW_ARCHIVE}
                onClick={() => { setView(VIEW_ARCHIVE); setSelectedThread(null); setConfirmAction(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  view === VIEW_ARCHIVE ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Archive size={13} /> Archive ({archivedCount})
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search patient or message..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#3B50DF] focus:bg-white transition-all"
              />
            </div>

            {/* All / Unread — only meaningful for Active */}
            {view === VIEW_ACTIVE && (
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {FILTERS.map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 py-2 text-xs font-bold capitalize rounded-lg transition-all ${
                      filter === f ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {loadingThreads ? (
              <SkeletonRows rows={4} className="!px-4" />
            ) : filteredThreads.length === 0 ? (
              <EmptyState
                icon={view === VIEW_ARCHIVE ? Archive : MessageSquare}
                title={view === VIEW_ARCHIVE ? 'No archived conversations' : 'No messages found'}
                text={search ? 'Try a different search.' : view === VIEW_ARCHIVE ? 'Archived conversations appear here.' : 'New patient messages appear here.'}
                className="h-full"
              />
            ) : (
              filteredThreads.map(t => {
                const selected = selectedThread?.id === t.id;
                const color = avatarColor(t.patientName);
                const isArchived = !!t.archived;

                return (
                  <div
                    key={t.id}
                    className={`w-full transition-all flex items-start gap-3 relative ${
                      selected ? 'bg-indigo-50/50 border-l-4 border-[#3B50DF]' : 'hover:bg-gray-50'
                    }`}
                  >
                    <button
                      onClick={() => setSelectedThread(t)}
                      className="flex-1 min-w-0 p-3.5 text-left flex items-start gap-3"
                    >
                      {/* Unread marker — always rendered, in every tab and
                          view, so "All" shows at a glance what is unread
                          rather than hiding it behind the Unread filter. */}
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs"
                          style={{ backgroundColor: color }}
                        >
                          {initials(t.patientName)}
                        </div>
                        {t.unread && !isArchived && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#3B50DF] ring-2 ring-white" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-xs truncate ${
                            t.unread && !isArchived ? 'text-gray-900 font-extrabold' : 'text-gray-800 font-bold'
                          }`}>
                            {t.patientName || 'Unknown Patient'}
                          </span>
                          {/* Active shows recency; Archive shows the archive
                              date, which is what tells a patient's several
                              archived conversations apart. */}
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {isArchived ? formatArchivedDate(t.archivedAt) : formatTime(t.lastMessageAt)}
                          </span>
                        </div>

                        <p className={`text-xs truncate ${
                          t.unread && !isArchived ? 'text-gray-900 font-semibold' : 'text-gray-500'
                        }`}>
                          {t.lastMessage || 'No message contents'}
                        </p>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {t.escalationReason && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              ⚠️ {t.escalationReason}
                            </span>
                          )}
                          {t.unread && !isArchived && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#3B50DF] text-white ml-auto">
                              Unread
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT MAIN CHAT AREA ────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {selectedThread ? (
            <>
              {/* Top Header Bar */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs"
                    style={{ backgroundColor: avatarColor(selectedThread.patientName) }}
                  >
                    {initials(selectedThread.patientName)}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">{selectedThread.patientName}</h2>
                    <p className="text-[11px] text-gray-400 flex items-center gap-2">
                      <span>MRN: {selectedThread.patientMrn || 'N/A'}</span>
                      <span>•</span>
                      <span>{selectedThread.patientEmail || 'No email registered'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedThread.escalationReason && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                      <AlertCircle size={14} className="text-amber-600" />
                      <span className="text-xs font-bold text-amber-800">
                        Escalation: {selectedThread.escalationReason}
                      </span>
                    </div>
                  )}
                  {selectedThread.archived ? (
                    <>
                      <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-500 ring-1 ring-gray-200 flex items-center gap-1.5">
                        <CheckCheck size={13} /> {formatArchivedDate(selectedThread.archivedAt)}
                      </span>
                      <button
                        onClick={() => setConfirmAction('restore')}
                        disabled={resolving}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 transition-all disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <RotateCcw size={13} /> Restore
                      </button>
                      <button
                        onClick={() => setConfirmAction('delete')}
                        disabled={resolving}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-all disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmAction('archive')}
                      disabled={resolving}
                      className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-700 text-white transition-all disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Archive size={13} /> Archive
                    </button>
                  )}
                </div>
              </div>

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-xs">
                    No message history yet. Send a reply below.
                  </div>
                ) : (
                  messages.map(m => {
                    const isAdmin = m.sender === 'admin';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-5 py-3 text-sm shadow-xs leading-relaxed ${
                            isAdmin
                              ? 'bg-[#3B50DF] text-white rounded-br-xs'
                              : 'bg-white text-gray-800 border border-gray-200 rounded-bl-xs'
                          }`}
                        >
                          <p className="font-semibold text-[11px] mb-1 opacity-80">
                            {isAdmin ? 'K&A Staff' : m.senderName || selectedThread.patientName}
                          </p>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>
                        <span className="text-[11px] text-gray-400 mt-1 px-1">
                          {formatTime(m.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Reply Box */}
              {selectedThread.archived ? (
                <div className="p-3 border-t border-gray-100 bg-gray-50 flex-shrink-0 text-center">
                  <p className="text-[11px] text-gray-500">
                    This conversation is archived and read-only. The patient starts a new
                    conversation if they need more help.
                  </p>
                </div>
              ) : (
                <div className="p-3 border-t border-gray-100 bg-white flex-shrink-0">
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2 focus-within:border-[#3B50DF] focus-within:bg-white transition-all">
                    <textarea
                      ref={textareaRef}
                      rows={2}
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type your response to the patient..."
                      className="flex-1 bg-transparent text-xs text-gray-800 outline-none resize-none px-2 py-1"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!reply.trim() || sending}
                      className="px-4 py-2 bg-[#3B50DF] hover:bg-[#2F40B5] text-white rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Send size={13} />
                      <span>Send</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              text="Choose a patient thread from the list to read messages and send replies."
            />
          )}
        </div>

      </div>

      {confirmAction && (() => {
        const t = selectedThread;
        const shortDate = (ts) => {
          const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
          return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        };
        const subject = [
          ['Patient', t?.patientName || t?.name || ''],
          ['MRN', t?.patientMrn || ''],
          ['Messages', messages.length ? String(messages.length) : ''],
          confirmAction === 'archive'
            ? ['Last message', shortDate(t?.lastMessageAt)]
            : ['Archived', shortDate(t?.archivedAt)],
        ];
        if (confirmAction === 'archive') return (
          <ConfirmDialog
            variant="neutral"
            icon={Archive}
            title="Archive this conversation?"
            subtitle="Patient conversation"
            message={<>The conversation moves to <strong>Archive</strong> and is <strong>closed</strong> for the patient.</>}
            details={subject}
            note="Deleted automatically 30 days after archiving. You can restore it before then."
            noteIcon={Clock}
            confirmLabel="Archive"
            busy={resolving}
            busyLabel="Archiving…"
            onConfirm={handleArchive}
            onCancel={() => setConfirmAction(null)}
          />
        );
        if (confirmAction === 'restore') return (
          <ConfirmDialog
            variant="neutral"
            icon={RotateCcw}
            title="Restore this conversation?"
            subtitle="Archived conversation"
            message={<>The conversation moves back to <strong>Active</strong>.</>}
            details={subject}
            note="It stays closed for the patient until they message again."
            confirmLabel="Restore"
            busy={resolving}
            busyLabel="Restoring…"
            onConfirm={handleRestore}
            onCancel={() => setConfirmAction(null)}
          />
        );
        if (confirmAction === 'delete') return (
          <ConfirmDialog
            variant="danger"
            title="Delete this conversation?"
            subtitle="Archived conversation"
            message={<>The conversation and every message in it are <strong>deleted permanently</strong>.</>}
            details={subject}
            note="This can't be undone."
            noteIcon={AlertCircle}
            confirmLabel="Delete conversation"
            busy={resolving}
            busyLabel="Deleting…"
            onConfirm={handleDelete}
            onCancel={() => setConfirmAction(null)}
          />
        );
        return null;
      })()}
    </div>
  );
}