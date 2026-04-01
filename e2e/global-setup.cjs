/**
 * Seeds the first inbound message for the Playwright spec and writes e2e/.fixture.json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = async function globalSetup() {
  const serverEnvPath = path.join(__dirname, '..', 'server', '.env');
  if (!fs.existsSync(serverEnvPath)) {
    throw new Error(
      `Missing server/.env — copy server/.env.example and set DATABASE_URL (see README).`,
    );
  }

  const script = path.join(__dirname, 'scripts', 'seed-inbound-email.cjs');
  const subject = `E2E Playwright A ${Date.now()}`;
  const r = spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      E2E_INBOUND_SUBJECT: subject,
    },
  });

  if (r.status !== 0) {
    throw new Error(`seed-inbound-email failed:\n${r.stderr || r.stdout}`);
  }

  const lines = r.stdout.trim().split('\n').filter(Boolean);
  const jsonLine = lines[lines.length - 1];
  let fixture;
  try {
    fixture = JSON.parse(jsonLine);
  } catch {
    throw new Error(`Bad seed output (expected JSON line):\n${r.stdout}`);
  }

  const outPath = path.join(__dirname, '.fixture.json');
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2), 'utf8');
  process.stderr.write(`[e2e global-setup] wrote ${outPath} subject=${fixture.subject}\n`);
};
