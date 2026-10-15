import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Never print matching values: CI logs and reports are public too.
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const findings = [];
const known = [];
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([\w]+)\s*=\s*(.*)$/);
    if (!match || !/(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|REDIS_URL)/.test(match[1])) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= 20 && !/replace-with|example|localhost|127\.0\.0\.1/.test(value))
      known.push(value);
  }
}
const signatures = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Stripe secret', /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ['Slack credential', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['OpenAI credential', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/],
];
function inspect(file) {
  if (!existsSync(file)) return;
  const buffer = readFileSync(file);
  if (buffer.includes(0)) return;
  const content = buffer.toString('utf8');
  for (const [rule, pattern] of signatures)
    if (pattern.test(content)) findings.push({ file, rule });
  if (known.some((value) => content.includes(value)))
    findings.push({ file, rule: 'local credential copied into published content' });
  if (
    /^src\//.test(file) &&
    /(?:import\.meta\.env|process\.env)\.[\w]*(?:SECRET|PRIVATE_KEY|PASSWORD|API_KEY)/i.test(
      content,
    )
  )
    findings.push({ file, rule: 'server credential referenced in frontend' });
}
for (const file of tracked) {
  const name = path.posix.basename(file);
  if (
    (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') ||
    /\.(?:pem|p12|pfx|key)$/i.test(name) ||
    /^(?:id_rsa|id_ed25519)$/.test(name) ||
    /^deploy\/.*\.local\.ya?ml$/.test(file)
  )
    findings.push({ file, rule: 'private configuration tracked by Git' });
  inspect(file);
}
function scanBuild(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scanBuild(file);
    else inspect(file);
  }
}
if (existsSync('build')) scanBuild('build');
console.log(
  JSON.stringify(
    { trackedFiles: tracked.length, localCredentialsCompared: known.length, findings },
    null,
    2,
  ),
);
if (findings.length) process.exitCode = 1;
