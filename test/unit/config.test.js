var test = require('node:test');
var assert = require('node:assert/strict');
var { loadConfig } = require('../../lib/config');

var validEnv = {
  DATABASE_URL: 'postgresql://fretwizard:secret@localhost:5432/fretwizard',
  JWT_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  CORS_ORIGINS: 'http://localhost:5173, https://devjhom.github.io',
};

function envWith(overrides) {
  return Object.assign({}, validEnv, overrides);
}

test('loadConfig reads the environment', function () {
  var config = loadConfig(validEnv);
  assert.equal(config.port, '3000');
  assert.equal(config.jwtSecret, 'a'.repeat(32));
  assert.equal(config.googleClientId, 'client-id.apps.googleusercontent.com');
  assert.deepEqual(config.corsOrigins, ['http://localhost:5173', 'https://devjhom.github.io']);
  assert.equal(config.trustProxy, false);
  assert.equal(config.bcryptCost, 12);
  assert.deepEqual(config.rateLimits, { auth: 10, refresh: 60 });
  assert.equal(config.logRequests, true);
});

test('loadConfig names every missing variable', function () {
  assert.throws(function () {
    loadConfig({});
  }, /DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, CORS_ORIGINS/);
});

test('loadConfig rejects a JWT secret shorter than 32 characters', function () {
  assert.throws(function () {
    loadConfig(envWith({ JWT_SECRET: 'short' }));
  }, /at least 32 characters/);
});

test('loadConfig parses TRUST_PROXY and PORT', function () {
  assert.equal(loadConfig(envWith({ TRUST_PROXY: 'true' })).trustProxy, true);
  assert.equal(loadConfig(envWith({ TRUST_PROXY: '1' })).trustProxy, 1);
  assert.equal(loadConfig(envWith({ TRUST_PROXY: 'loopback' })).trustProxy, 'loopback');
  assert.equal(loadConfig(envWith({ PORT: '4000' })).port, '4000');
});
