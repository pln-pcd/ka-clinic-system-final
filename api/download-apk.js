export default function handler(req, res) {
  const DEFAULT_APK = 'https://github.com/pln-pcd/ka-clinic-system-final/releases/download/v1.0.28/ka-clinic-1.0.28.apk';
  let target = (process.env.PATIENT_APP_DOWNLOAD_URL || '').trim();
  if (!target.endsWith('.apk') || target.includes('/releases/tag') || !target.includes('/releases/download/')) {
    target = DEFAULT_APK;
  }
  res.writeHead(302, {
    'Location': target,
    'Content-Disposition': 'attachment; filename="ka-clinic-1.0.28.apk"',
  });
  res.end();
}
