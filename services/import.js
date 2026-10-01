var library = require('./library');
var workspaces = require('./workspaces');
var chordProgression = require('./chordProgression');

var IMPORT_TIMEOUT_MS = 30 * 1000;

// Cards are always added. Workspaces and the progression only fill empty slots:
// if the account already has its own, the account wins.
async function importGuestData(prisma, userId, input) {
  var cards = input.libraryCards || [];
  var incomingWorkspaces = input.workspaces || {};

  return prisma.$transaction(async function (tx) {
    await library.assertCardCapacity(tx, userId, cards.length);
    var startedAt = Date.now();
    for (var i = 0; i < cards.length; i++) {
      // One millisecond apart, so the Library lists them in the browser's order.
      await library.createCard(tx, userId, cards[i], new Date(startedAt + i));
    }

    var appliedWorkspaces = [];
    for (var param of ['scale', 'chord']) {
      var setup = workspaces.setupFromParam(param);
      if (incomingWorkspaces[param] && !(await workspaces.hasWorkspace(tx, userId, setup))) {
        await workspaces.replaceWorkspace(tx, userId, setup, incomingWorkspaces[param].fretboards);
        appliedWorkspaces.push(param);
      }
    }

    var appliedChordProgression = false;
    if (input.chordProgression && !(await chordProgression.hasProgression(tx, userId))) {
      await chordProgression.replaceProgression(tx, userId, input.chordProgression);
      appliedChordProgression = true;
    }

    return {
      importedCards: cards.length,
      appliedWorkspaces: appliedWorkspaces,
      appliedChordProgression: appliedChordProgression,
    };
  }, { timeout: IMPORT_TIMEOUT_MS });
}

module.exports = { importGuestData };
