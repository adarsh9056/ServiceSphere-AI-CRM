const COOKIE_REFRESH = 'crm_rt';

function refreshCookieBaseOptions() {
  const days = Number(process.env.JWT_REFRESH_DAYS || 30);
  const maxAgeMs = days * 24 * 60 * 60 * 1000;
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    process.env.COOKIE_SECURE === '1' ||
    (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
  return {
    httpOnly: true,
    secure,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function setRefreshTokenCookie(res, token) {
  if (!res?.cookie) return;
  res.cookie(COOKIE_REFRESH, token, refreshCookieBaseOptions());
}

function clearRefreshTokenCookie(res) {
  if (!res?.clearCookie) return;
  res.clearCookie(COOKIE_REFRESH, { path: '/' });
}

function getRefreshTokenFromRequest(req) {
  return req.cookies?.[COOKIE_REFRESH] || null;
}

module.exports = {
  COOKIE_REFRESH,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
};
