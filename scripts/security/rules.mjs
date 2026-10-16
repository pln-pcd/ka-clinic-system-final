import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel, serverTimestamp, query, limit, orderBy } from 'firebase/firestore';

// Never accept a live project or remote host. All test data is fictional.
const projectId = 'demo-ka-security';
const host = '127.0.0.1';
setLogLevel('silent');
const env = await initializeTestEnvironment({ projectId, firestore: {
  host, port: 8080, rules: readFileSync(process.env.RULES_PATH || 'ka-clinic-admin/firestore.rules', 'utf8'),
} });
const authTime = Math.floor(Date.now() / 1000);
const roles = ['anonymous', 'patient-own', 'patient-other', 'staff', 'manager', 'revoked', 'pending'];
const uid = { 'patient-own': 'security-a', 'patient-other': 'security-b', staff: 'security-staff', manager: 'security-manager', revoked: 'security-revoked', pending: 'security-pending' };
const clients = Object.fromEntries(roles.map(role => [role, role === 'anonymous' ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(uid[role], { email: `${uid[role]}@example.test`, auth_time: authTime, firebase: { sign_in_provider: 'custom' } }).firestore()]));
const adminRoles = ['staff', 'manager'];
const fixtures = {
  vaccinations: ['2026-001', { authUid: uid['patient-own'], email: 'security-a@example.test', isArchived: false, name: 'Simulated A' }],
  authorizedPatients: ['2026-001', { uid: uid['patient-own'], email: 'security-a@example.test', mrn: '2026-001', authorized: true, registered: true }],
  appointments: ['security-appt', { patientUid: uid['patient-own'], userId: uid['patient-own'], patientId: '2026-001', name: 'Simulated A', contactNumber: '0000000000', date: '2026-12-12', status: 'pending' }],
  inventory: ['security-item', { quantity: 10 }],
  incidents: ['security-incident', { isSimulated: true, simNo: 1, type: 'Bite', category: 'II', month: '2026-10', lat: 13, lng: 123 }],
  chatThreads: ['security-thread', { patientUid: uid['patient-own'], resolved: false, archived: false, lastMessage: '', lastMessageAt: Date.now() }],
  chatMessages: ['security-message', { threadId: 'security-thread', sender: 'patient', text: '<script>alert(1)</script>', createdAt: Date.now() }],
  patientNotifications: ['security-notification', { patientId: '2026-001', message: 'Simulated only' }],
  admins: ['security-manager', { role: 'manager', status: 'active', email: 'security-manager@example.test' }],
  patientTrustedDevices: ['security-a', { devices: {} }],
  patientAvatars: ['2026-001', { email: 'security-a@example.test', dataUrl: 'data:image/png;base64,AA==' }],
  adminAvatars: ['security-manager', { dataUrl: 'data:image/png;base64,AA==', updatedAt: Date.now() }],
  settings: ['security-config', { clinic: { name: 'Simulated clinic' } }],
  patientSessions: ['security-a_device', { uid: 'security-a', deviceId: 'device', revoked: false, label: 'Test' }],
  stockMovements: ['security-movement', { quantity: 1 }],
  securitySessions: [`security-a_${authTime}`, { uid: 'security-a', authTime, mrn: '2026-001', scope: 'patient', expiresAt: Date.now() + 3600000 }],
  otpVerifications: ['2026-001', { codeHash: 'test-hash' }],
  patientLoginOtps: ['security-a', { codeHash: 'test-hash' }],
  otps: ['security-manager', { codeHash: 'test-hash' }],
  passwordResets: ['security-manager', { codeHash: 'test-hash' }],
  loginAttempts: ['security-attempt', { attempts: 0 }],
  appointmentSlots: ['2026-12-12_0800', { date: '2026-12-12', time: '08:00', heldBy: 'security-a', createdAt: Date.now() }],
  invites: ['simulated-unguessable-invite', { email: 'invite@example.test', status: 'pending' }],
  patientChatState: ['security-a', { messageCount: 1 }],
  mrnRegistry: ['2026-050', { mrn: '2026-050', issuedAt: Date.now(), issuedBy: 'security-staff' }],
};
async function seed() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [role, id] of Object.entries(uid)) {
      if (['staff', 'manager', 'revoked'].includes(role)) await setDoc(doc(db, 'admins', id), {
        role: role === 'staff' ? 'staff' : 'manager', status: role === 'revoked' ? 'revoked' : 'active', email: `${id}@example.test`,
      });
      if (role !== 'pending') await setDoc(doc(db, 'securitySessions', `${id}_${authTime}`), {
        uid: id, authTime, mrn: role === 'patient-other' ? '2026-002' : '2026-001', scope: ['staff', 'manager', 'revoked'].includes(role) ? 'admin' : 'patient', expiresAt: Date.now() + 3600000,
      });
    }
    await setDoc(doc(db, 'authorizedPatients', '2026-002'), { uid: 'security-b', email: 'security-b@example.test', mrn: '2026-002', authorized: true, registered: true });
    await setDoc(doc(db, 'vaccinations', '2026-002'), { authUid: 'security-b', email: 'security-b@example.test', isArchived: false });
    for (const [collection, [id, data]] of Object.entries(fixtures)) await setDoc(doc(db, collection, id), data);
  });
}
function expected(collection, role, op) {
  const admin = adminRoles.includes(role), own = role === 'patient-own';
  if (collection === 'appointmentSlots') return op === 'read' || admin || (own && op === 'create');
  if (collection === 'invites') return op === 'read';
  if (collection === 'mrnRegistry') return admin && ['read', 'create'].includes(op);
  if (collection === 'patientChatState') return ['read', 'delete'].includes(op) && (admin || own);
  if (['securitySessions', 'patientTrustedDevices', 'otpVerifications', 'patientLoginOtps', 'otps', 'passwordResets', 'loginAttempts'].includes(collection)) return false;
  if (collection === 'admins') return op === 'read' && role === 'manager';
  if (collection === 'adminAvatars') return admin && (op === 'read' || role === 'manager');
  if (collection === 'stockMovements') return admin && ['read', 'create'].includes(op);
  if (collection === 'patientSessions') return own;
  if (collection === 'authorizedPatients') return op === 'read' ? admin || own : admin;
  if (collection === 'vaccinations') return op === 'read' ? admin || own : admin;
  if (collection === 'patientAvatars' || collection === 'patientNotifications') return op === 'read' ? admin || own : admin;
  if (collection === 'appointments') return admin || (own && op !== 'delete');
  if (collection === 'chatThreads') return admin || (own && op !== 'delete');
  if (collection === 'chatMessages') return admin || (own && ['read', 'create'].includes(op));
  return admin;
}
const results = [];
async function check(id, description, expectedAllowed, run) {
  let allowed = true, error = '';
  try { await run(); } catch (e) { allowed = false; error = e.code || e.message; }
  const pass = allowed === expectedAllowed && (allowed || error.includes('permission-denied'));
  results.push({ id, description, steps: 'Seed fictional fixture; direct Firebase SDK request with role token.', expected: expectedAllowed ? 'Allowed' : 'PERMISSION_DENIED', actual: allowed ? 'Allowed' : error, status: pass ? 'PASS' : 'FAIL' });
  if (!pass) console.log(`FAIL ${id}: expected ${expectedAllowed ? 'allow' : 'deny'}, actual ${allowed ? 'allow' : error}`);
}
try {
  await env.clearFirestore();
  await seed();
  for (const [collection, [id, data]] of Object.entries(fixtures)) {
    for (const role of roles) for (const op of ['read', 'create', 'update', 'delete']) {
      await env.withSecurityRulesDisabled(async ctx => {
        const ref = doc(ctx.firestore(), collection, id);
        if (op === 'create') await deleteDoc(ref); else await setDoc(ref, data);
      });
      const ref = doc(clients[role], collection, id);
      const patch = collection === 'appointments' ? { status: 'cancelled' }
        : collection === 'chatThreads' ? { resolved: true, closedBy: 'patient', closedAt: Date.now() }
        : collection === 'adminAvatars' ? { updatedAt: Date.now() }
        : collection === 'patientSessions' ? { label: 'Updated test' }
        : collection === 'incidents' ? { mapHidden: true } : { securityTest: true };
      await check(`RULE-${collection}-${role}-${op}`, `${role}: ${op} ${collection}`, expected(collection, role, op), () => {
        if (op === 'read') return getDoc(ref);
        if (op === 'create') return setDoc(ref, data);
        if (op === 'update') return updateDoc(ref, patch);
        return deleteDoc(ref);
      });
      // Restore parent/ownership/session documents before next collection test.
      await seed();
    }
  }
  const attacks = [
    ['patient UID takeover', 'authorizedPatients', '2026-002', { uid: 'security-a' }],
    ['appointment ownership takeover', 'appointments', 'security-appt', { status: 'cancelled', patientUid: 'security-b' }],
    ['appointment clinical edit', 'appointments', 'security-appt', { status: 'cancelled', name: 'Attacker' }],
    ['thread ownership takeover', 'chatThreads', 'security-thread', { patientUid: 'security-b' }],
    ['thread hidden from staff', 'chatThreads', 'security-thread', { archived: true }],
  ];
  for (const [name, collection, id, patch] of attacks) await check(`RULE-attack-${collection}-${name}`, name, false, () => updateDoc(doc(clients['patient-own'], collection, id), patch));
  await check('RULE-chat-staff-spoof', 'Patient cannot impersonate staff', false, () => setDoc(doc(clients['patient-own'], 'chatMessages', 'spoof'), { threadId: 'security-thread', sender: 'admin', text: 'Fake staff', createdAt: Date.now() }));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'vaccinations', '2026-001'), { isArchived: true }));
  await check('RULE-archived-read', 'Archived patient cannot read clinical record', false, () => getDoc(doc(clients['patient-own'], 'vaccinations', '2026-001')));
  await seed();
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'securitySessions', `security-manager_${authTime}`), { expiresAt: Date.now() - 3600000 }));
  await check('RULE-idle-expired', 'Expired admin session cannot read clinical records', false, () => getDoc(doc(clients.manager, 'vaccinations', '2026-001')));
  await seed();
  await env.withSecurityRulesDisabled(ctx => deleteDoc(doc(ctx.firestore(), 'securitySessions', `security-a_${authTime}`)));
  await check('RULE-pending-own', 'Patient without OTP cannot read their own record', false, () => getDoc(doc(clients['patient-own'], 'vaccinations', '2026-001')));
  await seed();
  // ── 1.0.5: one MRN per patient, history, Activity Log, booking notes ──
  // A record carrying the patient's email under ANOTHER MRN is still not
  // theirs: reads follow the MRN of the verified session only.
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'vaccinations', '2026-003'), { email: 'security-a@example.test', isArchived: false, caseHistory: [{ service: 'PEP' }] }));
  await check('RULE-mrn-other-by-email', 'Patient cannot read another MRN that carries their email', false, () => getDoc(doc(clients['patient-own'], 'vaccinations', '2026-003')));
  await check('RULE-mrn-other-patient', "Patient cannot read another patient's record or history", false, () => getDoc(doc(clients['patient-own'], 'vaccinations', '2026-002')));
  await check('RULE-history-own', 'Patient reads own record including caseHistory', true, () => getDoc(doc(clients['patient-own'], 'vaccinations', '2026-001')));
  // MRN counter never rewinds; registry is permanent.
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'settings', 'counters'), { currentYear: 2026, lastSequence: 53 }));
  await check('RULE-counter-forward', 'Staff can move the MRN counter forward', true, () => setDoc(doc(clients.staff, 'settings', 'counters'), { currentYear: 2026, lastSequence: 54 }, { merge: true }));
  await check('RULE-counter-rewind', 'MRN counter cannot be rewound', false, () => setDoc(doc(clients.manager, 'settings', 'counters'), { currentYear: 2026, lastSequence: 10 }, { merge: true }));
  await check('RULE-counter-delete', 'MRN counter cannot be deleted', false, () => deleteDoc(doc(clients.manager, 'settings', 'counters')));
  await check('RULE-registry-delete', 'Issued MRN cannot be removed from the registry', false, () => deleteDoc(doc(clients.manager, 'mrnRegistry', '2026-050')));
  // Activity Log: append-only, own uid and live role, managers read.
  const entry = (who, role, extra = {}) => ({ actorUid: uid[who], actorName: 'Test', actorRole: role, action: 'patient.update', collection: 'vaccinations', docId: '2026-001', mrn: '2026-001', summary: 'Edited test', changes: [{ field: 'name', before: 'A', after: 'B' }], createdAt: serverTimestamp(), ...extra });
  await check('RULE-log-staff-create', 'Nurse writes a log entry as themselves', true, () => setDoc(doc(clients.staff, 'activityLog', 'log-1'), entry('staff', 'staff')));
  await check('RULE-log-forge-actor', 'Nurse cannot write an entry as someone else', false, () => setDoc(doc(clients.staff, 'activityLog', 'log-2'), entry('manager', 'manager')));
  await check('RULE-log-forge-role', 'Nurse cannot claim the manager role', false, () => setDoc(doc(clients.staff, 'activityLog', 'log-3'), entry('staff', 'manager')));
  await check('RULE-log-forge-time', 'Entry must carry the server time', false, () => setDoc(doc(clients.staff, 'activityLog', 'log-4'), entry('staff', 'staff', { createdAt: new Date('2020-01-01') })));
  await check('RULE-log-patient-create', 'Patient cannot write log entries', false, () => setDoc(doc(clients['patient-own'], 'activityLog', 'log-5'), entry('patient-own', '')));
  await check('RULE-log-staff-read', 'Nurse cannot read a log entry', false, () => getDoc(doc(clients.staff, 'activityLog', 'log-1')));
  await check('RULE-log-staff-list', 'Nurse cannot list the log', false, () => getDocs(query(collection(clients.staff, 'activityLog'), orderBy('createdAt', 'desc'), limit(5))));
  await check('RULE-log-patient-read', 'Patient cannot read the log', false, () => getDoc(doc(clients['patient-own'], 'activityLog', 'log-1')));
  await check('RULE-log-manager-read', 'Manager reads the log', true, () => getDoc(doc(clients.manager, 'activityLog', 'log-1')));
  await check('RULE-log-manager-list', 'Manager lists the log newest first', true, () => getDocs(query(collection(clients.manager, 'activityLog'), orderBy('createdAt', 'desc'), limit(5))));
  await check('RULE-log-manager-update', 'Manager cannot edit a log entry', false, () => updateDoc(doc(clients.manager, 'activityLog', 'log-1'), { summary: 'changed' }));
  await check('RULE-log-manager-delete', 'Manager cannot delete a log entry', false, () => deleteDoc(doc(clients.manager, 'activityLog', 'log-1')));
  await check('RULE-log-staff-delete', 'Nurse cannot delete a log entry', false, () => deleteDoc(doc(clients.staff, 'activityLog', 'log-1')));
  // Booking notes: optional, at most 300 characters.
  const booking = (extra) => ({ status: 'pending', patientUid: uid['patient-own'], userId: uid['patient-own'], patientId: '2026-001', name: 'Simulated A', contactNumber: '0000000000', date: '2026-12-19', time: '9:00 AM - 10:00 AM', type: 'PEP', ...extra });
  await check('RULE-appt-note-ok', 'Patient books with a 300-character note', true, () => setDoc(doc(clients['patient-own'], 'appointments', 'note-ok'), booking({ notes: 'x'.repeat(300) })));
  await check('RULE-appt-no-note', 'Patient books without a note', true, () => setDoc(doc(clients['patient-own'], 'appointments', 'note-none'), booking({})));
  await check('RULE-appt-note-long', 'A note over 300 characters is refused', false, () => setDoc(doc(clients['patient-own'], 'appointments', 'note-long'), booking({ notes: 'x'.repeat(301) })));
  await seed();
  // Staff chat: a patient's send = message create + thread bump; both allowed
  // for their own open thread only; status/unread only to pending/true.
  await check('RULE-chat-send-message', 'Patient sends a message in their own thread', true, () => setDoc(doc(clients['patient-own'], 'chatMessages', 'send-1'), { threadId: 'security-thread', sender: 'patient', senderName: 'A', text: 'Hello', createdAt: Date.now() }));
  await check('RULE-chat-send-bump', 'Patient bumps their own thread after sending', true, () => updateDoc(doc(clients['patient-own'], 'chatThreads', 'security-thread'), { lastMessage: 'Hello', lastMessageAt: Date.now(), status: 'pending', unread: true }));
  await check('RULE-chat-status-replied', 'Patient cannot mark their thread as replied', false, () => updateDoc(doc(clients['patient-own'], 'chatThreads', 'security-thread'), { status: 'replied' }));
  await check('RULE-chat-unread-false', "Patient cannot clear staff's unread flag", false, () => updateDoc(doc(clients['patient-own'], 'chatThreads', 'security-thread'), { unread: false }));
  await check('RULE-chat-other-send', "Patient cannot send into another patient's thread", false, () => setDoc(doc(clients['patient-other'], 'chatMessages', 'send-2'), { threadId: 'security-thread', sender: 'patient', senderName: 'B', text: 'Hi', createdAt: Date.now() }));
  await check('RULE-chat-other-bump', "Patient cannot update another patient's thread", false, () => updateDoc(doc(clients['patient-other'], 'chatThreads', 'security-thread'), { lastMessage: 'x', lastMessageAt: Date.now(), status: 'pending', unread: true }));
  await check('RULE-chat-other-read', "Patient cannot read another patient's thread", false, () => getDoc(doc(clients['patient-other'], 'chatThreads', 'security-thread')));
  await check('RULE-chat-staff-reply', 'Staff reply in a patient thread', true, () => setDoc(doc(clients.staff, 'chatMessages', 'reply-1'), { threadId: 'security-thread', sender: 'admin', senderName: 'K&A Clinic', text: 'Hi', createdAt: Date.now() }));
  const guestClient = env.authenticatedContext('security-guest', { auth_time: authTime, firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await check('RULE-chat-guest-thread', 'Guest cannot open a staff thread', false, () => setDoc(doc(guestClient, 'chatThreads', 'guest-thread'), { patientUid: 'security-guest', resolved: false, archived: false }));
  await seed();
  const passwordClient = env.authenticatedContext('security-a', { email: 'security-a@example.test', auth_time: authTime, firebase: { sign_in_provider: 'password' } }).firestore();
  await check('RULE-password-provider', 'Password-only SDK sign-in cannot bypass the gateway', false, () => getDoc(doc(passwordClient, 'vaccinations', '2026-001')));
} finally {
  await env.cleanup();
}
mkdirSync('docs/security-results', { recursive: true });
const file = process.argv.includes('--before') ? 'rules-before.json' : 'rules-after.json';
writeFileSync(`docs/security-results/${file}`, JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`Rules: ${results.length - failed}/${results.length} PASS; ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
