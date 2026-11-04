/* eslint @typescript-eslint/no-require-imports: "off" */
const { createHmac, timingSafeEqual } = require('node:crypto');

const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

function getSecret() {
  const secret = process.env.POS_API_TOKEN;
  if (!secret) throw new Error('POS_API_TOKEN is not configured on the server.');
  return secret;
}

function sign(value) {
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function createUserSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    userId: user.id,
    role: user.role,
    expiresAt: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyUserSessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims.userId !== 'string' || typeof claims.role !== 'string'
      || typeof claims.expiresAt !== 'number' || claims.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

module.exports = { createUserSessionToken, verifyUserSessionToken };
