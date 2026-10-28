// Real React screens and dose transaction; only Firebase I/O is simulated.
// No clinic accounts or production records are read/written by this test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { LIBON_LOCALITIES, libonLocalities } from '../../ka-clinic-admin/src/lib/libonLocalities.js';
import { LIBON_BARANGAYS, POBLACION_ZONES } from '../../ka-clinic-admin/src/lib/libonGeo.js';
const require = createRequire(new URL('../../ka-clinic-admin/package.json', import.meta.url));
const { build } = require('esbuild');
const root = fileURLToPath(new URL('../../', import.meta.url));
assert.equal(LIBON_BARANGAYS.length - 1 + POBLACION_ZONES.length, 47);
for (const [barangay, entries] of Object.entries(LIBON_LOCALITIES)) {
  assert(LIBON_BARANGAYS.includes(barangay));
  assert(entries.every(entry => new URL(entry.source).hostname.endsWith('.gov.ph')));
}
assert.deepEqual(libonLocalities('San Rafael'), []);
assert.deepEqual(libonLocalities('Apud'), []);

const firebase = `
export const db = {};
export const auth = { currentUser: { uid: 'fixture', displayName: 'Fixture Nurse' } };
export const collection = (_db, path) => path;
export const doc = (_db, path, id) => path + '/' + id;
export const query = (...args) => args;
export const where = (...args) => args;
export const orderBy = (...args) => args;
export const limit = n => n;
export const deleteField = () => null;
export const serverTimestamp = () => Date.now();
export const getDocs = async () => ({ docs: [], empty: true });
export const getDoc = async () => ({ exists: () => false });
export const updateDoc = async () => {};
export const addDoc = async () => {};
export const setDoc = async () => {};
export const arrayUnion = (...values) => values;
export const writeBatch = () => ({ update() {}, commit: async () => {} });
export const listen = (_query, cb) => { cb({ docs: [], empty: true }); return () => {}; };
export const onSnapshot = listen;
export async function runTransaction(_db, fn) {
  const f = window.fixture;
  const writes = [];
  const result = await fn({
    get: async ref => ({ exists: () => true, data: () => structuredClone(ref.startsWith('inventory/') ? f.item : f.record) }),
    update: (ref, value) => writes.push([ref, value]),
    set: () => {},
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  if (f.failNext) { f.failNext = false; throw new Error('Simulated rejected write'); }
  for (const [ref, value] of writes) {
    if (ref.startsWith('inventory/')) Object.assign(f.item, value);
    else Object.assign(f.record, value);
  }
  // Deliberately leave the subscription behind: the success UI must already
  // show the transaction's saved dates before the listener catches up.
  return result;
}`;
const live = `
import { useSyncExternalStore } from 'react';
export const peekLiveCollection = key => window.fixture.states[key];
export const useLiveCollection = key => useSyncExternalStore(fn => { window.fixture.listeners.add(fn); return () => window.fixture.listeners.delete(fn); }, () => window.fixture.states[key]);
`;
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Tracker from './ka-clinic-admin/src/features/vaccination/VaccinationTrackerPage.jsx';
import { MedicalRecordDetail } from './ka-clinic-admin/src/features/patients/PatientRecordView.jsx';
import { AddPatientModal, EditPatientModal } from './ka-clinic-admin/src/features/patients/PatientForms.jsx';
import { useLiveCollection } from './ka-clinic-admin/src/lib/liveStore.js';
import { doseStatus } from './patient-app/utils/patientRecord.ts';
const f = window.fixture;
f.mobileStatuses = () => f.record.doses.map(d => doseStatus(d, '2026-10-28').status);
const seed = structuredClone(f.record);
function App() {
  const [view, setView] = useState('tracker');
  f.view = setView;
  const rows = useLiveCollection('vaccinations').rows;
  if (view === 'record') return <MedicalRecordDetail patient={seed} records={rows} onBack={() => {}} onToast={() => {}} />;
  if (view === 'add') return <AddPatientModal inventoryItems={[f.item]} onClose={() => {}} onAdd={() => {}} />;
  if (view === 'edit') return <EditPatientModal patient={{ ...seed, barangay: 'Bonbon', zone: 'Purok Narra' }} inventoryItems={[f.item]} onClose={() => {}} onSave={data => { f.edited = data; }} />;
  return <Tracker selectedPatientId={seed.id} initialPatients={[seed]} />;
}
createRoot(document.getElementById('root')).render(<App />);
`;
const result = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'late-dose-fixture.jsx', loader: 'jsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', nodePaths: [`${root}/ka-clinic-admin/node_modules`],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' },
  plugins: [{ name: 'fixture-io', setup(b) {
    if (process.argv.includes('--baseline')) b.onLoad({ filter: /VaccinationTrackerPage\.jsx$/ }, args => ({
      contents: execFileSync('git', ['show', 'a3e2eea:ka-clinic-admin/src/features/vaccination/VaccinationTrackerPage.jsx'], { cwd: root, encoding: 'utf8' }),
      loader: 'jsx',
    }));
    b.onResolve({ filter: /(^firebase\/firestore$|\/lib\/firebase(?:\.js)?$|^\.\/firebase(?:\.js)?$)/ }, args => ({ path: 'firebase', namespace: 'fixture' }));
    b.onResolve({ filter: /\/lib\/liveStore(?:\.js)?$/ }, () => ({ path: 'live', namespace: 'fixture' }));
    b.onResolve({ filter: /(\/activityLog(?:\.js)?$|\/adminSession(?:\.js)?$)/ }, () => ({ path: 'logs', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      contents: args.path === 'firebase' ? firebase : args.path === 'live' ? live : 'export const logActivity = () => {}; export const authedPostJson = async () => ({});',
      resolveDir: `${root}/ka-clinic-admin`, loader: 'js',
    }));
  }}],
});
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.clock.install({ time: new Date('2026-10-28T10:00:00+08:00') });
await page.addInitScript(() => {
  const dates = ['2026-10-14', '2026-10-17', '2026-10-21', '2026-11-11'];
  const record = { id: 'fixture-late-dose', firestoreId: 'fixture-late-dose', name: 'Schedule Fixture', service: 'PEP', cat: 'II', date: dates[0], status: 'ongoing', createdAt: Date.now(), doses: dates.map((date, i) => ({ key: 'd' + (i + 1), n: 'Session ' + (i + 1) + ' (Day ' + [0, 3, 7, 28][i] + ')', date, status: i ? 'pending' : 'done', s: i ? 'pending' : 'done', stockDeducted: false, brand: i ? '' : 'Speeda' })) };
  const item = { id: 'fixture-stock', name: 'Speeda', category: 'Anti-Rabies', service: 'PEP', stock: 10, minStock: 1, expiry: '2027-12-31' };
  const f = window.fixture = { record, item, listeners: new Set(), states: { vaccinations: { rows: [structuredClone(record)], loaded: true }, inventory: { rows: [item], loaded: true } } };
  f.publish = () => { f.states.vaccinations = { rows: [structuredClone(f.record)], loaded: true }; f.listeners.forEach(fn => fn()); };
});
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('checkbox', { name: 'Session 2 (Day 3): not given' }).waitFor();
  // Custom Select exposes a button/combobox, options are accessible listbox rows.
  const brand = page.locator('#tracker-brand');
  await brand.click();
  await page.getByRole('option', { name: /Speeda/ }).click();
  await page.getByRole('checkbox', { name: 'Session 2 (Day 3): not given' }).check();
  assert.equal(await page.getByRole('checkbox', { name: /Move the next 2 doses/ }).isChecked(), true);
  await page.getByRole('button', { name: 'Confirm dose', exact: true }).click();
  await page.locator('button[title="Undo this dose (recorded by mistake)"]').waitFor();
  let rows = await page.locator('.kna-modal-overlay').locator('li').allTextContents();
  assert(rows.some(row => row.includes('Session 2') && row.includes('Oct 28')));
  assert(rows.some(row => row.includes('Session 3') && row.includes('Nov 01')));
  assert(rows.some(row => row.includes('Session 4') && row.includes('Nov 22')));
  assert.deepEqual(await page.evaluate(() => window.fixture.record.doses.map(d => d.date)), ['2026-10-14', '2026-10-28', '2026-11-01', '2026-11-22']);
  assert.equal(await page.evaluate(() => window.fixture.item.stock), 9);
  assert.deepEqual(await page.evaluate(() => window.fixture.mobileStatuses()), ['given', 'given', 'upcoming', 'upcoming']);
  console.log('PASS: late confirmation shows committed dates immediately with dashboard initialPatients; deducts once');

  async function undo() {
    await page.locator('button[title="Undo this dose (recorded by mistake)"]').click();
    await page.getByRole('button', { name: 'Undo dose', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Session 2 (Day 3): not given' }).waitFor();
  }
  async function give(shift = true) {
    await page.locator('#tracker-brand').click();
    await page.getByRole('option', { name: /Speeda/ }).click();
    await page.getByRole('checkbox', { name: 'Session 2 (Day 3): not given' }).check();
    await page.getByRole('checkbox', { name: /Move the next 2 doses/ }).setChecked(shift);
    await page.getByRole('button', { name: 'Confirm dose', exact: true }).click();
  }
  await undo();
  assert.deepEqual(await page.evaluate(() => window.fixture.record.doses.map(d => d.date)), ['2026-10-14', '2026-10-17', '2026-10-21', '2026-11-11']);
  assert.equal(await page.evaluate(() => window.fixture.item.stock), 10);
  await give(false);
  await page.locator('button[title="Undo this dose (recorded by mistake)"]').waitFor();
  assert.deepEqual(await page.evaluate(() => window.fixture.record.doses.map(d => d.date)), ['2026-10-14', '2026-10-28', '2026-10-21', '2026-11-11']);
  await undo();
  await page.evaluate(() => { window.fixture.failNext = true; });
  await give();
  await page.getByText('Could not save the dose. Nothing was changed. Please try again.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.item.stock), 10);
  assert.equal(await page.evaluate(() => window.fixture.record.doses[1].status), 'pending');
  await give();
  await page.locator('button[title="Undo this dose (recorded by mistake)"]').waitFor();
  console.log('PASS: undo restores dates/stock; unchecked shift leaves later dates; rejected save leaves record/stock unchanged');
  console.log('PASS: installed app dose readers classify the saved next dates as upcoming');

  // A second staff session changes the same record while this card stays open.
  await page.evaluate(() => { window.fixture.record.doses[3].date = '2026-11-23'; window.fixture.publish(); });
  await page.locator('.kna-modal-overlay').getByText('Nov 23', { exact: true }).waitFor();
  console.log('PASS: open tracker follows external live changes despite initialPatients');
  await page.evaluate(() => window.fixture.view('record'));
  const timeline = page.getByRole('list', { name: 'Dose timeline' });
  await timeline.waitFor();
  rows = await timeline.locator('li').allTextContents();
  assert(rows.some(row => row.includes('Session 2') && row.includes('Oct 28')));
  assert(rows.some(row => row.includes('Session 3') && row.includes('Nov 1')));
  assert(rows.some(row => row.includes('Session 4') && row.includes('Nov 23')));
  await page.getByRole('button', { name: 'Export Patient Record', exact: true }).click();
  await page.locator('.kna-modal-overlay').waitFor();
  const exportHtml = await page.locator('.kna-modal-overlay iframe').getAttribute('srcdoc');
  assert(exportHtml.includes('Nov 23'));
  console.log('PASS: patient record and export prefer live doses over a stale selected patient');

  await page.evaluate(() => window.fixture.view('add'));
  await page.locator('#reg-zone').waitFor();
  assert.equal(await page.locator('#reg-zone').isDisabled(), true);
  await page.getByRole('combobox', { name: /^Barangay/ }).click();
  await page.getByRole('option', { name: 'Bonbon', exact: true }).click();
  await page.locator('#reg-zone').click();
  await page.getByRole('option', { name: 'Purok Narra', exact: true }).click();
  assert.equal(await page.locator('#reg-address').inputValue(), 'Purok Narra, Brgy. Bonbon, Libon, Albay');
  await page.getByRole('combobox', { name: /^Barangay/ }).click();
  await page.getByRole('combobox', { name: /^Barangay/ }).fill('Rawis');
  await page.getByRole('option', { name: 'Rawis', exact: true }).click();
  assert.equal(await page.locator('#reg-address').inputValue(), 'Brgy. Rawis, Libon, Albay');
  await page.locator('#reg-zone').click();
  assert.equal(await page.getByRole('option', { name: 'Purok Narra', exact: true }).count(), 0);
  await page.getByRole('option', { name: 'Purok Mangga', exact: true }).click();
  assert.equal(await page.locator('#reg-address').inputValue(), 'Purok Mangga, Brgy. Rawis, Libon, Albay');
  await page.getByRole('button', { name: 'Clear purok / sitio', exact: true }).click();
  assert.equal(await page.locator('#reg-address').inputValue(), 'Brgy. Rawis, Libon, Albay');
  await page.locator('#reg-barangay').fill('Apud');
  await page.getByRole('option', { name: 'Apud', exact: true }).click();
  assert.equal(await page.locator('#reg-zone').isDisabled(), true);
  await page.getByText('No verified purok list for this barangay yet. This field is optional.', { exact: true }).waitFor();
  await page.locator('#reg-barangay').fill('Poblacion');
  await page.getByRole('option', { name: 'Poblacion', exact: true }).click();
  await page.locator('#reg-zone').click();
  assert.equal(await page.getByRole('option').count(), 7);
  await page.getByRole('option', { name: 'Zone VII', exact: true }).click();
  assert.equal(await page.locator('#reg-address').inputValue(), 'Zone VII, Poblacion, Libon, Albay');
  console.log('PASS: real registration dropdown filters localities by barangay and clears the old selection');
  await page.evaluate(() => window.fixture.view('edit'));
  await page.locator('#edit-zone').click();
  await page.getByRole('option', { name: 'Purok Lanzones', exact: true }).click();
  assert.equal(await page.locator('#edit-address').inputValue(), 'Purok Lanzones, Brgy. Bonbon, Libon, Albay');
  await page.locator('#edit-barangay').fill('Rawis');
  await page.getByRole('option', { name: 'Rawis', exact: true }).click();
  assert.equal(await page.locator('#edit-address').inputValue(), 'Brgy. Rawis, Libon, Albay');
  console.log('PASS: edit form uses the same verified dropdown, Poblacion has seven zones, unsupported barangays have no invented choices');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('Browser errors:', errors);
  console.error((await page.locator('body').innerText()).slice(-2400));
  console.error(await page.evaluate(() => ({ dates: window.fixture.record.doses.map(d => d.date), stock: window.fixture.item.stock })));
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
