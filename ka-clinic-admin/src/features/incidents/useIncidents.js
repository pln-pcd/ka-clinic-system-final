// The one live listener on /incidents, held by the dashboard shell and passed
// to the Incident Map.
//
// Thesis ethics rules (docs/STUDY_MODE.md): the map shows ONLY simulated,
// non-identifiable test records. The query asks for isSimulated == true, and
// firestore.rules refuses to return any other incident, so a real record can
// never reach the map even if one exists in the database.
import { useEffect, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db, listen } from '../../lib/firebase';

export function useIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => listen(query(collection(db, 'incidents'), where('isSimulated', '==', true)), snap => {
    setIncidents(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(inc => inc.isSimulated === true && inc.mapHidden !== true)
        .sort((a, b) => (b.simNo ?? 0) - (a.simNo ?? 0)),
    );
    setLoading(false);
  }, err => {
    console.error('Incidents listener failed:', err);
    setLoading(false);
  }), []);

  return { incidents, loading };
}
