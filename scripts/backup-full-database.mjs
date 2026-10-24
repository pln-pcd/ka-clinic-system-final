import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set');
  process.exit(1);
}

const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
const app = initializeApp({
  credential: cert(sa),
  projectId: process.env.FIREBASE_PROJECT_ID || sa.project_id,
});
const db = getFirestore(app);
const auth = getAuth(app);

function plain(v) {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v?.toDate === 'function') return { _ts: v.toDate().toISOString() };
  if (v?.constructor?.name === 'Timestamp') return { _seconds: v._seconds, _nanoseconds: v._nanoseconds };
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

async function runBackup() {
  console.log(`Starting full database backup for project: ${sa.project_id}...`);
  const collections = await db.listCollections();
  const backup = {
    projectId: sa.project_id,
    createdAt: new Date().toISOString(),
    collections: {},
    authUsers: [],
  };

  let totalDocs = 0;
  for (const col of collections) {
    const snap = await col.get();
    backup.collections[col.id] = snap.docs.map(d => ({
      id: d.id,
      data: plain(d.data()),
    }));
    totalDocs += snap.size;
    console.log(`  Backed up ${col.id}: ${snap.size} documents`);
  }

  // Auth users
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      backup.authUsers.push({
        uid: u.uid,
        email: u.email || null,
        displayName: u.displayName || null,
        phoneNumber: u.phoneNumber || null,
        disabled: u.disabled,
        customClaims: u.customClaims || null,
        metadata: {
          creationTime: u.metadata.creationTime,
          lastSignInTime: u.metadata.lastSignInTime,
        },
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`  Backed up Auth Users: ${backup.authUsers.length} users`);

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');
  mkdirSync(backupsDir, { recursive: true });
  const filename = `pre-wipe-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filePath = join(backupsDir, filename);
  writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8');

  console.log(`\nFull backup successfully written to: ${filePath}`);
  console.log(`Total documents: ${totalDocs}, Total Auth users: ${backup.authUsers.length}`);
}

runBackup().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
