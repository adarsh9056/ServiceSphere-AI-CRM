const jwt = require('jsonwebtoken');

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type === 'Bearer' && token) return token;
  return null;
}

function authMiddleware(prisma) {
  return async (req) => {
    const token = getTokenFromRequest(req);
    if (!token) return { user: null };

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true, role: true },
      });
      return { user };
    } catch {
      return { user: null };
    }
  };
}

function requireAuth(user) {
  if (!user) {
    const err = new Error('Unauthorized');
    err.extensions = { code: 'UNAUTHENTICATED' };
    throw err;
  }
}

function requireRole(user, ...roles) {
  requireAuth(user);
  if (!roles.includes(user.role)) {
    const err = new Error('Forbidden');
    err.extensions = { code: 'FORBIDDEN' };
    throw err;
  }
}

module.exports = { getTokenFromRequest, authMiddleware, requireAuth, requireRole };
