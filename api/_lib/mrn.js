// The canonical, stored MRN format across this whole system is "<year>-<seq>"
// with NO "MRN-" prefix (e.g. "2026-001") — that's what ka-clinic-admin/src/
// patients.jsx getAndIncrementNextMRN() actually writes as the Firestore doc
// ID, and what patient-app/config/firebase.ts normalizeMRN() and
// firestore.rules' isValidPatientBooking() both already assume. This mirrors
// that same normalization so a patient typing "MRN-2026-001", "mrn-2026-1",
// or "2026-001" all resolve to the same real document.
export function normalizeMRN(raw) {
  if (!raw) return '';
  const clean = String(raw).trim().toUpperCase().replace(/^MRN-?/, '');
  if (!clean) return '';
  const m = clean.match(/^(\d{4})-(\d+)$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(3, '0')}`;
  }
  return clean;
}
