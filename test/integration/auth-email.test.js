var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp } = require('../support/app');
var { hashToken, REFRESH_TOKEN_TTL_MS } = require('../../services/tokens');

useDatabase();
var app = buildApp();

function login(body) {
  return request(app).post('/auth/login').send(body);
}

test('sign-up creates the account and returns tokens', async function () {
  var body = await signUp(app, { username: '  Jo  ', email: '  Jo@Example.COM ' });
  assert.equal(typeof body.accessToken, 'string');
  assert.equal(typeof body.refreshToken, 'string');
  assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'username']);
  assert.equal(body.user.email, 'jo@example.com');
  assert.equal(body.user.username, 'Jo');
  assert.equal('isNewUser' in body, false);

  var user = await prisma.user.findUnique({ where: { UserId: body.user.id } });
  assert.match(user.PasswordHash, /^\$2b\$/);
});

test('refresh tokens are stored only as a SHA-256 hash with a 7-day expiry', async function () {
  var body = await signUp(app);
  var stored = await prisma.refreshToken.findMany({ where: { UserId: body.user.id } });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].TokenHash, hashToken(body.refreshToken));
  assert.notEqual(stored[0].TokenHash, body.refreshToken);
  assert.equal(stored[0].RevokedAt, null);
  assert.ok(Math.abs(stored[0].ExpiresAt.getTime() - (Date.now() + REFRESH_TOKEN_TTL_MS)) < 60 * 1000);
});

test('sign-up refuses an email that already has an account, in any letter case', async function () {
  await signUp(app, { email: 'jo@example.com' });
  var res = await request(app).post('/auth/signup').send({ username: 'Other', email: 'JO@example.com', password: 'another-password' });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: { code: 'CONFLICT', message: 'An account with this email already exists' } });
});

test('sign-up validates every field', async function () {
  var res = await request(app).post('/auth/signup').send({ username: ' ', email: 'not-an-email', password: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(res.body.error.details.map(function (detail) {
    return detail.path;
  }).sort(), ['email', 'password', 'username']);
});

test('sign-up rejects passwords longer than 72 bytes', async function () {
  // 37 characters but 74 bytes in UTF-8.
  var res = await request(app).post('/auth/signup').send({ username: 'Jo', email: 'jo@example.com', password: 'é'.repeat(37) });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details, [{ path: 'password', message: 'Password must be at most 72 bytes' }]);
});

test('login returns tokens for the right password, ignoring email case and spaces', async function () {
  var session = await signUp(app);
  var res = await login({ email: '  JO@example.com ', password: 'correct-horse-battery' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, session.user.id);
  assert.equal(typeof res.body.accessToken, 'string');
  assert.notEqual(res.body.refreshToken, session.refreshToken);
});

test('wrong password, unknown email and Google-only accounts all get the same 401', async function () {
  await signUp(app, { email: 'jo@example.com' });
  await prisma.user.create({ data: { Email: 'google@example.com', Username: 'G', PasswordHash: null } });
  var attempts = [
    { email: 'jo@example.com', password: 'wrong-password' },
    { email: 'nobody@example.com', password: 'whatever-password' },
    { email: 'google@example.com', password: 'whatever-password' },
  ];
  for (var attempt of attempts) {
    var res = await login(attempt);
    assert.equal(res.status, 401, attempt.email);
    assert.deepEqual(res.body, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } });
  }
});

test('deactivated users cannot log in', async function () {
  var session = await signUp(app);
  await prisma.user.update({ where: { UserId: session.user.id }, data: { IsActive: false } });
  var res = await login({ email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(res.status, 401);
});

test('login deletes the user\'s expired refresh tokens', async function () {
  var session = await signUp(app);
  await prisma.refreshToken.create({
    data: {
      UserId: session.user.id,
      TokenHash: 'b'.repeat(64),
      FamilyId: '00000000-0000-4000-8000-000000000002',
      ExpiresAt: new Date(Date.now() - 1000),
    },
  });
  var res = await login({ email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(res.status, 200);
  assert.equal(await prisma.refreshToken.count({ where: { TokenHash: 'b'.repeat(64) } }), 0);
  assert.equal(await prisma.refreshToken.count({ where: { UserId: session.user.id } }), 2);
});

test('auth endpoints are rate limited per IP', async function () {
  var limited = buildApp({ config: { rateLimits: { auth: 2, refresh: 1000 } } });
  var body = { email: 'nobody@example.com', password: 'whatever-password' };
  await request(limited).post('/auth/login').send(body).expect(401);
  await request(limited).post('/auth/login').send(body).expect(401);
  var res = await request(limited).post('/auth/login').send(body);
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } });
});
