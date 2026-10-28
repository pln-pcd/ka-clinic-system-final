import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = path.resolve(__dirname, '../public/downloads');
const targetFile = path.join(targetDir, 'ka-clinic.apk');
const APK_URL = 'https://github.com/pln-pcd/ka-clinic-system-final/releases/download/v1.0.27/ka-clinic-1.0.27.apk';

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download APK: status ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (fs.existsSync(targetFile)) {
    const stats = fs.statSync(targetFile);
    if (stats.size > 10 * 1024 * 1024) {
      console.log(`[ensure-apk] APK already present (${Math.round(stats.size / 1024 / 1024)} MB).`);
      return;
    }
  }

  console.log(`[ensure-apk] Downloading latest APK for direct hosting...`);
  await downloadFile(APK_URL, targetFile);
  const finalStats = fs.statSync(targetFile);
  console.log(`[ensure-apk] APK downloaded successfully (${Math.round(finalStats.size / 1024 / 1024)} MB).`);
}

main().catch(err => {
  console.warn('[ensure-apk] Warning: could not ensure APK:', err.message);
});
