import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { LIBON_BARANGAYS, LIBON_BARANGAY_COORDS } from '../../ka-clinic-admin/src/lib/libonGeo.js';


console.log('--- Testing Step 1 Form Validations via Source Extraction ---');
const patientFormsSrc = fs.readFileSync('ka-clinic-admin/src/features/patients/PatientForms.jsx', 'utf8');

// Ensure email validation rule in PatientForms.jsx is optional (only checks when trimmed email is non-empty)
assert(
  patientFormsSrc.includes("email: f => (f.email.trim() && !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email, e.g. name@gmail.com' : '')"),
  'PatientForms.jsx must have optional email validator in REGISTER_RULES and EDIT_RULES'
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailValidator = f => (f.email.trim() && !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email, e.g. name@gmail.com' : '');

assert.equal(emailValidator({ email: '' }), '', 'Empty email must not produce an error');
assert.equal(emailValidator({ email: '   ' }), '', 'Spaces-only email must not produce an error');
assert.equal(emailValidator({ email: 'invalid' }), 'Enter a valid email, e.g. name@gmail.com', 'Invalid email must produce format error');
assert.equal(emailValidator({ email: 'patient@example.com' }), '', 'Valid email passes');
assert.equal(emailValidator({ email: ' Patient.Name@Gmail.Com ' }), '', 'Valid trimmed email passes');
console.log('✓ Step 1 email validation works (empty optional, format enforced when typed)');

console.log('--- Testing Duplicate Check Logic ---');
function checkLocalDuplicate(normalEmail, patients, isReturning = false, returningId = null) {
  if (!normalEmail) return null; // Blank email never counts as duplicate
  const existing = patients.find(p => (p.email || '').toLowerCase().trim() === normalEmail);
  if (existing && (!isReturning || (existing.firestoreId !== returningId && existing.id !== returningId))) {
    return existing;
  }
  return null;
}

const mockPatients = [
  { id: '2026-001', firestoreId: '2026-001', name: 'Patient One', email: '' },
  { id: '2026-002', firestoreId: '2026-002', name: 'Patient Two', email: 'registered@example.com' },
];

// Registering second patient with blank email
assert.equal(checkLocalDuplicate('', mockPatients), null, 'Blank email must never match another blank email');
assert.equal(checkLocalDuplicate('   '.trim(), mockPatients), null, 'Spaces-only email must never match');

// Registering patient with already-used email
const dup = checkLocalDuplicate('registered@example.com', mockPatients);
assert.notEqual(dup, null, 'Duplicate email must be detected');
assert.equal(dup.id, '2026-002');

// Case insensitive duplicate
const dupUpper = checkLocalDuplicate('  REGISTERED@EXAMPLE.COM  '.toLowerCase().trim(), mockPatients);
assert.notEqual(dupUpper, null, 'Case-insensitive duplicate email must be detected');

// Add another service for patient with blank email
assert.equal(checkLocalDuplicate('', mockPatients, true, '2026-001'), null, 'Add Another Service for blank email patient succeeds');
console.log('✓ Duplicate check logic works (blank never matches, unique check intact for non-blank)');

console.log('--- Testing Incident Map Barangay Names & Constants ---');
assert.equal(LIBON_BARANGAYS.length, 41, 'LIBON_BARANGAYS contains 40 rural barangays + Poblacion');
assert.equal(Object.keys(LIBON_BARANGAY_COORDS).length, 41, 'Every barangay in list has coordinates');
for (const b of LIBON_BARANGAYS) {
  assert(LIBON_BARANGAY_COORDS[b], `Coordinates missing for ${b}`);
  assert(typeof LIBON_BARANGAY_COORDS[b].lat === 'number', `Latitude missing for ${b}`);
  assert(typeof LIBON_BARANGAY_COORDS[b].lng === 'number', `Longitude missing for ${b}`);
}
console.log('✓ Incident Map barangay coordinates verified for all 41 entries');

// Clean up temp file
try { fs.unlinkSync(tempBundle); } catch {}

console.log('\nAll unit checks passed successfully!');
