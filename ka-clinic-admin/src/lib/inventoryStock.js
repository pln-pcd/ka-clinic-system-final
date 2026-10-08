// Vaccine inventory stock: the level labels the Inventory page and its export
// show, and the transaction that moves stock when a dose is given or undone.

// ══════════════════════════════════════════════════════════════════════════
// Stock levels (Inventory page and export)
// ══════════════════════════════════════════════════════════════════════════
// Stock level rules shared by the Inventory page and its export dialog.
export const fmtUnit = (u) => u ? u.charAt(0).toUpperCase() + u.slice(1) : '';

export function deriveStockStatus(item) {
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
// Records a dose being given (or undone) together with its inventory change,
// in one Firestore transaction. Used by the Vaccination Tracker.
//
// Why one transaction: the dose, the stock count and the audit entry must
// change together or not at all. It reads the saved patient record and the
// inventory item, checks the dose is still in the state the click assumed
// (so a double click or a second admin cannot apply it twice), then writes.
//
// Stock rules:
//   giving a dose   takes 1 from the selected item. Refused if it is at 0.
//                   The dose remembers stockItemId and stockDeducted.
//   undoing a dose  puts 1 back on that item, only if it was really taken
//                   (stockDeducted true, or an older dose saved before these
//                   fields existed, which the previous code deducted by name).
//   brand not in inventory: the dose is still saved, no stock moves.
// Every stock change also writes an append-only stockMovements entry.
//
// The db instance and the Firestore functions are passed in so the same code
// runs in the dashboard and in the emulator test (scripts/demo).

export class DoseStockError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'missing' | 'stale' | 'out-of-stock'
  }
}

const stockStatus = (stock, minStock) => {
  const min = parseInt(minStock, 10) || 10;
  return stock <= 0 ? 'critical' : stock <= min ? 'warning' : 'in-stock';
};

/**
 * @param fs        { runTransaction, doc, collection, deleteField }
 * @param db        Firestore instance
 * @param readDoses (savedRecord) => doses with { key, label, date, status, brand, note },
 *                  status 'done' for given doses (the tracker's buildDoses)
 * @param today     YYYY-MM-DD (clinic date), stamped as completedAt
 */
export async function recordDoseChange(fs, db, {
  patientId, doseKey, give, brand = '', stockItemId = null, byUid = null, byName = '', readDoses, today,
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
    if (idx === -1 || (savedDoses[idx].status === 'done') === give) {
      throw new DoseStockError('stale', 'This dose was already updated.');
    }
    // Stock link plus who gave the dose and when, carried over unchanged for
    // every dose except the one being given / undone.
    const stockOf = (i) => ({
      stockItemId: rawSaved[i]?.stockItemId, stockDeducted: rawSaved[i]?.stockDeducted,
      givenAt: rawSaved[i]?.givenAt, givenBy: rawSaved[i]?.givenBy, givenByName: rawSaved[i]?.givenByName,
    });

    const item = iSnap && iSnap.exists() ? iSnap.data() : null;
    const before = item ? (parseInt(item.stock, 10) || 0) : null;
    let after = before;
    let deducted = false;
    if (item && give) {
      if (before <= 0) throw new DoseStockError('out-of-stock', `${item.name || brand} is out of stock in Inventory.`);
      after = before - 1;
      deducted = true;
    } else if (item && !give && stockOf(idx).stockDeducted !== false) {
      after = before + 1;
    }

    const nextDoses = savedDoses.map((d, i) => {
      const base = { key: d.key, n: d.label, date: d.date, note: d.note || '', ...stockOf(i) };
      if (i !== idx) {
        const st = d.status === 'done' ? 'done' : 'pending';
        return { ...base, status: st, s: st, brand: d.brand || '' };
      }
      return give
        ? { ...base, status: 'done', s: 'done', brand, stockItemId: item ? stockItemId : '', stockDeducted: deducted,
            givenAt: Date.now(), givenBy: byUid || '', givenByName: byName || '' }
        : { ...base, status: 'pending', s: 'pending', brand: '', stockItemId: '', stockDeducted: false,
            givenAt: undefined, givenBy: undefined, givenByName: undefined };
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
    if (item && after !== before) {
      tx.update(invRef, { stock: after, status: stockStatus(after, item.minStock), updatedAt: Date.now() });
      tx.set(doc(collection(db, 'stockMovements')), {
        patientId,
        doseKey,
        doseLabel: savedDoses[idx].label || '',
        direction: give ? 'deduct' : 'restore',
        itemId: stockItemId,
        itemName: item.name || '',
        qty: 1,
        stockBefore: before,
        stockAfter: after,
        byUid,
        at: Date.now(),
      });
    }
    return { before, after, itemName: item?.name || '', allDone, wasDone, moved: after !== before };
  });
}

/**
 * Records ERIG given (or removes it) together with its inventory change, in
 * one transaction, like recordDoseChange.
 *   giving   takes `vials` from the selected ERIG item. Refused when the item
 *            is out of stock or holds fewer vials than that.
 *   removing puts the vials back on the item they came from, only if they
 *            were really taken (stockDeducted).
 * Also keeps the older `rigGiven` answer in step ("Yes (ERIG)" / "No").
 */
export async function recordErigChange(fs, db, {
  patientId, give, vials = 1, date = '', stockItemId = null, byUid = null, byName = '',
}) {
  const { runTransaction, doc, collection, deleteField } = fs;
  const vaxRef = doc(db, 'vaccinations', patientId);

  return runTransaction(db, async (tx) => {
    const vSnap = await tx.get(vaxRef);
    if (!vSnap.exists()) throw new DoseStockError('missing', 'Patient record not found.');
    const saved = vSnap.data();
    const savedErig = saved.erig && saved.erig.given ? saved.erig : null;
    const savedGiven = Boolean(savedErig) || /ERIG/i.test(String(saved.rigGiven || ''));
    if (give === savedGiven) throw new DoseStockError('stale', 'ERIG was already updated.');

    // Giving uses the chosen item; removing returns to the item it came from.
    const itemId = give ? stockItemId : (savedErig?.stockDeducted ? savedErig.stockItemId : null);
    const invRef = itemId ? doc(db, 'inventory', itemId) : null;
    const iSnap = invRef ? await tx.get(invRef) : null;
    const item = iSnap && iSnap.exists() ? iSnap.data() : null;
    const qty = give ? Math.max(1, parseInt(vials, 10) || 1) : (parseInt(savedErig?.vials, 10) || 0);

    const before = item ? (parseInt(item.stock, 10) || 0) : null;
    let after = before;
    if (item && give) {
      if (before <= 0) throw new DoseStockError('out-of-stock', `${item.name || 'ERIG'} is out of stock in Inventory.`);
      if (before < qty) throw new DoseStockError('out-of-stock', `${item.name || 'ERIG'} has only ${before} vial${before === 1 ? '' : 's'} left in Inventory.`);
      after = before - qty;
    } else if (item && !give && qty > 0) {
      after = before + qty;
    }

    tx.update(vaxRef, give
      ? {
          erig: {
            given: true, vials: qty, date, stockItemId: item ? itemId : '', itemName: item?.name || '',
            stockDeducted: Boolean(item), recordedAt: Date.now(), recordedBy: byUid || '', recordedByName: byName || '',
          },
          rigGiven: 'Yes (ERIG)',
        }
      : { erig: deleteField(), rigGiven: 'No' });
    if (item && after !== before) {
      tx.update(invRef, { stock: after, status: stockStatus(after, item.minStock), updatedAt: Date.now() });
      tx.set(doc(collection(db, 'stockMovements')), {
        patientId,
        doseKey: 'erig',
        doseLabel: 'ERIG',
        direction: give ? 'deduct' : 'restore',
        itemId,
        itemName: item.name || '',
        qty,
        stockBefore: before,
        stockAfter: after,
        byUid,
        at: Date.now(),
      });
    }
    const min = parseInt(item?.minStock, 10) || 10;
    return { before, after, qty, itemName: item?.name || '', moved: after !== before, low: item ? after <= min : false };
  });
}

/**
 * How a brand shows in a dropdown: just its name, plus a badge only when it
 * matters. Out-of-stock and expired batches are disabled.
 *   { disabled, badge: '' | 'Low stock' | 'Out of stock' | 'Expired', tone: 'amber' | 'red' }
 */
export function brandAvailability(item, today) {
  if (!item || item.id === 'current_selected' || item.id === 'current_assigned') return { disabled: false, badge: '', tone: '' };
  const stock = parseInt(item.stock ?? item.quantity, 10) || 0;
  const min = parseInt(item.minStock, 10) || 0;
  const expiry = String(item.expiryDate || item.expiry || '').slice(0, 10);
  if (expiry && today && expiry < today) return { disabled: true, badge: 'Expired', tone: 'red' };
  if (stock <= 0) return { disabled: true, badge: 'Out of stock', tone: 'red' };
  if (stock <= min) return { disabled: false, badge: 'Low stock', tone: 'amber' };
  return { disabled: false, badge: '', tone: '' };
}
