var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleFretboard, sampleProgression } = require('../support/fixtures');

useDatabase();
var app = buildApp();

function importBody() {
  return {
    libraryCards: [
      { name: 'One', setup: 'Scale', fretboards: [sampleFretboard({ currentKey: 'C' })] },
      { name: 'Two', setup: 'Chord', fretboards: [sampleFretboard({ currentKey: 'D' }), sampleFretboard({ currentKey: 'E' })] },
      { name: 'Three', setup: 'Scale', fretboards: [sampleFretboard({ currentKey: 'G' })] },
    ],
    workspaces: {
      scale: { fretboards: [sampleFretboard({ currentKey: 'A' })] },
      chord: { fretboards: [sampleFretboard({ currentKey: 'B' })] },
    },
    chordProgression: sampleProgression(),
  };
}

function postImport(session, body) {
  return request(app).post('/me/import').set('Authorization', bearer(session)).send(body);
}

function get(session, path) {
  return request(app).get(path).set('Authorization', bearer(session));
}

function put(session, path, body) {
  return request(app).put(path).set('Authorization', bearer(session)).send(body);
}

function names(cards) {
  return cards.map(function (card) {
    return card.name;
  });
}

test('import fills an empty account and keeps the browser\'s card order', async function () {
  var session = await signUp(app);
  var res = await postImport(session, importBody());
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { importedCards: 3, appliedWorkspaces: ['scale', 'chord'], appliedChordProgression: true });

  var cards = (await get(session, '/library-cards')).body;
  assert.deepEqual(names(cards), ['One', 'Two', 'Three']);
  assert.deepEqual(cards[1].fretboards.map(function (fretboard) {
    return fretboard.currentKey;
  }), ['D', 'E']);
  assert.equal((await get(session, '/workspaces/scale')).body.fretboards[0].currentKey, 'A');
  assert.equal((await get(session, '/workspaces/chord')).body.fretboards[0].currentKey, 'B');
  assert.equal((await get(session, '/chord-progression')).body.key, 'F♯');
});

test('imported cards keep their favorite state', async function () {
  var session = await signUp(app);
  var body = importBody();
  body.libraryCards[1].isFavorite = true;
  body.libraryCards[2].isFavorite = false;

  var res = await postImport(session, body);
  assert.equal(res.status, 200);

  var cards = (await get(session, '/library-cards')).body;
  assert.deepEqual(cards.map(function (card) {
    return card.isFavorite;
  }), [false, true, false]);
});

test('the account wins for workspaces and the progression; cards are appended', async function () {
  var session = await signUp(app);
  await put(session, '/workspaces/scale', { fretboards: [sampleFretboard({ currentKey: 'F' })] });
  await put(session, '/chord-progression', sampleProgression({ key: 'C', tonality: 'Major' }));
  await request(app).post('/library-cards').set('Authorization', bearer(session))
    .send({ name: 'Existing', setup: 'Scale', fretboards: [sampleFretboard()] }).expect(201);

  var res = await postImport(session, importBody());
  assert.deepEqual(res.body, { importedCards: 3, appliedWorkspaces: ['chord'], appliedChordProgression: false });

  assert.equal((await get(session, '/workspaces/scale')).body.fretboards[0].currentKey, 'F');
  assert.equal((await get(session, '/workspaces/chord')).body.fretboards[0].currentKey, 'B');
  assert.equal((await get(session, '/chord-progression')).body.key, 'C');
  assert.deepEqual(names((await get(session, '/library-cards')).body), ['Existing', 'One', 'Two', 'Three']);
});

test('one invalid item rejects the whole import', async function () {
  var session = await signUp(app);
  var body = importBody();
  body.libraryCards[1].fretboards[0].fretAmount = 99;

  var res = await postImport(session, body);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details[0].path, 'libraryCards.1.fretboards.0.fretAmount');
  assert.equal(await prisma.libraryCard.count(), 0);
  assert.equal((await get(session, '/workspaces/scale')).status, 404);
  assert.equal((await get(session, '/chord-progression')).status, 404);
});

test('an import that would pass 200 cards is refused and changes nothing', async function () {
  var session = await signUp(app);
  await prisma.libraryCard.createMany({
    data: Array.from({ length: 199 }, function (_, index) {
      return { UserId: session.user.id, Name: 'Card ' + index, Setup: 'Scale' };
    }),
  });

  var res = await postImport(session, importBody());
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'LIMIT_EXCEEDED');
  assert.equal(await prisma.libraryCard.count({ where: { UserId: session.user.id } }), 199);
  assert.equal((await get(session, '/workspaces/scale')).status, 404);
});

test('an empty import changes nothing', async function () {
  var session = await signUp(app);
  var res = await postImport(session, {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { importedCards: 0, appliedWorkspaces: [], appliedChordProgression: false });
});

test('import requires an access token', async function () {
  var res = await request(app).post('/me/import').send(importBody());
  assert.equal(res.status, 401);
});
