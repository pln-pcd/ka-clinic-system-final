// Batch 6 — manager-only. Reachability is enforced two layers deep:
// AdminDashboard only mounts this when useAuth().role === 'manager', and
// Firestore rules independently reject a staff account's list/get calls
// against admins/{uid} regardless of what the client does.

import Modal from '../../components/Modal';
import useDiscardGuard from '../../components/useDiscardGuard';
import {
  AlertTriangle,
  Mail,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import Pager, { paginate, useTableReserve } from '../../components/Pager';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import IconButton from '../../components/IconButton';
import SegmentedTabs from '../../components/SegmentedTabs';
import { BTN } from '../../lib/buttons';

// Row height of the admins table, used to reserve a full page of rows.
const ADMIN_ROW_H = 73;
import { auth } from '../../lib/firebase';
import { useLiveCollection } from '../../lib/liveStore';
import { postJson } from '../../lib/adminSession';
import Avatar from '../../components/Avatar';
import { useAdminAvatars } from '../../lib/adminAvatars';
import Toast from '../../components/Toast';
import { FieldError, useFieldErrors } from '../../components/FormValidation';

import { SkeletonRows } from '../../components/Skeleton';
const INVITE_RULES = {
  email: f => (!f.email.trim() ? "Enter the nurse's email address"
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) ? 'Enter a valid email, e.g. name@kaclinic.ph' : ''),
};

function formatDate(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? new Date(ts) : (ts?.toDate ? ts.toDate() : new Date(ts));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const formatRole = (role) => String(role).charAt(0).toUpperCase() + String(role).slice(1);

const STATUS_STYLE = {
  active: 'bg-slate-100 text-slate-700 border-slate-200',
  invited: 'bg-slate-100 text-slate-700 border-slate-200',
  revoked: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function ManageAdmins() {
  // Shared live data (lib/liveStore.js): instant on return visits.
  const adminsLive = useLiveCollection('admins');
  const admins = adminsLive.rows;
  const loading = !adminsLive.loaded;
  const [searchTerm, setSearchTerm] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const inviteV = useFieldErrors(INVITE_RULES, { email: inviteEmail }, 'invite-admin');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [requestCloseInvite, inviteDiscardDialog] = useDiscardGuard(inviteEmail, () => setInviteOpen(false), { resetKey: inviteOpen, enabled: inviteOpen });
  const [toast, setToast] = useState(null);
  const [busyUid, setBusyUid] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const avatars = useAdminAvatars();
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'invited' | 'revoked'
  const [page, setPage] = useState(1);
  // A new tab or search starts again from the first page.
  useEffect(() => { setPage(1); }, [activeTab, searchTerm]);
  const [copiedUid, setCopiedUid] = useState(null);


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

  function formatLocalInviteUrl(inviteUrl) {
    if (!inviteUrl) return '';
    try {
      const url = new URL(inviteUrl);
      return `${window.location.origin}${url.pathname}${url.search}`;
    } catch {
      return inviteUrl;
    }
  }

  async function handleInvite(e) {
    if (e) e.preventDefault();
    if (!inviteV.validate(['email'])) return;
    const email = inviteEmail.trim().toLowerCase();
    setInviteSending(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/admin-invites', { action: 'invite', email }, { Authorization: `Bearer ${idToken}` });
      if (!data.success) { showToast('error', data.error || 'Could not send the invite.'); return; }
      if (data.warning) {
        showToast('warning', data.warning);
      } else {
        showToast('success', data.message || `Invitation sent to ${email}.`);
      }
      if (data.inviteUrl) {
        navigator.clipboard?.writeText(formatLocalInviteUrl(data.inviteUrl));
      }
      setInviteEmail('');
      setInviteOpen(false);
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setInviteSending(false);
    }
  }

  // Sends the invite again to the same address.
  async function handleResend(admin) {
    setBusyUid(admin.uid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/admin-invites', { action: 'invite', email: admin.email }, { Authorization: `Bearer ${idToken}` });
      if (data.success) {
        if (data.warning) {
          showToast('warning', data.warning);
        } else {
          showToast('success', `Invitation sent to ${admin.email}.`);
        }
        if (data.inviteUrl) {
          navigator.clipboard?.writeText(formatLocalInviteUrl(data.inviteUrl));
        }
      } else {
        showToast('error', data.error || 'Could not resend the invite.');
      }
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
      const data = await postJson('/api/admin-invites', { action: 'revoke', uid: admin.uid }, { Authorization: `Bearer ${idToken}` });
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
      const data = await postJson('/api/admin-invites', { action: 'cancel', uid: admin.uid }, { Authorization: `Bearer ${idToken}` });
      showToast(data.success ? 'success' : 'error', data.success ? data.message : (data.error || 'Could not cancel the invite.'));
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setBusyUid(null);
      setConfirmCancel(null);
    }
  }

  async function handleDeleteRevoked(admin) {
    setBusyUid(admin.uid);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const data = await postJson('/api/admin-invites', { action: 'delete', uid: admin.uid }, { Authorization: `Bearer ${idToken}` });
      showToast(data.success ? 'success' : 'error', data.success ? data.message : (data.error || 'Could not delete this account.'));
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setBusyUid(null);
      setConfirmDelete(null);
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
  const { page: safePage, pages, rows: pageRows } = paginate(filtered, page);
  const [tableAreaRef, tableReserve] = useTableReserve(ADMIN_ROW_H);

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
            onClick={() => { setInviteEmail(''); inviteV.clear(); setInviteOpen(true); }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3B50DF] hover:bg-[#2F40B5] text-white text-sm font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
          >
            <UserPlus size={16} /> Invite Nurses
          </button>
        </div>

        {/* ── Main Active / Team Members Table Card ── */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          
          {/* Table Header with Tabs & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/60">
            
            {/* View Filter Tabs */}
            <SegmentedTabs
              label="Account filter"
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { key: 'all', label: 'All Accounts', count: activeCount },
                { key: 'invited', label: 'Invited', count: invitedCount },
                { key: 'revoked', label: 'Revoked', count: revokedCount },
              ]}
            />

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
                <IconButton icon={X} label="Clear search" size={28} iconSize={14} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setSearchTerm('')} />
              )}
            </div>
          </div>

          {/* The table area keeps the height of a full page, so the pager
              and the page below never move when the row count changes. */}
          <div ref={tableAreaRef} className="flex flex-col" style={{ minHeight: tableReserve }}>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No accounts found"
              text={searchTerm ? `No accounts match "${searchTerm}".` : activeTab === 'invited' ? 'No pending invitations.' : activeTab === 'revoked' ? 'No revoked accounts.' : 'No admin accounts registered yet.'}
              action={searchTerm ? (
                <button onClick={() => setSearchTerm('')} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 rounded-lg transition-all cursor-pointer">
                  Clear search
                </button>
              ) : null}
            />
          ) : (
            <div className="overflow-x-auto flex-1">
              <table className="kna-table w-full text-left border-collapse">
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
                  {pageRows.map(admin => {
                    const isCurrentUser = admin.uid === auth.currentUser?.uid;
                    const isManager = (admin.role || '').toLowerCase() === 'manager';
                    const isRevoked = admin.status === 'revoked';

                    return (
                      <tr key={admin.uid} className="hover:bg-slate-50/80 transition-colors">
                        
                        {/* Administrator Column */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar src={avatars[admin.uid]} alt={admin.name || admin.email || ''} size={36} />
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
                          <div className="flex items-center justify-center gap-1">
                            {activeTab === 'all' ? (
                              !isCurrentUser ? (
                                <IconButton bordered icon={UserX} label={`Revoke access for ${admin.name || admin.email}`} tone="dangerHover"
                                  onClick={() => setConfirmRevoke(admin)} disabled={busyUid === admin.uid} />
                              ) : (
                                <span className="text-xs text-slate-400 font-medium" aria-label="No actions for your own account">—</span>
                              )
                            ) : activeTab === 'invited' ? (
                              <>
                                <IconButton bordered icon={Send} label="Resend invitation email"
                                  onClick={() => handleResend(admin)} disabled={busyUid === admin.uid} />
                                <IconButton bordered icon={X} label="Revoke invite" tone="dangerHover"
                                  onClick={() => setConfirmCancel(admin)} disabled={busyUid === admin.uid} />
                              </>
                            ) : (
                              <>
                                {admin.email && (
                                  <IconButton bordered icon={UserPlus} label="Re-invite"
                                    onClick={() => handleResend(admin)} disabled={busyUid === admin.uid} />
                                )}
                                {admin.uid !== auth.currentUser?.uid && (
                                  <IconButton bordered icon={Trash2} label="Delete account" tone="dangerHover"
                                    onClick={() => setConfirmDelete(admin)} disabled={busyUid === admin.uid} />
                                )}
                              </>
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
          <Pager page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
        </div>
      </div>

      {/* ── Invite a Nurse modal (portaled to body to blur sidebar + header) ── */}
      {inviteOpen && (
        <Modal onClose={requestCloseInvite}>
          {inviteDiscardDialog}
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
            
            {/* Header Banner */}
            <div className="px-7 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center shrink-0 shadow-2xs">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Invite a Nurse</h3>
                  <p className="text-xs text-slate-400 font-normal mt-0.5">Invite a nurse to join K&amp;A Clinic as a staff member</p>
                </div>
              </div>
              <IconButton icon={X} label="Close" size={36} iconSize={18} onClick={requestCloseInvite} />
            </div>

            <form onSubmit={handleInvite} noValidate>
              <div className="kna-form-body">
                <div>
                  <label htmlFor="invite-admin-email" className="block text-sm font-semibold text-slate-500 mb-2">
                    Nurse's Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-[18px] h-[18px] text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      {...inviteV.field('email')}
                      autoFocus
                      type="email"
                      placeholder="nurse@kaclinic.ph"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="w-full bg-white border border-slate-300 pl-11 pr-4 py-3 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-[#3B50DF] focus:ring-1 focus:ring-[#3B50DF] transition-all"
                    />
                  </div>
                  {inviteV.error('email')
                    ? <FieldError v={inviteV} name="email" />
                    : <p className="text-xs text-slate-400 font-normal mt-2">We'll email the nurse an invitation to join K&amp;A Clinic as a staff member. The link expires in 48 hours.</p>}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={requestCloseInvite}
                  className={BTN.outline}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteSending}
                  className={BTN.primary}
                >
                  {inviteSending ? 'Sending Invitation…' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {confirmRevoke && (
        <ConfirmDialog
          variant="danger"
          icon={UserX}
          title="Revoke access?"
          subtitle="Administrator account"
          message={<>This account loses <strong>admin portal access</strong> right away.</>}
          details={[
            ['Name', confirmRevoke.name],
            ['Email', confirmRevoke.email],
            ['Role', confirmRevoke.role ? formatRole(confirmRevoke.role) : ''],
          ]}
          note="They are signed out now and can't sign in again until re-invited."
          confirmLabel="Revoke access"
          busy={busyUid === confirmRevoke.uid}
          busyLabel="Revoking…"
          onConfirm={() => handleRevoke(confirmRevoke)}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}

      {confirmCancel && (
        <ConfirmDialog
          variant="danger"
          icon={ShieldAlert}
          title="Revoke this invitation?"
          subtitle="Pending admin setup"
          message={<>The <strong>invitation link</strong> stops working immediately.</>}
          details={[
            ['Email', confirmCancel.email || confirmCancel.name],
            ['Role', confirmCancel.role ? formatRole(confirmCancel.role) : ''],
            ['Invited', formatDate(confirmCancel.invitedAt || confirmCancel.createdAt)],
          ]}
          note="You can invite them again later."
          confirmLabel="Revoke invite"
          busy={busyUid === confirmCancel.uid}
          busyLabel="Revoking…"
          onConfirm={() => handleCancelInvite(confirmCancel)}
          onCancel={() => setConfirmCancel(null)}
        />
      )}

      {confirmDelete && (() => {
        const who = confirmDelete.name || confirmDelete.email;
        return (
          <ConfirmDialog
            variant="danger"
            title={who ? 'Delete this account?' : 'Delete this pending invite?'}
            subtitle="Revoked admin"
            message={who
              ? <>The account and its sign-in are <strong>deleted permanently</strong>.</>
              : <>This pending invite and its link are <strong>deleted permanently</strong>.</>}
            details={[
              ['Name', confirmDelete.name],
              ['Email', confirmDelete.email],
              ['Status', 'Revoked'],
            ]}
            note="This can't be undone. Send a new invitation to give access again."
            noteIcon={AlertTriangle}
            confirmLabel="Delete account"
            busy={busyUid === confirmDelete.uid}
            busyLabel="Deleting…"
            onConfirm={() => handleDeleteRevoked(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        );
      })()}

      <Toast
        msg={toast?.text}
        type={toast?.type}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
