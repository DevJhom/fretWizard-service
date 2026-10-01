var test = require('node:test');
var assert = require('node:assert/strict');
var jwt = require('jsonwebtoken');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { testConfig } = require('../support/config');

useDatabase();
var app = buildApp();

test('GET /me returns the signed-in user', async function () {
  var session = await signUp(app);
  var res = await request(app).get('/me').set('Authorization', bearer(session));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, session.user);
});

test('requests without a valid access token get 401', async function () {
  var session = await signUp(app);
  var secret = testConfig().jwtSecret;
  var headers = [
    null,
    'Bearer not-a-jwt',
    'Token ' + session.accessToken,
    'Bearer ' + jwt.sign({ sub: session.user.id }, 'another-secret-that-is-also-32-characters'),
    'Bearer ' + jwt.sign({ sub: session.user.id, exp: Math.floor(Date.now() / 1000) - 10 }, secret),
    'Bearer ' + jwt.sign({ userId: session.user.id }, secret),
  ];
  for (var header of headers) {
    var pending = request(app).get('/me');
    if (header) pending = pending.set('Authorization', header);
    var res = await pending;
    assert.equal(res.status, 401, String(header));
    assert.equal(res.body.error.code, 'UNAUTHORIZED', String(header));
  }
});

test('GET /me refuses a deactivated user', async function () {
  var session = await signUp(app);
  await prisma.user.update({ where: { UserId: session.user.id }, data: { IsActive: false } });
  var res = await request(app).get('/me').set('Authorization', bearer(session));
  assert.equal(res.status, 401);
});

test('PATCH /me changes the display name', async function () {
  var session = await signUp(app);
  var res = await request(app).patch('/me').set('Authorization', bearer(session)).send({ username: '  Jordan  ' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: session.user.id, email: 'jo@example.com', username: 'Jordan' });
  var user = await prisma.user.findUnique({ where: { UserId: session.user.id } });
  assert.equal(user.Username, 'Jordan');
});

test('PATCH /me validates the display name', async function () {
  var session = await signUp(app);
  for (var username of ['', '   ', 'x'.repeat(101)]) {
    var res = await request(app).patch('/me').set('Authorization', bearer(session)).send({ username: username });
    assert.equal(res.status, 400, JSON.stringify(username));
    assert.equal(res.body.error.details[0].path, 'username');
  }
});
