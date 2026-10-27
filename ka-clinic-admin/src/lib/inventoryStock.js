import { logActivity } from './activityLog.js';

// Vaccine inventory stock: the level labels the Inventory page and its export
// show, and the transactions that move stock when a dose, RIG or
// Anti-Tetanus entry is given or undone. Stock is counted in whole vials.

// ══════════════════════════════════════════════════════════════════════════
// Stock levels (Inventory page and export)
// ══════════════════════════════════════════════════════════════════════════
// Stock level rules shared by the Inventory page and its export dialog.
export const fmtUnit = (u) => u ? u.charAt(0).toUpperCase() + u.slice(1) : '';

/** Whole vials in stock (never below 0). */
export const vialsOf = (item) => Math.max(0, parseInt(item?.stock, 10) || 0);

/** "9 vials" / "1 vial". */
export const formatVials = (item) => {
  const n = vialsOf(item);
  return `${n} vial${n === 1 ? '' : 's'}`;
};

export function deriveStockStatus(item) {
  const stock = vialsOf(item);
  const min = parseInt(item.minStock, 10) || 10;
  if (stock <= 0) return 'out-of-stock';
  if (stock <= min) return 'low-stock';
  return 'in-stock';
}

export function deriveStockLabel(item) {
  const st = deriveStockStatus(item);
  if (st === 'out-of-stock') return 'Out of Stock';
  if (st === 'low-stock') return 'Low Stock';
  return 'In Stock';
}

/** YYYY-MM-DD expiry of an item, or ''. */
export const expiryOf = (item) => String(item?.expiryDate || item?.expiry || '').slice(0, 10);
/** Expired on or before `today` (clinic date): the item cannot be used. */
export const isExpired = (item, today) => {
  const e = expiryOf(item);
  return Boolean(e && today && e < today);
};
export const EXPIRED_NOTE = 'Expired';

// ══════════════════════════════════════════════════════════════════════════
// Giving or undoing a dose moves stock (Vaccination Tracker)
// ══════════════════════════════════════════════════════════════════════════
// Each move runs in one Firestore transaction with the patient record: it
// reads the saved record and the item, checks the dose or entry is still in
// the state the click assumed (so a double click or a second nurse cannot
// apply it twice), then writes the record, the stock and an append-only
// stockMovements entry together.
//
// Stock rules:
//   giving a dose / RIG / Anti-Tetanus   takes 1 vial from the chosen item.
//                    Refused when the item is at 0 or expired.
//   undoing / removing                   puts the 1 vial back on that item,
//                    only if it was really taken (stockDeducted).
//   item not in Inventory: still saved, no stock moves.
//   Doses and entries saved while stock was counted in mL (they carry an
//   `ml` amount) took part of a vial, so undoing them returns nothing; their
//   stock is corrected by hand in Inventory if needed.
export class DoseStockError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'missing' | 'stale' | 'out-of-stock' | 'expired'
  }
}

const stockStatus = (stock, minStock) => {
  const min = parseInt(minStock, 10) || 10;
  return stock <= 0 ? 'critical' : stock <= min ? 'warning' : 'in-stock';
};

/** The inventory fields after moving `delta` vials (-1 take, +1 return). */
function moveVials(item, delta, label, today = '') {
  const before = vialsOf(item);
  if (delta < 0) {
    if (isExpired(item, today)) throw new DoseStockError('expired', `${item?.name || label} expired on ${expiryOf(item)} and cannot be used.`);
    if (before + delta < 0) throw new DoseStockError('out-of-stock', `${item?.name || label} is out of stock in Inventory.`);
  }
  const after = before + delta;
  return { before, after, update: { stock: after, status: stockStatus(after, item.minStock), updatedAt: Date.now() } };
}

// A dose or entry saved while stock was counted in mL: undoing it returns nothing.
const wasMlEra = (x) => x?.ml !== undefined && x?.ml !== null;

/**
 * @param fs        { runTransaction, doc, collection, deleteField }
 * @param db        Firestore instance
 * @param readDoses (savedRecord) => doses with { key, label, date, status, brand, note },
 *                  status 'done' for given doses (the tracker's buildDoses)
 * @param today     YYYY-MM-DD (clinic date), stamped as completedAt
 */
export async function recordDoseChange(fs, db, {
  patientId, doseKey, give, brand = '', stockItemId = null, byUid = null, byName = '', attendingName = '', readDoses, today,
}) {
  const { runTransaction, doc, collection, deleteField } = fs;
  const vaxRef = doc(db, 'vaccinations', patientId);
  const invRef = stockItemId ? doc(db, 'inventory', stockItemId) : null;

  const result = await runTransaction(db, async (tx) => {
    const vSnap = await tx.get(vaxRef);
    const iSnap = invRef ? await tx.get(invRef) : null;
    if (!vSnap.exists()) throw new DoseStockError('missing', 'Patient record not found.');

    const saved = vSnap.data();
    const savedDoses = readDoses(saved);
    const rawSaved = Array.isArray(saved.doses) ? saved.doses : [];
    const idx = savedDoses.findIndex(d => d.key === doseKey);
    // Re-save, double click or another nurse: the dose is already in the
    // requested state, so nothing moves a second time.
    if (idx === -1 || (savedDoses[idx].status === 'done') === give) {
      throw new DoseStockError('stale', 'This dose was already updated.');
    }
    // Stock link plus who gave the dose and when, carried over unchanged for
    // every dose except the one being given / undone (a past dose's mL, if
    // it was saved under the mL system, is kept for the record).
    const stockOf = (i) => ({
      stockItemId: rawSaved[i]?.stockItemId, stockDeducted: rawSaved[i]?.stockDeducted,
      ml: rawSaved[i]?.ml, givenAt: rawSaved[i]?.givenAt, givenBy: rawSaved[i]?.givenBy, givenByName: rawSaved[i]?.givenByName,
      attendingName: rawSaved[i]?.attendingName,
    });

    const item = iSnap && iSnap.exists() ? iSnap.data() : null;
    let move = null;
    if (item && give) move = moveVials(item, -1, brand, today);
    else if (item && !give && stockOf(idx).stockDeducted !== false && !wasMlEra(stockOf(idx))) move = moveVials(item, +1, brand);

    const nextDoses = savedDoses.map((d, i) => {
      const base = { key: d.key, n: d.label, date: d.date, note: d.note || '', ...stockOf(i) };
      if (i !== idx) {
        const st = d.status === 'done' ? 'done' : 'pending';
        return { ...base, status: st, s: st, brand: d.brand || '' };
      }
      return give
        ? { ...base, status: 'done', s: 'done', brand, stockItemId: item ? stockItemId : '', stockDeducted: Boolean(move),
            ml: undefined, givenAt: Date.now(), givenBy: byUid || '', givenByName: byName || '', attendingName: attendingName || byName || '' }
        : { ...base, status: 'pending', s: 'pending', brand: '', stockItemId: '', stockDeducted: false,
            ml: undefined, givenAt: undefined, givenBy: undefined, givenByName: undefined, attendingName: undefined };
    }).map(d => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));

    const doneN = nextDoses.filter(d => d.status === 'done').length;
    const allDone = doneN === nextDoses.length;
    const wasDone = savedDoses.length > 0 && savedDoses.every(d => d.status === 'done');
    const completedAt = allDone ? (wasDone && saved.completedAt ? saved.completedAt : today) : null;

    tx.update(vaxRef, {
      doses: nextDoses,
      dose: `${doneN}/${nextDoses.length}`,
      status: allDone ? 'completed' : 'ongoing',
      completedAt: completedAt || deleteField(),
      ...(give ? { vaccineBrand: brand } : {}),
    });

    if (move) {
      tx.update(invRef, move.update);
      tx.set(doc(collection(db, 'stockMovements')), {
        patientId,
        doseKey,
        doseLabel: savedDoses[idx].label || '',
        direction: give ? 'deduct' : 'restore',
        itemId: stockItemId,
        itemName: item.name || '',
        qty: 1,
        stockBefore: move.before,
        stockAfter: move.after,
        byUid,
        at: Date.now(),
      });
    }
    return { before: move?.before ?? null, after: move?.after ?? null, itemName: item?.name || '', allDone, wasDone, moved: Boolean(move),
      doseLabel: savedDoses[idx].label || doseKey, statusBefore: savedDoses[idx].status === 'done' ? 'done' : 'pending' };
  });
  logActivity({
    action: 'dose.update', collection: 'vaccinations', docId: patientId, mrn: patientId,
    summary: `${give ? 'Gave' : 'Undid'} ${result.doseLabel}${give && brand ? ` (${brand})` : ''} for MRN ${patientId}`,
    changes: [
      { field: `doses.${doseKey}.status`, before: result.statusBefore, after: give ? 'done' : 'pending' },
      ...(give && brand ? [{ field: `doses.${doseKey}.brand`, before: null, after: brand }] : []),
      ...(result.moved ? [{ field: `stock (${result.itemName})`, before: String(result.before), after: String(result.after) }] : []),
    ],
  });
  return result;
}

// Category III treatments: RIG entries vs Anti-Tetanus entries. New entries
// carry `kind`; older ones are told apart by their product name.
export const isRigProduct = (product) => /\b(e?rig|equirab)\b/i.test(String(product || ''));
export const isRigEntry = (t) => (t?.kind ? t.kind === 'rig' : isRigProduct(t?.product));

/**
 * Amount on a RIG / Anti-Tetanus entry or a dose, for screens and PDFs:
 * "1 vial" for vial-based entries, the saved mL for ones recorded while
 * stock was counted in mL (or older entries), '' when nothing was saved.
 */
export function amountText(x) {
  const ml = x?.ml ?? x?.mg;
  if (ml !== undefined && ml !== null && ml !== '') return `${ml} mL`;
  const v = parseInt(x?.vials, 10);
  return v > 0 ? `${v} vial${v === 1 ? '' : 's'}` : '';
}

/**
 * Records or removes a Category III treatment (RIG or Anti-Tetanus). Giving
 * takes 1 vial from the chosen product's item; removing puts it back. The
 * entry is kept on the record as its own fields (kind, product, vials, date,
 * recordedByName, ...) in `treatments` and in rigTreatment /
 * antiTetanusTreatment, never in the dose array, so dose counts, progress and
 * Ongoing/Completed status are untouched.
 * Returns { before, after, moved, itemName, entry }.
 */
export async function recordTreatmentChange(fs, db, {
  patientId, give, kind = '', treatmentId = null, product = '', stockItemId = null, date = '', byUid = null, byName = '', attendingName = '', today = '',
}) {
  const { runTransaction, doc, collection, deleteField } = fs;
  const vaxRef = doc(db, 'vaccinations', patientId);
  const isRig = kind ? kind === 'rig' : isRigProduct(product);
  const sameKind = (t) => isRigEntry(t) === isRig;

  const result = await runTransaction(db, async (tx) => {
    const vSnap = await tx.get(vaxRef);
    if (!vSnap.exists()) throw new DoseStockError('missing', 'Patient record not found.');
    const saved = vSnap.data();
    const currentTreatments = Array.isArray(saved.treatments) ? saved.treatments : [];

    if (give) {
      // One RIG and one Anti-Tetanus entry per case: a double click or a
      // second nurse finds it already saved and nothing moves twice.
      if (currentTreatments.some(sameKind) || (isRig ? saved.rigTreatment : saved.antiTetanusTreatment)) {
        throw new DoseStockError('stale', `${isRig ? 'RIG' : 'Anti-Tetanus'} is already recorded for this patient.`);
      }
      const invRef = stockItemId ? doc(db, 'inventory', stockItemId) : null;
      const iSnap = invRef ? await tx.get(invRef) : null;
      const item = iSnap && iSnap.exists() ? iSnap.data() : null;
      const move = item ? moveVials(item, -1, product, today) : null;

      const entry = {
        id: treatmentId || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: isRig ? 'rig' : 'antiTetanus',
        product,
        stockItemId: item ? stockItemId : '',
        itemName: item?.name || '',
        vials: 1,
        date: date || new Date().toISOString().slice(0, 10),
        stockDeducted: Boolean(move),
        recordedAt: Date.now(),
        recordedBy: byUid || '',
        recordedByName: byName || '',
        attendingName: attendingName || byName || '',
      };
      tx.update(vaxRef, {
        treatments: [...currentTreatments, entry],
        ...(isRig ? { rigTreatment: entry, rigGiven: 'Yes (ERIG)' } : { antiTetanusTreatment: entry }),
      });
      if (move) {
        tx.update(invRef, move.update);
        tx.set(doc(collection(db, 'stockMovements')), {
          patientId, doseKey: entry.id, doseLabel: product, direction: 'deduct',
          itemId: stockItemId, itemName: item.name || '', qty: 1,
          stockBefore: move.before, stockAfter: move.after, byUid, at: Date.now(),
        });
      }
      return { before: move?.before ?? null, after: move?.after ?? null, moved: Boolean(move), itemName: item?.name || '', entry };
    }

    // Removing (unchecking) returns the vial that entry took.
    const target = currentTreatments.find(t => treatmentId && t.id === treatmentId)
      || currentTreatments.find(t => t.product === product)
      || (isRig ? saved.rigTreatment : saved.antiTetanusTreatment);
    if (!target) throw new DoseStockError('stale', 'This entry was already removed.');

    const tRef = target.stockDeducted && target.stockItemId && !wasMlEra(target) ? doc(db, 'inventory', target.stockItemId) : null;
    const tSnap = tRef ? await tx.get(tRef) : null;
    const targetItem = tSnap && tSnap.exists() ? tSnap.data() : null;
    const move = targetItem ? moveVials(targetItem, +1, target.product) : null;

    const nextTreatments = currentTreatments.filter(t => (target.id ? t.id !== target.id : t.product !== target.product));
    tx.update(vaxRef, {
      treatments: nextTreatments,
      ...(isRig
        ? { rigTreatment: deleteField(), rigGiven: nextTreatments.some(isRigEntry) ? 'Yes (ERIG)' : 'No' }
        : { antiTetanusTreatment: deleteField() }),
    });
    if (move) {
      tx.update(tRef, move.update);
      tx.set(doc(collection(db, 'stockMovements')), {
        patientId, doseKey: target.id || 'treatment', doseLabel: target.product, direction: 'restore',
        itemId: target.stockItemId, itemName: targetItem.name || '', qty: 1,
        stockBefore: move.before, stockAfter: move.after, byUid, at: Date.now(),
      });
    }
    return { before: move?.before ?? null, after: move?.after ?? null, moved: Boolean(move), itemName: targetItem?.name || '', entry: target };
  });
  const label = result.entry?.product || product || (isRig ? 'RIG' : 'Anti-Tetanus');
  logActivity({
    action: 'treatment.update', collection: 'vaccinations', docId: patientId, mrn: patientId,
    summary: `${give ? 'Recorded' : 'Removed'} ${label} for MRN ${patientId}`,
    changes: [
      { field: isRig ? 'rigTreatment' : 'antiTetanusTreatment', before: give ? null : label, after: give ? label : null },
      ...(result.moved ? [{ field: `stock (${result.itemName})`, before: String(result.before), after: String(result.after) }] : []),
    ],
  });
  return result;
}

/**
 * How a brand shows in a dropdown: just its name, plus a badge only when it
 * matters. Out-of-stock and expired batches are disabled.
 *   { disabled, badge: '' | 'Low stock' | 'Out of stock' | EXPIRED_NOTE, tone: 'amber' | 'red' }
 */
export function brandAvailability(item, today) {
  if (!item || item.id === 'current_selected' || item.id === 'current_assigned') return { disabled: false, badge: '', tone: '' };
  const st = deriveStockStatus(item);
  if (isExpired(item, today)) return { disabled: true, badge: EXPIRED_NOTE, tone: 'red' };
  if (st === 'out-of-stock') return { disabled: true, badge: 'Out of stock', tone: 'red' };
  if (st === 'low-stock') return { disabled: false, badge: 'Low stock', tone: 'amber' };
  return { disabled: false, badge: '', tone: '' };
}
