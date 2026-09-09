// Batch 6 — manager-only. Reachability is enforced two layers deep:
// AdminDashboard only mounts this when useAuth().role === 'manager', and
// Firestore rules independently reject a staff account's list/get calls
// against admins/{uid} regardless of what the client does.
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Building2,
  Check,
  Copy,
  Mail,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { auth, db } from '../lib/firebase';
import Toast from '../components/Toast';

function formatDate(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : (ts?.toDate ? ts.toDate() : new Date(ts));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_STYLE = {
  active: 'bg-slate-100 text-slate-700 border-slate-200',
  invited: 'bg-slate-100 text-slate-700 border-slate-200',
  revoked: 'bg-slate-100 text-slate-700 border-slate-200',
};

async function postJson(url, body, idToken) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function ManageAdmins() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [toast, setToast] = useState(null);
  const [busyUid, setBusyUid] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'invited' | 'revoked'
  const [copiedUid, setCopiedUid] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'admins'), snap => {
      setAdmins(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  function showToast(type, text) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }

  function handleCopyEmail(email, uid) {
    if (!email) return;
    navigator.clipboard?.writeText(email);
    setCopiedUid(uid);
    showToast('success', `Copied ${email} to clipboard`);
    setTimeout(() => setCopiedUid(null), 2000);
  }

  async function handleInvite(e) {
    if (e) e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviteSending(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/admin-invites', { action: 'invite', email }, idToken);
      if (!data.success) { showToast('error', data.error || 'Could not send the invite.'); return; }
      showToast('success', data.message || 'Invite sent.');
      setInviteEmail('');
      setInviteOpen(false);
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setInviteSending(false);
    }
  }

  async function handleResend(admin) {
    setBusyUid(admin.uid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/admin-invites', { action: 'invite', email: admin.email }, idToken);
      showToast(data.success ? 'success' : 'error', data.success ? `Invite resent to ${admin.email}.` : (data.error || 'Could not resend the invite.'));
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setBusyUid(null);
    }
  }

  async function handleRevoke(admin) {
    setBusyUid(admin.uid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/admin-invites', { action: 'revoke', uid: admin.uid }, idToken);
      showToast(data.success ? 'success' : 'error', data.success ? data.message : (data.error || 'Could not revoke this account.'));
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setBusyUid(null);
      setConfirmRevoke(null);
    }
  }

  async function handleCancelInvite(admin) {
    setBusyUid(admin.uid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/admin-invites', { action: 'cancel', uid: admin.uid }, idToken);
      showToast(data.success ? 'success' : 'error', data.success ? data.message : (data.error || 'Could not cancel the invite.'));
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setBusyUid(null);
      setConfirmCancel(null);
    }
  }

  const sorted = admins.slice().sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
  const activeAdmins = sorted.filter(a => a.status === 'active');
  const invitedAdmins = sorted.filter(a => a.status === 'invited');
  const revokedAdmins = sorted.filter(a => a.status === 'revoked');

  const activeCount = activeAdmins.length;
  const invitedCount = invitedAdmins.length;
  const revokedCount = revokedAdmins.length;

  const filtered = sorted.filter(a => {
    const matchesSearch =
      (a.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.role || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (activeTab === 'all') return a.status === 'active';
    if (activeTab === 'invited') return a.status === 'invited';
    if (activeTab === 'revoked') return a.status === 'revoked';
    return true;
  });

  const stats = [
    { label: 'Total Accounts', value: admins.length, sub: 'Registered & Invited', icon: Users, color: '#3B50DF', tint: '#EEF2FF', border: '#E0E7FF' },
    { label: 'Active Admins', value: activeCount, sub: 'Full Portal Access', icon: ShieldCheck, color: '#059669', tint: '#ECFDF5', border: '#A7F3D0' },
    { label: 'Pending Invites', value: invitedCount, sub: 'Awaiting Setup', icon: Mail, color: '#D97706', tint: '#FEF3C7', border: '#FDE68A' },
    { label: 'Revoked Access', value: revokedCount, sub: 'Disabled Accounts', icon: UserX, color: '#DC2626', tint: '#FEF2F2', border: '#FECACA' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#F0F4FA]">
      <div className="px-7 py-6 max-w-screen-2xl mx-auto space-y-6">

        {/* ── Page Title Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Manage Admins</h2>
            <p className="text-sm text-slate-500 mt-1">Invite staff members, assign roles, and manage system access.</p>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3B50DF] hover:bg-[#2F40B5] text-white text-sm font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
          >
            <UserPlus size={16} /> Invite Admin
          </button>
        </div>

        {/* ── Main Active / Team Members Table Card ── */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          
          {/* Table Header with Tabs & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/60">
            
            {/* View Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Accounts ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('invited')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'invited'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Invited ({invitedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('revoked')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'revoked'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Revoked ({revokedCount})
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search admins by name or email…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-300 pl-9 pr-8 py-2 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3B50DF] focus:ring-1 focus:ring-[#3B50DF] transition-all shadow-xs"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-sm font-semibold text-slate-400">Loading team accounts…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">No accounts found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchTerm ? `No accounts match "${searchTerm}".` : 'No admin accounts registered yet.'}
              </p>
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 rounded-lg transition-all cursor-pointer">
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Administrator</th>
                    <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Email Address</th>
                    <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Date Invited</th>
                    <th className="px-6 py-3.5 text-center text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(admin => {
                    const isCurrentUser = admin.uid === auth.currentUser?.uid;
                    const isManager = (admin.role || '').toLowerCase() === 'manager';
                    const isRevoked = admin.status === 'revoked';

                    return (
                      <tr key={admin.uid} className="hover:bg-slate-50/80 transition-colors">
                        
                        {/* Administrator Column */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs">
                              {(admin.name || admin.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-sm font-bold text-slate-900 block">
                                {admin.name || <span className="text-slate-400 font-medium italic">Pending Setup</span>}
                              </span>
                              <span className="text-[11px] text-slate-400 font-medium">
                                {isCurrentUser ? 'Current Account (You)' : isManager ? 'Clinic Administrator' : 'Team Member'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Email Column */}
                        <td className="px-6 py-3.5 text-xs font-bold text-slate-600">
                          {admin.email || '—'}
                        </td>

                        {/* Role Column */}
                        <td className="px-6 py-3.5">
                          <span className="text-[11px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                            {admin.role || 'Staff'}
                          </span>
                        </td>

                        {/* Status Column */}
                        <td className="px-6 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-bold capitalize ${STATUS_STYLE[admin.status] || STATUS_STYLE.active}`}>
                            {admin.status}
                          </span>
                        </td>

                        {/* Date Invited Column — shows when the invite was last
                            sent, so pressing Resend visibly updates the row. */}
                        <td className="px-6 py-3.5 text-xs font-semibold text-slate-500">
                          {formatDate(admin.invitedAt || admin.createdAt)}
                        </td>

                        {/* Actions Column */}
                        <td className="px-6 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {activeTab === 'all' ? (
                              /* All Accounts tab: ONLY Revoke button */
                              !isCurrentUser ? (
                                <button
                                  onClick={() => setConfirmRevoke(admin)}
                                  disabled={busyUid === admin.uid}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <Trash2 size={13} /> Revoke
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 font-medium italic">—</span>
                              )
                            ) : activeTab === 'invited' ? (
                              /* Invited tab: Resend button AND Cancel Invite button */
                              <>
                                <button
                                  onClick={() => handleResend(admin)}
                                  disabled={busyUid === admin.uid}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <RotateCcw size={13} /> Resend
                                </button>
                                <button
                                  onClick={() => setConfirmCancel(admin)}
                                  disabled={busyUid === admin.uid}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <X size={13} /> Cancel Invite
                                </button>
                              </>
                            ) : (
                              /* Revoked tab: Untouched (Re-invite button) */
                              <button
                                onClick={() => handleResend(admin)}
                                disabled={busyUid === admin.uid}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#3B50DF] bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                <UserPlus size={13} /> Re-invite
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Invite Admin Modal Card (Portaled to body to blur sidebar + header) ── */}
      {inviteOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setInviteOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
            
            {/* Header Banner */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center shrink-0 shadow-2xs">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Invite New Administrator</h3>
                  <p className="text-[11px] text-slate-400 font-normal mt-0.5">Send portal invitation link to clinic staff</p>
                </div>
              </div>
              <button
                onClick={() => setInviteOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleInvite}>
              <div className="p-6">
                <div>
                  <label htmlFor="invite-admin-email" className="block text-xs font-semibold text-slate-500 mb-1.5">
                    Staff Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="invite-admin-email"
                      autoFocus
                      type="email"
                      placeholder="staff@kaclinic.ph"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="w-full bg-white border border-slate-300 pl-10 pr-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#3B50DF] focus:ring-1 focus:ring-[#3B50DF] transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal mt-1.5">An invitation email will be delivered to complete account setup.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteSending || !inviteEmail.trim()}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#3B50DF] hover:bg-[#2F40B5] text-white cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                >
                  {inviteSending ? 'Sending Invitation…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── Revoke Confirm Modal (Portaled to body) ── */}
      {confirmRevoke && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setConfirmRevoke(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-rose-50/60 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 shadow-2xs">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Revoke Access?</h3>
                  <p className="text-[11px] text-slate-500 font-normal mt-0.5">Administrator Deactivation</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmRevoke(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to revoke portal access for <strong className="text-slate-900">{confirmRevoke.name || confirmRevoke.email}</strong>?
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                They will be signed out immediately and won't be able to access the admin portal until re-invited.
              </p>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setConfirmRevoke(null)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRevoke(confirmRevoke)}
                disabled={busyUid === confirmRevoke.uid}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busyUid === confirmRevoke.uid ? 'Revoking…' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Cancel Invite Confirm Modal (Portaled to body) ── */}
      {confirmCancel && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} onClick={() => setConfirmCancel(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-rose-50/60 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 shadow-2xs">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Cancel Invitation?</h3>
                  <p className="text-[11px] text-slate-500 font-normal mt-0.5">Pending Admin Setup</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmCancel(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to cancel the invitation for <strong className="text-slate-900">{confirmCancel.email || confirmCancel.name}</strong>?
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                Their invitation link will be invalidated immediately.
              </p>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setConfirmCancel(null)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
              >
                Keep Invite
              </button>
              <button
                type="button"
                onClick={() => handleCancelInvite(confirmCancel)}
                disabled={busyUid === confirmCancel.uid}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busyUid === confirmCancel.uid ? 'Cancelling…' : 'Cancel Invite'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Toast
        msg={toast?.text}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
