// The one live listener on /incidents. The dashboard shell holds it and passes
// the list to both the Incident Map and the global search, so the two read
// the same documents instead of opening two queries.
//
// Returns every VISIBLE pin (mapHidden != true), with no count cap: the map
// must show all open cases, not the newest 100. Hidden pins (patient
// completed) stay in Firestore for history but are filtered out here, which
// also keeps visible pins without a mapHidden field (a Firestore "!=" query
// would silently drop those). Any paging belongs in the list UI.
import { useEffect, useState } from 'react';
import { collection } from 'firebase/firestore';
import { db, listen } from '../../lib/firebase';

const toMs = v => (typeof v === 'number' ? v : v?.toMillis?.() ?? 0);

export function useIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => listen(collection(db, 'incidents'), snap => {
    setIncidents(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(inc => inc.mapHidden !== true)
        .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt)),
    );
    setLoading(false);
  }, err => {
    console.error('Incidents listener failed:', err);
    setLoading(false);
  }), []);

  return { incidents, loading };
}
