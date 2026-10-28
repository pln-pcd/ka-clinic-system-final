export default function handler(req, res) {
  res.writeHead(302, {
    Location: '/downloads/ka-clinic.apk',
  });
  res.end();
}
