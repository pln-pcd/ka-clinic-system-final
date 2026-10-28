Confirming a late dose now replaces the tracker's open record with the
transaction's committed record, including the actual administration date,
shifted follow-up dates and stock metadata. The checklist stays unchanged
while saving. Failed saves do not mark a dose as given.

The shared live vaccinations collection refreshes the tracker list and open
card even when the dashboard supplied initial patients. The patient record,
clinical-report form and export prefer the latest matching record over the
previously selected patient object.

For the reported October 17 → October 28 confirmation, the persisted dates
were already October 28, November 1 and November 22. The bug was a stale
display; no clinical history or inventory needed repair. The installed
1.0.22 app already subscribes to `vaccinations/{mrn}` and renders `doses.date`
in its home timeline, vaccination card and records. No APK change is needed.

Validation: `npm run build --prefix ka-clinic-admin`, `npm run test:kai`,
and `npm run test:doses:ui`. The browser test uses the real React screens,
dose transaction and mobile dose-status helper, with simulated Firebase I/O.
It verifies confirmation while the listener is delayed, stock movement,
undo, opt-out of date shifting, failed saves, external live updates, the
record/export and registration/edit address selections. No production
patients are modified. Set `PLAYWRIGHT_EXECUTABLE_PATH` if Chrome is not
installed. `--baseline` reproduces the reported stale checklist against
the source before this fix and must fail its adjusted-date assertion.

The locality dropdown uses the per-barangay names and source URLs in
`ka-clinic-admin/src/lib/libonLocalities.js`, checked October 28, 2026.
The underlying documents are DepEd school-address lists and PCIC records;
they establish individual locations, not a complete current municipal
purok register. Only the documented names are selectable. All 47 barangays
remain covered (40 named barangays plus seven Poblacion zones). A barangay
without documented localities has an optional blank field and an explanation.
Older saved text is preserved as a disabled saved-address option, never
offered as a new verified location. Changing barangay clears the previous
locality and rebuilds the address. A complete current purok registry still
requires confirmation from Libon's municipal/barangay offices.
