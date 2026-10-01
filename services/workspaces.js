var { toFretboardData, toStackRows } = require('../mappers/fretboard');

var SETUP_BY_PARAM = { scale: 'Scale', chord: 'Chord' };

function setupFromParam(param) {
  return Object.prototype.hasOwnProperty.call(SETUP_BY_PARAM, param) ? SETUP_BY_PARAM[param] : null;
}

// No rows for (UserId, Setup) means the workspace was never saved.
async function getWorkspace(db, userId, setup) {
  var rows = await db.workspaceFretboard.findMany({
    where: { UserId: userId, Setup: setup },
    orderBy: { Position: 'asc' },
  });
  if (rows.length === 0) return null;
  return {
    fretboards: rows.map(function (row) {
      return toFretboardData(row, setup);
    }),
  };
}

async function hasWorkspace(db, userId, setup) {
  return (await db.workspaceFretboard.count({ where: { UserId: userId, Setup: setup } })) > 0;
}

// Call inside a transaction: the delete and the insert must land together.
async function replaceWorkspace(db, userId, setup, fretboards) {
  await db.workspaceFretboard.deleteMany({ where: { UserId: userId, Setup: setup } });
  await db.workspaceFretboard.createMany({
    data: toStackRows(fretboards).map(function (row) {
      return Object.assign({ UserId: userId, Setup: setup }, row);
    }),
  });
}

module.exports = { setupFromParam, getWorkspace, hasWorkspace, replaceWorkspace };
