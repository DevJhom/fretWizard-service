var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleFretboard, withSetup } = require('../support/fixtures');

useDatabase();
var app = buildApp();

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cardBody(overrides) {
  return Object.assign({ name: 'Minor shapes', setup: 'Scale', fretboards: [sampleFretboard()] }, overrides);
}

function createCard(session, body) {
  return request(app).post('/library-cards').set('Authorization', bearer(session)).send(body);
}

function listCards(session) {
  return request(app).get('/library-cards').set('Authorization', bearer(session));
}

function patchCard(session, id, body) {
  return request(app).patch('/library-cards/' + id).set('Authorization', bearer(session)).send(body);
}

function deleteCard(session, id) {
  return request(app).delete('/library-cards/' + id).set('Authorization', bearer(session));
}

test('library endpoints require an access token', async function () {
  var res = await request(app).get('/library-cards');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('creating a card returns it in the frontend shape', async function () {
  var session = await signUp(app);
  var before = Date.now();
  var res = await createCard(session, cardBody({ name: '  Minor shapes  ', fretboards: [sampleFretboard({ currentSetup: 'Chord' })] }));
  assert.equal(res.status, 201);
  assert.match(res.body.id, UUID);
  assert.equal(res.body.name, 'Minor shapes');
  assert.equal(res.body.setup, 'Scale');
  assert.deepEqual(res.body.fretboards, [sampleFretboard({ currentSetup: 'Scale' })]);
  assert.equal(res.body.isFavorite, false);
  assert.equal(typeof res.body.createdAt, 'number');
  assert.ok(res.body.createdAt >= before - 1000 && res.body.createdAt <= Date.now() + 1000);
});

test('listing returns only your own cards, oldest first', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  await createCard(jo, cardBody({ name: 'First' }));
  await createCard(sam, cardBody({ name: 'Not yours' }));
  await createCard(jo, cardBody({ name: 'Second', setup: 'Chord' }));

  var res = await listCards(jo);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map(function (card) {
    return card.name;
  }), ['First', 'Second']);
  assert.deepEqual(res.body[1].fretboards, withSetup([sampleFretboard()], 'Chord'));
});

test('a stack keeps its order', async function () {
  var session = await signUp(app);
  var stack = ['C', 'G♯', 'B♭'].map(function (key) {
    return sampleFretboard({ currentKey: key });
  });
  var res = await createCard(session, cardBody({ fretboards: stack }));
  assert.deepEqual(res.body.fretboards.map(function (fretboard) {
    return fretboard.currentKey;
  }), ['C', 'G♯', 'B♭']);
});

test('PATCH renames a card', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await patchCard(session, card.id, { name: 'Renamed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Renamed');
  assert.deepEqual(res.body.fretboards, card.fretboards);
});

test('PATCH replaces the whole stack', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody({ fretboards: [sampleFretboard(), sampleFretboard(), sampleFretboard()] }))).body;
  var res = await patchCard(session, card.id, { fretboards: [sampleFretboard({ currentKey: 'E' })] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.fretboards, [sampleFretboard({ currentKey: 'E' })]);
  assert.equal(await prisma.cardFretboard.count({ where: { CardId: card.id } }), 1);
});

test('PATCH favorites a card and leaves the rest alone', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await patchCard(session, card.id, { isFavorite: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.isFavorite, true);
  assert.equal(res.body.name, 'Minor shapes');
  assert.deepEqual(res.body.fretboards, card.fretboards);
  assert.equal((await listCards(session)).body[0].isFavorite, true);
});

test('PATCH unfavorites a card', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  await patchCard(session, card.id, { isFavorite: true });
  var res = await patchCard(session, card.id, { isFavorite: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.isFavorite, false);
});

test('renaming a favorite keeps it a favorite', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  await patchCard(session, card.id, { isFavorite: true });
  var res = await patchCard(session, card.id, { name: 'Renamed' });
  assert.equal(res.body.isFavorite, true);
});

test('isFavorite must be true or false', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await patchCard(session, card.id, { isFavorite: 'yes' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.equal((await listCards(session)).body[0].isFavorite, false);
});

test('PATCH needs a name, fretboards or isFavorite', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await patchCard(session, card.id, {});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('DELETE removes the card and its fretboards', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await deleteCard(session, card.id);
  assert.equal(res.status, 204);
  assert.deepEqual((await listCards(session)).body, []);
  assert.equal(await prisma.cardFretboard.count(), 0);
});

test('another user\'s card is not found and stays untouched', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  var card = (await createCard(jo, cardBody())).body;

  assert.equal((await patchCard(sam, card.id, { name: 'Mine now' })).status, 404);
  assert.equal((await deleteCard(sam, card.id)).status, 404);
  assert.deepEqual((await listCards(sam)).body, []);

  var joCards = (await listCards(jo)).body;
  assert.equal(joCards.length, 1);
  assert.equal(joCards[0].name, 'Minor shapes');
});

test('IDs that are not UUIDs are not found', async function () {
  var session = await signUp(app);
  assert.equal((await patchCard(session, '123', { name: 'x' })).status, 404);
  assert.equal((await deleteCard(session, 'not-a-uuid')).status, 404);
});

test('a library holds at most 200 cards', async function () {
  var session = await signUp(app);
  await prisma.libraryCard.createMany({
    data: Array.from({ length: 200 }, function (_, index) {
      return { UserId: session.user.id, Name: 'Card ' + index, Setup: 'Scale' };
    }),
  });
  var res = await createCard(session, cardBody());
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'LIMIT_EXCEEDED');
  assert.equal(await prisma.libraryCard.count({ where: { UserId: session.user.id } }), 200);
});

test('card bodies are validated', async function () {
  var session = await signUp(app);
  var bodies = [
    cardBody({ name: '   ' }),
    cardBody({ setup: 'Bass' }),
    cardBody({ fretboards: [] }),
    cardBody({ fretboards: Array(51).fill(sampleFretboard()) }),
    cardBody({ fretboards: [sampleFretboard({ fretAmount: 99 })] }),
  ];
  for (var body of bodies) {
    var res = await createCard(session, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
  }
  assert.equal(await prisma.libraryCard.count(), 0);
});
