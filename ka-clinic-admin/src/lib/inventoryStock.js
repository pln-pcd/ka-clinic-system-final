// Vaccine inventory stock: the level labels the Inventory page and its export
// show, and the transaction that moves stock when a dose is given or undone.

// ══════════════════════════════════════════════════════════════════════════
// Stock levels (Inventory page and export)
// ══════════════════════════════════════════════════════════════════════════
// Stock level rules shared by the Inventory page and its export dialog.
export const fmtUnit = (u) => u ? u.charAt(0).toUpperCase() + u.slice(1) : '';

/**
 * Returns the pooled stock in mL for an item, avoiding floating-point drift.
 */
export function getItemStockMl(item) {
  if (!item) return 0;
  if (item.stockMl !== undefined && item.stockMl !== null) {
    return Math.max(0, Math.round(Number(item.stockMl) * 100) / 100);
  }
  // Fallback for transition from stockMg if present
  if (item.stockMg !== undefined && item.stockMg !== null) {
    return Math.max(0, Math.round(Number(item.stockMg) * 100) / 100);
  }
  const mlPerVial = parseFloat(item.mlPerVial || item.mgPerVial);
  if (mlPerVial > 0) {
    const vials = Math.max(0, parseInt(item.stock, 10) || 0);
    return Math.round(vials * mlPerVial * 100) / 100;
  }
  return null;
}

// Backward-compatible alias
export const getItemStockMg = getItemStockMl;

/**
 * Whole vials in stock, e.g. "9 vials". The mL left in an opened vial is not
 * shown here; it is part of the total mL shown beside it (9.5 mL total).
 */
export function formatStockVials(item) {
  if (!item) return '';
  const mlPerVial = parseFloat(item.mlPerVial || item.mgPerVial);
  if (!mlPerVial || mlPerVial <= 0) return 'Set mL per vial';
  const vialHund = Math.round(mlPerVial * 100);
  const vials = vialHund > 0 ? Math.floor(Math.round((getItemStockMl(item) ?? 0) * 100) / vialHund) : 0;
  return `${vials} vial${vials === 1 ? '' : 's'}`;
}

export function deriveStockStatus(item) {
  const mlPerVial = parseFloat(item.mlPerVial || item.mgPerVial);
  if (mlPerVial > 0) {
    const ml = getItemStockMl(item);
    const minVials = parseInt(item.minStock, 10) || 10;
    const minMl = Math.round(minVials * mlPerVial * 100) / 100;
    if (ml === null || ml <= 0) return 'out-of-stock';
    if (ml <= minMl) return 'low-stock';
    return 'in-stock';
  }
  const stock = parseInt(item.stock, 10) || 0;
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

// ══════════════════════════════════════════════════════════════════════════
// Giving or undoing a dose moves stock (Vaccination Tracker)
// ══════════════════════════════════════════════════════════════════════════
// Every amount is moved as whole hundredths of a mL (integers), so repeated
// gives and undos never drift: 5.00 − 0.20 − 0.20 − 0.50 is 410 hundredths,
// stored as 4.1. The pool is the item's total mL; `stock` (whole vials) is
// always written alongside as floor(pool / mL per vial), so the list's
// whole vials and the total mL can never disagree. Each move runs in a
// Firestore transaction with the record, so two nurses saving at the same
// moment cannot take the same mL twice or push the pool below 0.
export class DoseStockError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'missing' | 'stale' | 'out-of-stock' | 'expired' | 'no-ml' | 'invalid-dose'
  }
}

/** mL → whole hundredths (integer). */
export const toHund = (ml) => Math.round(Number(ml) * 100);
/** whole hundredths → mL with at most 2 decimals. */
export const fromHund = (h) => h / 100;

const stockStatusMl = (stockMl, minStockVials, mlPerVial) => {
  if (stockMl <= 0) return 'critical';
  const minMl = (parseInt(minStockVials, 10) || 10) * (parseFloat(mlPerVial) || 1);
  return stockMl <= minMl ? 'warning' : 'in-stock';
};

const mlPerVialOf = (item) => parseFloat(item?.mlPerVial || item?.mgPerVial);

/** YYYY-MM-DD expiry of an item, or ''. */
export const expiryOf = (item) => String(item?.expiryDate || item?.expiry || '').slice(0, 10);
/** Expired on or before `today` (clinic date): the item cannot be used. */
export const isExpired = (item, today) => {
  const e = expiryOf(item);
  return Boolean(e && today && e < today);
};
export const EXPIRED_NOTE = 'Expired, cannot be used';

/**
 * The inventory fields after moving `deltaHund` hundredths (negative =
 * deduct, positive = restore). Throws when a deduction is larger than the
 * pool, so the pool never goes negative.
 */
function movePool(item, deltaHund, label, today = '') {
  if (deltaHund < 0 && isExpired(item, today)) {
    throw new DoseStockError('expired', `${item?.name || label} expired on ${expiryOf(item)} and cannot be used.`);
  }
  const mlPerVial = mlPerVialOf(item);
  if (!mlPerVial || mlPerVial <= 0) {
    throw new DoseStockError('no-ml', `Cannot deduct: set mL per vial for ${item?.name || label} in Inventory first.`);
  }
  const beforeH = toHund(getItemStockMl(item) ?? 0);
  const afterH = beforeH + deltaHund;
  if (deltaHund < 0 && beforeH <= 0) {
    throw new DoseStockError('out-of-stock', `${item?.name || label} is out of stock in Inventory.`);
  }
  if (afterH < 0) {
    throw new DoseStockError('out-of-stock', `${item?.name || label} has only ${fromHund(beforeH)} mL left in Inventory (needed ${fromHund(-deltaHund)} mL).`);
  }
  const vialH = toHund(mlPerVial);
  const after = fromHund(afterH);
  return {
    before: fromHund(beforeH),
    after,
    update: {
      stock: vialH > 0 ? Math.floor(afterH / vialH) : 0,
      stockMl: after,
      status: stockStatusMl(after, item.minStock, mlPerVial),
      updatedAt: Date.now(),
    },
  };
}

/** A typed amount as a positive mL with at most 2 decimals, or null when invalid. */
export function parseDoseMl(raw) {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const h = toHund(n);
  return h > 0 ? fromHund(h) : null;
}

/**
 * @param fs        { runTransaction, doc, collection, deleteField }
 * @param db        Firestore instance
 * @param readDoses (savedRecord) => doses with { key, label, date, status, brand, note },
 *                  status 'done' for given doses (the tracker's buildDoses)
 * @param today     YYYY-MM-DD (clinic date), stamped as completedAt
 */
export async function recordDoseChange(fs, db, {
  patientId, doseKey, give, brand = '', stockItemId = null, ml = null, mg = null, byUid = null, byName = '', readDoses, today,
}) {
  const { runTransaction, doc, collection, deleteField } = fs;
  const vaxRef = doc(db, 'vaccinations', patientId);
  const invRef = stockItemId ? doc(db, 'inventory', stockItemId) : null;

  return runTransaction(db, async (tx) => {
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
    const stockOf = (i) => ({
      stockItemId: rawSaved[i]?.stockItemId,
      stockDeducted: rawSaved[i]?.stockDeducted,
      ml: rawSaved[i]?.ml !== undefined ? rawSaved[i]?.ml : rawSaved[i]?.mg,
      givenAt: rawSaved[i]?.givenAt,
      givenBy: rawSaved[i]?.givenBy,
      givenByName: rawSaved[i]?.givenByName,
    });

    const item = iSnap && iSnap.exists() ? iSnap.data() : null;
    const doseMl = parseDoseMl(ml ?? mg);
    let move = null;

    if (give) {
      if (doseMl === null) throw new DoseStockError('invalid-dose', 'Enter the amount given in mL (more than 0).');
      if (item) move = movePool(item, -toHund(doseMl), brand, today);
    } else if (item && stockOf(idx).stockDeducted !== false) {
      // Undo restores exactly what that dose took.
      const restoreMl = parseDoseMl(stockOf(idx).ml);
      if (restoreMl !== null) move = movePool(item, toHund(restoreMl), brand);
    }

    const nextDoses = savedDoses.map((d, i) => {
      const base = { key: d.key, n: d.label, date: d.date, note: d.note || '', ...stockOf(i) };
      if (i !== idx) {
        const st = d.status === 'done' ? 'done' : 'pending';
        return { ...base, status: st, s: st, brand: d.brand || '' };
      }
      return give
        ? { ...base, status: 'done', s: 'done', brand, stockItemId: item ? stockItemId : '', stockDeducted: Boolean(move),
            ml: doseMl, givenAt: Date.now(), givenBy: byUid || '', givenByName: byName || '' }
        : { ...base, status: 'pending', s: 'pending', brand: '', stockItemId: '', stockDeducted: false,
            ml: undefined, givenAt: undefined, givenBy: undefined, givenByName: undefined };
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
        qtyMl: fromHund(Math.abs(toHund(move.after) - toHund(move.before))),
        stockMlBefore: move.before,
        stockMlAfter: move.after,
        byUid,
        at: Date.now(),
      });
    }

    return { before: move ? move.before : null, after: move ? move.after : null, itemName: item?.name || '', allDone, wasDone, moved: Boolean(move) };
  });
}

// Category III treatments: RIG entries vs Anti-Tetanus entries. New entries
// carry `kind`; older ones are told apart by their product name.
export const isRigProduct = (product) => /\b(e?rig|equirab)\b/i.test(String(product || ''));
export const isRigEntry = (t) => (t?.kind ? t.kind === 'rig' : isRigProduct(t?.product));

/**
 * Records or removes a Category III treatment (RIG or Anti-Tetanus) with an
 * exact mL stock move. The entry is kept on the record as its own fields
 * (product, ml, date, recordedByName, ...) in `treatments` and in
 * rigTreatment / antiTetanusTreatment, never in the dose array, so dose
 * counts, progress and Ongoing/Completed status are untouched.
 * Returns { before, after, moved, itemName, entry }.
 */
export async function recordTreatmentChange(fs, db, {
  patientId, give, kind = '', treatmentId = null, product = '', stockItemId = null, ml = null, date = '', byUid = null, byName = '', today = '',
}) {
  const { runTransaction, doc, collection, deleteField } = fs;
  const vaxRef = doc(db, 'vaccinations', patientId);
  const isRig = kind ? kind === 'rig' : isRigProduct(product);
  const sameKind = (t) => isRigEntry(t) === isRig;

  return runTransaction(db, async (tx) => {
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
      const treatmentMl = parseDoseMl(ml);
      if (treatmentMl === null) throw new DoseStockError('invalid-dose', 'Enter the amount given in mL (more than 0).');
      const invRef = stockItemId ? doc(db, 'inventory', stockItemId) : null;
      const iSnap = invRef ? await tx.get(invRef) : null;
      const item = iSnap && iSnap.exists() ? iSnap.data() : null;
      const move = item ? movePool(item, -toHund(treatmentMl), product, today) : null;

      const entry = {
        id: treatmentId || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        kind: isRig ? 'rig' : 'antiTetanus',
        product,
        stockItemId: item ? stockItemId : '',
        itemName: item?.name || '',
        ml: treatmentMl,
        date: date || new Date().toISOString().slice(0, 10),
        stockDeducted: Boolean(move),
        recordedAt: Date.now(),
        recordedBy: byUid || '',
        recordedByName: byName || '',
      };
      tx.update(vaxRef, {
        treatments: [...currentTreatments, entry],
        ...(isRig ? { rigTreatment: entry, rigGiven: 'Yes (ERIG)' } : { antiTetanusTreatment: entry }),
      });
      if (move) {
        tx.update(invRef, move.update);
        tx.set(doc(collection(db, 'stockMovements')), {
          patientId, doseKey: entry.id, doseLabel: product, direction: 'deduct',
          itemId: stockItemId, itemName: item.name || '', qtyMl: treatmentMl,
          stockMlBefore: move.before, stockMlAfter: move.after, byUid, at: Date.now(),
        });
      }
      return { before: move?.before ?? null, after: move?.after ?? null, moved: Boolean(move), itemName: item?.name || '', entry };
    }

    // Removing (unchecking) restores exactly the mL that entry took.
    const target = currentTreatments.find(t => treatmentId && t.id === treatmentId)
      || currentTreatments.find(t => t.product === product)
      || (isRig ? saved.rigTreatment : saved.antiTetanusTreatment);
    if (!target) throw new DoseStockError('stale', 'This entry was already removed.');

    const tRef = target.stockDeducted && target.stockItemId ? doc(db, 'inventory', target.stockItemId) : null;
    const tSnap = tRef ? await tx.get(tRef) : null;
    const targetItem = tSnap && tSnap.exists() ? tSnap.data() : null;
    const restoreMl = parseDoseMl(target.ml ?? target.mg);
    const move = targetItem && restoreMl !== null ? movePool(targetItem, toHund(restoreMl), target.product) : null;

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
        itemId: target.stockItemId, itemName: targetItem.name || '', qtyMl: restoreMl,
        stockMlBefore: move.before, stockMlAfter: move.after, byUid, at: Date.now(),
      });
    }
    return { before: move?.before ?? null, after: move?.after ?? null, moved: Boolean(move), itemName: targetItem?.name || '', entry: target };
  });
}

/**
 * How a brand shows in a dropdown: just its name, plus a badge only when it
 * matters. Out-of-stock and expired batches are disabled.
 *   { disabled, badge: '' | 'Low stock' | 'Out of stock' | 'Expired', tone: 'amber' | 'red' }
 */
export function brandAvailability(item, today) {
  if (!item || item.id === 'current_selected' || item.id === 'current_assigned') return { disabled: false, badge: '', tone: '' };
  const st = deriveStockStatus(item);
  if (isExpired(item, today)) return { disabled: true, badge: EXPIRED_NOTE, tone: 'red' };
  if (st === 'out-of-stock') return { disabled: true, badge: 'Out of stock', tone: 'red' };
  if (st === 'low-stock') return { disabled: false, badge: 'Low stock', tone: 'amber' };
  return { disabled: false, badge: '', tone: '' };
}
