// ERIG (equine rabies immunoglobulin) on a patient record.
//
// Category III exposures need ERIG with the first vaccine dose. It is recorded
// in the Vaccination Tracker's dose popup (recordErigChange in
// inventoryStock.js) and saved on the record as:
//   erig: { given: true, vials, date, stockItemId, itemName, stockDeducted,
//           recordedAt, recordedBy, recordedByName }
// Records registered before that kept a yes/no answer from the Add Patient
// form in `rigGiven` ("Yes (ERIG)" / "No"); it is still read so their status
// shows correctly. recordErigChange keeps `rigGiven` in step for the same
// reason.

export const isCategoryIII = (p) => {
  const cat = String(p?.cat || '').replace(/^Category\s+/i, '').trim().toUpperCase();
  return cat === 'III';
};

// Inventory items that are ERIG (same rule as the inventory report's
// "Rabies Immunoglobulin (RIG)" group).
export const isErigItem = (item) => /immunoglobulin|\berig\b|\brig\b/i.test(String(item?.name || ''));

/**
 * { required, given, vials, date, itemName, legacy }
 *   legacy: given according to the old intake answer, with no tracker entry.
 */
export function erigStatus(p) {
  const required = isCategoryIII(p);
  const e = p?.erig;
  if (e && e.given) {
    return { required, given: true, vials: Number(e.vials) || 0, date: e.date || '', itemName: e.itemName || '', legacy: false };
  }
  const legacy = /ERIG/i.test(String(p?.rigGiven || ''));
  return { required, given: legacy, vials: 0, date: legacy ? String(p?.date || '').slice(0, 10) : '', itemName: '', legacy };
}

// One-line status for the record view and the patient report, e.g.
// "Given · 2 vials · Oct 7, 2026", "Required, not yet recorded", "Not required".
export function erigStatusLabel(p, fmtDate = (d) => d) {
  const s = erigStatus(p);
  if (s.given) {
    const parts = ['Given'];
    if (s.vials) parts.push(`${s.vials} vial${s.vials === 1 ? '' : 's'}`);
    if (s.date) parts.push(fmtDate(s.date));
    if (s.legacy) parts.push('recorded at registration');
    return parts.join(' · ');
  }
  return s.required ? 'Required (Category III), not yet recorded' : 'Not required';
}
