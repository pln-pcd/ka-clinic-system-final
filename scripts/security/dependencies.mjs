import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const results = [], audits = {};
for (const [name, cwd] of [['server', '.'], ['admin', 'ka-clinic-admin'], ['patient', 'patient-app']]) {
  const child = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  const audit = JSON.parse(child.stdout);
  audits[name] = { vulnerabilities: audit.metadata.vulnerabilities, advisories: Object.values(audit.vulnerabilities || {}).flatMap(v => v.via.filter(a => typeof a === 'object').map(a => ({ package: a.name, title: a.title, url: a.url, severity: a.severity }))).filter((v, i, all) => all.findIndex(a => a.url === v.url) === i) };
  const count = audit.metadata.vulnerabilities.total;
  results.push({ id: `DEPENDENCIES-${name}`, area: 8, description: `${name} dependency audit`, steps: `npm audit --json in ${cwd}`, expected: 'Zero published advisories', actual: `${count} affected package entries; ${audits[name].advisories.length} root advisories`, status: count === 0 ? 'PASS' : 'FAIL' });
}
writeFileSync('docs/security-results/dependencies-after.json', JSON.stringify({ date: new Date().toISOString(), audits, results }, null, 2));
console.log(Object.entries(audits).map(([name, a]) => `${name}: ${a.vulnerabilities.total} affected entries`).join('\n'));
process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
