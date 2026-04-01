const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function jwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret';
}

function accessExpiresIn() {
  return process.env.JWT_ACCESS_EXPIRES_IN || (process.env.NODE_ENV === 'production' ? '15m' : '7d');
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret(), {
    expiresIn: accessExpiresIn(),
  });
}

const REFRESH_DAYS = Number(process.env.JWT_REFRESH_DAYS || 30);

async function createRefreshToken(prisma, userId) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  return raw;
}

async function consumeRefreshToken(prisma, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.expiresAt < new Date()) {
    if (row) await prisma.refreshToken.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  await prisma.refreshToken.delete({ where: { id: row.id } });
  const user = row.user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

module.exports = {
  signAccessToken,
  createRefreshToken,
  consumeRefreshToken,
  accessExpiresIn,
};
