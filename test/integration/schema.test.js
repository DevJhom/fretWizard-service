var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');

useDatabase();

var fretboardColumns = {
  Position: 0,
  KeyName: 'F♯',
  Accidental: 'sharp',
  Tonality: 'Minor',
  Pattern: 'Triad',
  FretAmount: 22,
  ChordPosition: 2,
  ChordView: 'fingering',
  ShapeC: false,
  ShapeA: true,
  ShapeG: false,
  ShapeE: false,
  ShapeD: false,
  StringLowE: true,
  StringA: true,
  StringD: false,
  StringG: true,
  StringB: true,
  StringHighE: false,
  HighlightNotes: '["roots","minor thirds","fifths"]',
};

function createUserWithEverything() {
  return prisma.user.create({
    data: {
      Email: 'jo@example.com',
      Username: 'Jo',
      Logins: { create: { Provider: 'google', ProviderUserId: 'google-sub-1' } },
      RefreshTokens: {
        create: {
          TokenHash: 'a'.repeat(64),
          FamilyId: '00000000-0000-4000-8000-000000000001',
          ExpiresAt: new Date(Date.now() + 60 * 1000),
        },
      },
      LibraryCards: { create: { Name: 'Card 1', Setup: 'Chord', Fretboards: { create: [fretboardColumns] } } },
      WorkspaceFretboards: { create: [Object.assign({ Setup: 'Scale' }, fretboardColumns)] },
      ChordProgression: { create: { KeyName: 'F♯', Tonality: 'Minor', Chords: { create: [{ Position: 0, Degree: 3 }] } } },
    },
  });
}

test('stores Unicode note names and low/high E strings unchanged', async function () {
  var user = await createUserWithEverything();
  var workspaceRow = await prisma.workspaceFretboard.findFirst({ where: { UserId: user.UserId } });
  assert.equal(workspaceRow.KeyName, 'F♯');
  assert.equal(workspaceRow.StringLowE, true);
  assert.equal(workspaceRow.StringHighE, false);
  var card = await prisma.libraryCard.findFirst({ where: { UserId: user.UserId }, include: { Fretboards: true } });
  assert.equal(card.Fretboards[0].KeyName, 'F♯');
  var progression = await prisma.chordProgression.findUnique({ where: { UserId: user.UserId } });
  assert.equal(progression.KeyName, 'F♯');
});

test('deleting a user removes everything that belongs to them', async function () {
  var user = await createUserWithEverything();
  await prisma.user.delete({ where: { UserId: user.UserId } });
  var counts = await Promise.all([
    prisma.userLogin.count(),
    prisma.refreshToken.count(),
    prisma.libraryCard.count(),
    prisma.cardFretboard.count(),
    prisma.workspaceFretboard.count(),
    prisma.chordProgression.count(),
    prisma.progressionChord.count(),
  ]);
  assert.deepEqual(counts, [0, 0, 0, 0, 0, 0, 0]);
});
