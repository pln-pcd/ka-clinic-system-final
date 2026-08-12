// Batch 6 — manager-only. Reachability is enforced two layers deep:
// AdminDashboard only mounts this when useAuth().role === 'manager', and
// Firestore rules independently reject a staff account's list/get calls
// against admins/{uid} regardless of what the client does.
import { collection, onSnapshot } from 'firebase/firestore';
import { Mail, RotateCcw, Search, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import Toast from '../components/Toast';

function formatDate(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : (ts?.toDate ? ts.toDate() : new Date(ts));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_STYLE = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  invited: 'bg-amber-50 text-amber-700 border-amber-200',
  revoked: 'bg-slate-100 text-slate-500 border-slate-200',
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

  const sorted = admins.slice().sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const filtered = sorted.filter(a =>
    (a.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto bg-[#F4F5F7]">
      <div className="px-7 py-6 max-w-screen-2xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Manage Admins</h2>
            <p className="text-sm text-slate-500 mt-1">Invite staff members, assign roles, and manage system access.</p>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#C8151A] hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <UserPlus size={16} /> Invite Admin
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table Header with Search Input */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-slate-600" />
              <h3 className="text-sm font-extrabold text-slate-800">Team Members</h3>
              <span className="ml-1 text-xs font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full">
                {filtered.length} account{filtered.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Search Input Box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search admins by name or email…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-300 pl-9 pr-3.5 py-2 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600 transition-all shadow-xs"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
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
              <p className="text-sm font-bold text-slate-700">No admins found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchTerm ? `No accounts match "${searchTerm}".` : 'No admin accounts registered yet.'}
              </p>
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 rounded-lg transition-all">
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
                    <th className="px-6 py-3.5 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(admin => (
                    <tr key={admin.uid} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs">
                            {(admin.name || admin.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-900 block">
                              {admin.name || <span className="text-slate-400 font-medium italic">Pending Setup</span>}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">{admin.uid === auth.currentUser?.uid ? 'Current Account (You)' : 'Team Member'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs font-bold text-slate-600">{admin.email}</td>
                      <td className="px-6 py-3.5">
                        <span className="text-[11px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {admin.role || 'Staff'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-extrabold capitalize ${STATUS_STYLE[admin.status] || STATUS_STYLE.revoked}`}>
                          {admin.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs font-semibold text-slate-500">{formatDate(admin.createdAt)}</td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {admin.status === 'invited' && (
                            <button
                              onClick={() => handleResend(admin)}
                              disabled={busyUid === admin.uid}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <RotateCcw size={13} /> Resend
                            </button>
                          )}
                          {admin.status !== 'revoked' && admin.uid !== auth.currentUser?.uid && (
                            <button
                              onClick={() => setConfirmRevoke(admin)}
                              disabled={busyUid === admin.uid}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <Trash2 size={13} /> Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invite Admin Modal Card — Bigger 580px Card with simple X icon */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)' }} onClick={() => setInviteOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Header Banner */}
            <div className="bg-[#1E293B] px-7 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white m-0 leading-tight">Invite New Administrator</h3>
                  <p className="text-[11px] text-slate-300 font-medium mt-1">Send portal invitation link to clinic staff</p>
                </div>
              </div>
              {/* Simple X Icon (No background circle) */}
              <button onClick={() => setInviteOpen(false)} className="text-slate-400 hover:text-white p-1 transition-colors cursor-pointer" title="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleInvite} className="p-6">
              <div className="mb-5">
                <label htmlFor="invite-admin-email" className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                  Staff Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="invite-admin-email"
                    autoFocus
                    type="email"
                    placeholder="staff@kaclinic.ph"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 pl-10 pr-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-1.5">An invitation email will be delivered to complete account setup.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteSending || !inviteEmail.trim()}
                  className="px-5 py-2 bg-[#C8151A] hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-60 cursor-pointer shadow-xs"
                >
                  {inviteSending ? 'Sending Invitation…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke confirm */}
      {confirmRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }} onClick={() => setConfirmRevoke(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-red-50 border border-red-100">
                <ShieldCheck size={24} className="text-red-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Revoke {confirmRevoke.name || confirmRevoke.email}?</h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                They'll be signed out immediately and won't be able to log back in until re-invited.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setConfirmRevoke(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(confirmRevoke)}
                disabled={busyUid === confirmRevoke.uid}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-60"
              >
                {busyUid === confirmRevoke.uid ? 'Revoking…' : 'Yes, Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        msg={toast?.text}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
