// Reports paths and rule names only, never credential values.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const patterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['service-key', /\b(?:sk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{20,})\b/],
  ['credential-url', /https?:\/\/[^\s/@:]+:[^\s/@]+@/],
  ['assigned-secret', /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[=:]\s*["'][A-Za-z0-9_+\/-]{16,}["']/i],
  ['personal-path', /\/(?:Users|home)\/[a-zA-Z][^/\s"']+\//]
];
const findings = [];
function check(name, data) {
  if (/(?:^|\/)\.env(?:\.|$)|\.(?:pem|p12|pfx|key)$|(?:^|\/)(?:id_rsa|credentials\.json)$/.test(name)) findings.push([name, 'sensitive-filename']);
  if (data.includes('\0')) return;
  for (const [rule, pattern] of patterns) if (pattern.test(data)) findings.push([name, rule]);
}
const trackedOnly = process.argv.includes('--tracked');
const files = git(['ls-files', '-z', ...(trackedOnly ? [] : ['--cached', '--others', '--exclude-standard'])]).split('\0').filter(Boolean);
for (const name of new Set(files)) if (fs.existsSync(name) && fs.statSync(name).isFile()) check(name, fs.readFileSync(name, 'utf8'));
let blobs = 0;
if (process.argv.includes('--history')) {
  const objects = git(['rev-list', '--objects', '--all']).trim().split('\n');
  for (const entry of objects) {
    const space = entry.indexOf(' '); if (space < 0) continue;
    const hash = entry.slice(0, space), name = entry.slice(space + 1);
    if (git(['cat-file', '-t', hash]).trim() !== 'blob') continue;
    check(`history:${hash.slice(0, 8)}:${name}`, git(['cat-file', '-p', hash])); blobs++;
  }
  const emails = git(['log', '--all', '--format=%ae%n%ce']).trim().split('\n').filter(Boolean);
  console.log('Commit metadata uses GitHub no-reply addresses only:', emails.every(email => email.endsWith('@users.noreply.github.com')));
}
console.log(JSON.stringify({ files: new Set(files).size, historyBlobs: blobs, findings }, null, 2));
if (findings.length) process.exitCode = 1;
