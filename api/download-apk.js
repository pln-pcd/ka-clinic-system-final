export default function handler(req, res) {
  res.writeHead(302, {
    'Location': process.env.PATIENT_APP_DOWNLOAD_URL || 'https://github.com/pln-pcd/ka-clinic-system-final/releases/download/v1.0.28/ka-clinic-1.0.28.apk',
    'Content-Disposition': 'attachment; filename="ka-clinic-1.0.28.apk"',
  });
  res.end();
}
