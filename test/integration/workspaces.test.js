var test = require('node:test');
var assert = require('node:assert/strict');
var { useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleFretboard, withSetup } = require('../support/fixtures');

useDatabase();
var app = buildApp();

function getWorkspace(session, setup) {
  return request(app).get('/workspaces/' + setup).set('Authorization', bearer(session));
}

function putWorkspace(session, setup, fretboards) {
  return request(app).put('/workspaces/' + setup).set('Authorization', bearer(session)).send({ fretboards: fretboards });
}

test('workspace endpoints require an access token', async function () {
  var res = await request(app).get('/workspaces/scale');
  assert.equal(res.status, 401);
});

test('a workspace that was never saved is not found', async function () {
  var session = await signUp(app);
  var res = await getWorkspace(session, 'scale');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('a saved workspace reads back exactly, in order', async function () {
  var session = await signUp(app);
  var noChordView = sampleFretboard({ currentKey: 'B♭', currentSetup: 'Chord' });
  delete noChordView.chordView;
  var stack = [sampleFretboard({ currentKey: 'C' }), noChordView, sampleFretboard({ currentKey: 'G♯' })];

  var put = await putWorkspace(session, 'scale', stack);
  assert.equal(put.status, 204);

  var res = await getWorkspace(session, 'scale');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { fretboards: withSetup(stack, 'Scale') });
  assert.equal('chordView' in res.body.fretboards[1], false);
});

test('PUT replaces the whole stack', async function () {
  var session = await signUp(app);
  await putWorkspace(session, 'chord', [sampleFretboard(), sampleFretboard(), sampleFretboard()]);
  await putWorkspace(session, 'chord', [sampleFretboard({ currentKey: 'E' })]);
  var res = await getWorkspace(session, 'chord');
  assert.deepEqual(res.body.fretboards, withSetup([sampleFretboard({ currentKey: 'E' })], 'Chord'));
});

test('the Scale and Chord workspaces are independent', async function () {
  var session = await signUp(app);
  await putWorkspace(session, 'scale', [sampleFretboard({ currentKey: 'A' })]);
  assert.equal((await getWorkspace(session, 'chord')).status, 404);
  await putWorkspace(session, 'chord', [sampleFretboard({ currentKey: 'D' })]);
  assert.equal((await getWorkspace(session, 'scale')).body.fretboards[0].currentKey, 'A');
  assert.equal((await getWorkspace(session, 'chord')).body.fretboards[0].currentKey, 'D');
});

test('each user sees only their own workspace', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  await putWorkspace(jo, 'scale', [sampleFretboard()]);
  assert.equal((await getWorkspace(sam, 'scale')).status, 404);
});

test('only scale and chord workspaces exist', async function () {
  var session = await signUp(app);
  for (var setup of ['bass', 'Scale', 'progression']) {
    assert.equal((await getWorkspace(session, setup)).status, 404, setup);
    assert.equal((await putWorkspace(session, setup, [sampleFretboard()])).status, 404, setup);
  }
});

test('workspace bodies are validated', async function () {
  var session = await signUp(app);
  var res = await putWorkspace(session, 'scale', []);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details[0].path, 'fretboards');
  assert.equal((await getWorkspace(session, 'scale')).status, 404);
});
