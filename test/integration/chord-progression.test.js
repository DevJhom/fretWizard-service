var test = require('node:test');
var assert = require('node:assert/strict');
var { useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleProgression } = require('../support/fixtures');

useDatabase();
var app = buildApp();

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getProgression(session) {
  return request(app).get('/chord-progression').set('Authorization', bearer(session));
}

function putProgression(session, body) {
  return request(app).put('/chord-progression').set('Authorization', bearer(session)).send(body);
}

function degrees(progression) {
  return progression.map(function (chord) {
    return chord.degree;
  });
}

test('chord progression endpoints require an access token', async function () {
  var res = await request(app).get('/chord-progression');
  assert.equal(res.status, 401);
});

test('a progression that was never saved is not found', async function () {
  var session = await signUp(app);
  var res = await getProgression(session);
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('a saved progression reads back in order, with server-generated ids', async function () {
  var session = await signUp(app);
  var put = await putProgression(session, sampleProgression());
  assert.equal(put.status, 204);

  var res = await getProgression(session);
  assert.equal(res.status, 200);
  assert.equal(res.body.key, 'F♯');
  assert.equal(res.body.tonality, 'Minor');
  assert.deepEqual(degrees(res.body.progression), [0, 3, 4]);
  res.body.progression.forEach(function (chord) {
    assert.match(chord.id, UUID);
  });
});

test('PUT replaces the key and the chords, and an empty progression is allowed', async function () {
  var session = await signUp(app);
  await putProgression(session, sampleProgression());
  await putProgression(session, { key: 'G', tonality: 'Major', progression: [] });
  var res = await getProgression(session);
  assert.deepEqual(res.body, { key: 'G', tonality: 'Major', progression: [] });
});

test('each user sees only their own progression', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  await putProgression(jo, sampleProgression());
  assert.equal((await getProgression(sam)).status, 404);
});

test('the key must belong to the tonality', async function () {
  var session = await signUp(app);
  var bad = await putProgression(session, sampleProgression({ key: 'C♯', tonality: 'Major' }));
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details, [{ path: 'key', message: 'C♯ is not a Major progression key' }]);
  var good = await putProgression(session, sampleProgression({ key: 'C♯', tonality: 'Minor' }));
  assert.equal(good.status, 204);
});

test('tonality, degrees and length are validated', async function () {
  var session = await signUp(app);
  var cases = [
    [sampleProgression({ tonality: 'Lydian' }), 'tonality'],
    [sampleProgression({ progression: [{ id: 'x', degree: 7 }] }), 'progression.0.degree'],
    [sampleProgression({ progression: Array(101).fill({ id: 'x', degree: 1 }) }), 'progression'],
  ];
  for (var entry of cases) {
    var res = await putProgression(session, entry[0]);
    assert.equal(res.status, 400, entry[1]);
    assert.equal(res.body.error.details[0].path, entry[1]);
  }
});
