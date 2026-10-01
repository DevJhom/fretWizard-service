var test = require('node:test');
var assert = require('node:assert/strict');
var request = require('supertest');
var { createApp } = require('../../app');
var { testConfig } = require('../support/config');

var app = createApp({ prisma: {}, config: testConfig(), googleVerifier: null });

test('GET /health reports ok', async function () {
  var res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('unknown and removed routes return a JSON 404', async function () {
  for (var path of ['/nope', '/users', '/cards', '/fretboards']) {
    var res = await request(app).get(path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Not found' } }, path);
  }
});

test('malformed JSON returns VALIDATION_ERROR', async function () {
  var res = await request(app).post('/health').set('Content-Type', 'application/json').send('{"broken"');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } });
});

test('bodies over 1 MB return VALIDATION_ERROR', async function () {
  var res = await request(app).post('/health').send({ blob: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: { code: 'VALIDATION_ERROR', message: 'Request body too large' } });
});

test('CORS allows configured origins only', async function () {
  var allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
  var blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});
