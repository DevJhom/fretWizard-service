var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, fakeGoogleVerifier, signUp } = require('../support/app');

useDatabase();

var identities = {
  'token-new': { sub: 'google-1', email: 'Jo@Example.com', emailVerified: true, name: '  Jo Smith  ' },
  'token-no-name': { sub: 'google-2', email: 'sam@example.com', emailVerified: true, name: undefined },
  'token-unverified': { sub: 'google-3', email: 'unverified@example.com', emailVerified: false, name: 'U' },
  'token-existing': { sub: 'google-4', email: 'jo@example.com', emailVerified: true, name: 'Jo From Google' },
};
var app = buildApp({ googleVerifier: fakeGoogleVerifier(identities) });

function google(idToken) {
  return request(app).post('/auth/google').send({ idToken: idToken });
}

test('a first Google sign-in creates an account', async function () {
  var res = await google('token-new');
  assert.equal(res.status, 200);
  assert.equal(res.body.isNewUser, true);
  assert.equal(res.body.user.email, 'jo@example.com');
  assert.equal(res.body.user.username, 'Jo Smith');
  assert.equal(typeof res.body.accessToken, 'string');
  assert.equal(typeof res.body.refreshToken, 'string');

  var user = await prisma.user.findUnique({ where: { UserId: res.body.user.id }, include: { Logins: true } });
  assert.equal(user.PasswordHash, null);
  assert.deepEqual(user.Logins.map(function (login) {
    return [login.Provider, login.ProviderUserId];
  }), [['google', 'google-1']]);
});

test('signing in again with the same Google account returns the same user', async function () {
  var first = await google('token-new');
  var second = await google('token-new');
  assert.equal(second.status, 200);
  assert.equal(second.body.isNewUser, false);
  assert.equal(second.body.user.id, first.body.user.id);
  assert.equal(await prisma.user.count(), 1);
});

test('a missing Google name falls back to the part of the email before @', async function () {
  var res = await google('token-no-name');
  assert.equal(res.body.user.username, 'sam');
});

test('Google sign-in links an existing password account and clears its password', async function () {
  var session = await signUp(app, { email: 'jo@example.com' });

  var res = await google('token-existing');
  assert.equal(res.status, 200);
  assert.equal(res.body.isNewUser, false);
  assert.equal(res.body.user.id, session.user.id);
  assert.equal(res.body.user.username, 'Jo');

  var user = await prisma.user.findUnique({ where: { UserId: session.user.id } });
  assert.equal(user.PasswordHash, null);

  var oldSession = await request(app).post('/auth/refresh').send({ refreshToken: session.refreshToken });
  assert.equal(oldSession.status, 401);
  var passwordLogin = await request(app).post('/auth/login').send({ email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(passwordLogin.status, 401);
  var googleSession = await request(app).post('/auth/refresh').send({ refreshToken: res.body.refreshToken });
  assert.equal(googleSession.status, 200);
});

test('unverified emails and invalid ID tokens are rejected', async function () {
  for (var idToken of ['token-unverified', 'forged-token']) {
    var res = await google(idToken);
    assert.equal(res.status, 401, idToken);
    assert.deepEqual(res.body, { error: { code: 'UNAUTHORIZED', message: 'Google login failed' } });
  }
  assert.equal(await prisma.user.count(), 0);
});

test('a deactivated account cannot sign in with Google', async function () {
  var first = await google('token-new');
  await prisma.user.update({ where: { UserId: first.body.user.id }, data: { IsActive: false } });
  var res = await google('token-new');
  assert.equal(res.status, 401);
});

test('email sign-up is refused for an email that belongs to a Google account', async function () {
  await google('token-new');
  var res = await request(app).post('/auth/signup').send({ username: 'Jo', email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(res.status, 409);
});

test('idToken is required', async function () {
  var res = await request(app).post('/auth/google').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details[0].path, 'idToken');
});
