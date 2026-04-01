/**
 * Preloads env for `npm test` so DATABASE_URL works from a fresh shell.
 */
const path = require('path');
const fs = require('fs');

const serverRoot = path.join(__dirname, '..');

function tryLoad(file) {
  const p = path.join(serverRoot, file);
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    return true;
  }
  return false;
}

tryLoad('.env.test');
tryLoad('.env');

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set. Copy server/.env.example to server/.env (or .env.test) and set DATABASE_URL.',
  );
  process.exit(1);
}
