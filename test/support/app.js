var assert = require('node:assert/strict');
var request = require('supertest');
var { createApp } = require('../../app');
var { prisma } = require('./db');
var { testConfig } = require('./config');

function fakeGoogleVerifier(identities) {
  return {
    verify: async function (idToken) {
      if (!Object.prototype.hasOwnProperty.call(identities, idToken)) {
        throw new Error('Invalid Google ID token');
      }
      return identities[idToken];
    },
  };
}

function buildApp(options) {
  options = options || {};
  return createApp({
    prisma: prisma,
    config: testConfig(options.config),
    googleVerifier: options.googleVerifier || fakeGoogleVerifier({}),
  });
}

async function signUp(app, overrides) {
  var body = Object.assign({ username: 'Jo', email: 'jo@example.com', password: 'correct-horse-battery' }, overrides);
  var res = await request(app).post('/auth/signup').send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

function bearer(session) {
  return 'Bearer ' + session.accessToken;
}

module.exports = { request, buildApp, fakeGoogleVerifier, signUp, bearer };
