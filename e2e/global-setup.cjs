/**
 * Seeds the first inbound message for the Playwright spec and writes e2e/.fixture.json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

module.exports = async function globalSetup() {
  const serverEnvPath = path.join(__dirname, '..', 'server', '.env');
  if (!fs.existsSync(serverEnvPath)) {
    if (process.env.DATABASE_URL) {
      const lines = [
        `DATABASE_URL=${process.env.DATABASE_URL}`,
        `JWT_SECRET=${process.env.JWT_SECRET || 'ci-e2e-placeholder-not-for-production-32chars'}`,
        `CLIENT_ORIGIN=${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}`,
      ];
      fs.writeFileSync(serverEnvPath, `${lines.join('\n')}\n`, 'utf8');
    } else {
      throw new Error(
        `Missing server/.env — copy server/.env.example and set DATABASE_URL (see README), or set DATABASE_URL in the environment (CI).`,
      );
    }
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
