var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp } = require('../support/app');
var { hashToken, REFRESH_TOKEN_TTL_MS } = require('../../services/tokens');

useDatabase();
var app = buildApp();

function refresh(token) {
  return request(app).post('/auth/refresh').send({ refreshToken: token });
}

function findToken(token) {
  return prisma.refreshToken.findUnique({ where: { TokenHash: hashToken(token) } });
}

test('refresh rotates the token pair within the same family', async function () {
  var session = await signUp(app);
  var res = await refresh(session.refreshToken);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['accessToken', 'refreshToken']);
  assert.notEqual(res.body.refreshToken, session.refreshToken);

  var old = await findToken(session.refreshToken);
  var fresh = await findToken(res.body.refreshToken);
  assert.ok(old.RevokedAt instanceof Date);
  assert.equal(fresh.FamilyId, old.FamilyId);
  assert.equal(fresh.RevokedAt, null);
  assert.ok(Math.abs(fresh.ExpiresAt.getTime() - (Date.now() + REFRESH_TOKEN_TTL_MS)) < 60 * 1000);

  await request(app).get('/me').set('Authorization', 'Bearer ' + res.body.accessToken).expect(200);
});

test('reusing a rotated token revokes the whole family', async function () {
  var session = await signUp(app);
  var first = await refresh(session.refreshToken);
  assert.equal(first.status, 200);

  var reuse = await refresh(session.refreshToken);
  assert.equal(reuse.status, 401);
  assert.equal(reuse.body.error.code, 'UNAUTHORIZED');

  var afterReuse = await refresh(first.body.refreshToken);
  assert.equal(afterReuse.status, 401);
});

test('revoking one family leaves the user\'s other sessions working', async function () {
  var session = await signUp(app);
  var otherLogin = await request(app).post('/auth/login').send({ email: 'jo@example.com', password: 'correct-horse-battery' });
  await refresh(session.refreshToken);
  await refresh(session.refreshToken);

  var other = await refresh(otherLogin.body.refreshToken);
  assert.equal(other.status, 200);
});

test('expired refresh tokens are rejected', async function () {
  var session = await signUp(app);
  await prisma.refreshToken.updateMany({ where: { UserId: session.user.id }, data: { ExpiresAt: new Date(Date.now() - 1000) } });
  var res = await refresh(session.refreshToken);
  assert.equal(res.status, 401);
});

test('unknown refresh tokens are rejected', async function () {
  var res = await refresh('not-a-real-token');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('deactivated users cannot refresh, and their family is revoked', async function () {
  var session = await signUp(app);
  await prisma.user.update({ where: { UserId: session.user.id }, data: { IsActive: false } });
  var res = await refresh(session.refreshToken);
  assert.equal(res.status, 401);
  var stored = await findToken(session.refreshToken);
  assert.ok(stored.RevokedAt instanceof Date);
});

test('logout revokes the family and always answers 204', async function () {
  var session = await signUp(app);
  await request(app).post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
  assert.equal((await refresh(session.refreshToken)).status, 401);

  await request(app).post('/auth/logout').send({ refreshToken: 'unknown-token' }).expect(204);

  var missing = await request(app).post('/auth/logout').send({});
  assert.equal(missing.status, 400);
});

test('refresh is rate limited per IP', async function () {
  var limited = buildApp({ config: { rateLimits: { auth: 1000, refresh: 1 } } });
  await request(limited).post('/auth/refresh').send({ refreshToken: 'x' }).expect(401);
  var res = await request(limited).post('/auth/refresh').send({ refreshToken: 'x' });
  assert.equal(res.status, 429);
});
