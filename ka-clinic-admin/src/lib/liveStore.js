// App-level live data: one Firestore listener per shared collection for the
// whole signed-in session. The first page that needs a collection starts the
// listener; it then stays open, so moving between pages shows the cached
// rows at once (no spinner, no re-fetch) and keeps updating live. Everything
// is torn down on sign-out.
//
//   const { rows, loaded } = useLiveCollection('appointments');
//   const rows = peekLiveCollection('inventory');   // outside React / initial state
//
// Rows are `{ id, ...data }` (patient records also get `firestoreId`,
// admins `uid`); the array keeps its identity until the next snapshot, so
// pages can memoize on it.
import { useSyncExternalStore } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { auth, db, listen } from './firebase';

const QUERIES = {
  vaccinations: () => query(collection(db, 'vaccinations'), orderBy('createdAt', 'desc')),
  appointments: () => query(collection(db, 'appointments'), orderBy('createdAt', 'desc')),
  appointmentSlots: () => collection(db, 'appointmentSlots'),
  inventory: () => query(collection(db, 'inventory'), orderBy('name', 'asc')),
  admins: () => collection(db, 'admins'),
  archived: () => query(collection(db, 'vaccinations'), where('isArchived', '==', true)),
};

// Patient records carry their own `id` field (the MRN), so the Firestore
// doc id is kept as `firestoreId` — the same shape the pages always used.
const MAPPERS = {
  vaccinations: d => ({ id: d.id, firestoreId: d.id, ...d.data() }),
  archived: d => ({ id: d.id, firestoreId: d.id, ...d.data() }),
  admins: d => ({ uid: d.id, ...d.data() }),
};
const toRow = (key, d) => (MAPPERS[key] ? MAPPERS[key](d) : { id: d.id, ...d.data() });

const EMPTY = Object.freeze({ rows: Object.freeze([]), loaded: false, error: null });
const entries = new Map(); // key -> { state, listeners:Set, unsub }

function entryFor(key) {
  let e = entries.get(key);
  if (!e) {
    e = { state: EMPTY, listeners: new Set(), unsub: null };
    entries.set(key, e);
  }
  return e;
}

function start(key) {
  const e = entryFor(key);
  if (e.unsub || !QUERIES[key]) return;
  e.unsub = listen(QUERIES[key](), snap => {
    e.state = { rows: snap.docs.map(d => toRow(key, d)), loaded: true, error: null };
    e.listeners.forEach(fn => fn());
  }, err => {
    console.error(`[liveStore] ${key} listener error:`, err);
    e.state = { ...e.state, loaded: true, error: err };
    e.listeners.forEach(fn => fn());
  });
}

export function peekLiveCollection(key) {
  start(key);
  return entryFor(key).state;
}

export function useLiveCollection(key) {
  return useSyncExternalStore(
    (fn) => {
      const e = entryFor(key);
      e.listeners.add(fn);
      start(key);
      return () => e.listeners.delete(fn); // the listener itself stays open
    },
    () => entryFor(key).state,
  );
}

// Sign-out: close every listener and forget the cached rows.
onAuthStateChanged(auth, (user) => {
  if (user) return;
  entries.forEach(e => { e.unsub?.(); e.unsub = null; e.state = EMPTY; e.listeners.forEach(fn => fn()); });
});
