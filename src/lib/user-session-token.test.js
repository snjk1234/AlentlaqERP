const test = require('node:test');
const assert = require('node:assert/strict');
const { createUserSessionToken, verifyUserSessionToken } = require('./user-session-token');

test('session token verifies its signed user and role claims', () => {
  process.env.POS_API_TOKEN = 'test-session-signing-secret';
  const token = createUserSessionToken({ id: 'admin-1', role: 'ADMIN' });

  assert.deepEqual(
    (({ userId, role }) => ({ userId, role }))(verifyUserSessionToken(token)),
    { userId: 'admin-1', role: 'ADMIN' }
  );
});

test('session token rejects tampering and missing tokens', () => {
  process.env.POS_API_TOKEN = 'test-session-signing-secret';
  const token = createUserSessionToken({ id: 'admin-1', role: 'ADMIN' });

  assert.equal(verifyUserSessionToken(`${token}x`), null);
  assert.equal(verifyUserSessionToken(null), null);
});
