import assert from 'node:assert';
import https from 'node:https';
import { buildPatientWelcomeEmailHtml, DEFAULT_PATIENT_APP_DOWNLOAD_URL } from '../api/_lib/mail/templates.js';
import downloadApkHandler from '../api/download-apk.js';

const EXPECTED_URL = 'https://github.com/pln-pcd/ka-clinic-system-final/releases/download/v1.0.28/ka-clinic-1.0.28.apk';

console.log('=== TEST 1: Default APK Download URL Constant ===');
assert.strictEqual(DEFAULT_PATIENT_APP_DOWNLOAD_URL, EXPECTED_URL);
console.log('✔ DEFAULT_PATIENT_APP_DOWNLOAD_URL matches expected direct release URL');

console.log('\n=== TEST 2: Email Template HTML Generation ===');
// Case A: normal call
const htmlNormal = buildPatientWelcomeEmailHtml({
  patientName: 'Juan Dela Cruz',
  mrn: '2026-999',
  email: 'test@example.com',
  downloadUrl: EXPECTED_URL,
});
assert(htmlNormal.includes(`href="${EXPECTED_URL}"`), 'Normal email should include the direct APK href');
assert(htmlNormal.includes('Download Android App (APK)'), 'Email should contain the button text');
console.log('✔ Welcome email includes direct APK href');

// Case B: someone passes a /releases/tag/ URL
const htmlTagOverride = buildPatientWelcomeEmailHtml({
  patientName: 'Juan Dela Cruz',
  mrn: '2026-999',
  email: 'test@example.com',
  downloadUrl: 'https://github.com/pln-pcd/ka-clinic-system-final/releases/tag/v1.0.28',
});
assert(htmlTagOverride.includes(`href="${EXPECTED_URL}"`), 'Tag URL should be replaced with direct APK URL');
assert(!htmlTagOverride.includes('/releases/tag/v1.0.28'), 'Email must NOT contain release tag web page URL');
console.log('✔ Tag web page URL is intercepted and replaced with direct download APK link');

console.log('\n=== TEST 3: api/download-apk.js Handler Redirection ===');
let statusCode = null;
let headers = {};
const mockRes = {
  writeHead(code, h) {
    statusCode = code;
    headers = h;
  },
  end() {},
};
downloadApkHandler({}, mockRes);
assert.strictEqual(statusCode, 302, 'Should return HTTP 302');
assert.strictEqual(headers['Location'], EXPECTED_URL, 'Location header must point directly to the APK');
assert(headers['Content-Disposition'].includes('attachment;'), 'Should have attachment Content-Disposition');
console.log('✔ api/download-apk redirects with 302 to direct APK file');

console.log('\n=== TEST 4: Direct GitHub Release Link Accessibility & Headers ===');
function checkRemoteUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      console.log(`Status from GitHub: ${res.statusCode} ${res.statusMessage}`);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`Redirect Location: ${res.headers.location.slice(0, 80)}...`);
        https.get(res.headers.location, (redirRes) => {
          console.log(`Redirect target status: ${redirRes.statusCode} ${redirRes.statusMessage}`);
          console.log(`Content-Type: ${redirRes.headers['content-type']}`);
          console.log(`Content-Disposition: ${redirRes.headers['content-disposition']}`);
          console.log(`Content-Length: ${redirRes.headers['content-length']} bytes (~${Math.round(redirRes.headers['content-length'] / (1024 * 1024))} MB)`);
          assert.strictEqual(redirRes.statusCode, 200, 'Target should be 200 OK');
          assert.strictEqual(redirRes.headers['content-type'], 'application/vnd.android.package-archive');
          assert(redirRes.headers['content-disposition'].includes('attachment; filename=ka-clinic-1.0.28.apk'));
          redirRes.destroy();
          resolve(true);
        }).on('error', reject);
      } else {
        assert.strictEqual(res.statusCode, 200);
        res.destroy();
        resolve(true);
      }
    }).on('error', reject);
  });
}

await checkRemoteUrl(EXPECTED_URL);
console.log('✔ GitHub release URL directly streams ka-clinic-1.0.28.apk without web page navigation!');

console.log('\n🎉 ALL DOWNLOAD TESTS PASSED SUCCESSFULLY!');
