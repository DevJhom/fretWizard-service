// The only place that converts between the frontend's FretboardData and a
// CardFretboard / WorkspaceFretboard row (both tables share these columns).
// SQL Server column names are case-insensitive, so the low and high E strings
// are StringLowE / StringHighE rather than StringE / Stringe.

function toFretboardColumns(fretboard, position) {
  return {
    Position: position,
    KeyName: fretboard.currentKey,
    Accidental: fretboard.currentAccidental,
    Tonality: fretboard.currentTonality,
    Pattern: fretboard.currentPattern,
    FretAmount: fretboard.fretAmount,
    ChordPosition: fretboard.currentChordPosition,
    ChordView: fretboard.chordView || null,
    ShapeC: fretboard.currentCAGED.CShape,
    ShapeA: fretboard.currentCAGED.AShape,
    ShapeG: fretboard.currentCAGED.GShape,
    ShapeE: fretboard.currentCAGED.EShape,
    ShapeD: fretboard.currentCAGED.DShape,
    StringLowE: fretboard.currentStrings.E,
    StringA: fretboard.currentStrings.A,
    StringD: fretboard.currentStrings.D,
    StringG: fretboard.currentStrings.G,
    StringB: fretboard.currentStrings.B,
    StringHighE: fretboard.currentStrings.e,
    HighlightNotes: JSON.stringify(fretboard.currentHighlightNotes),
  };
}

function toFretboardData(row, setup) {
  var data = {
    fretAmount: row.FretAmount,
    currentKey: row.KeyName,
    currentSetup: setup,
    currentPattern: row.Pattern,
    currentTonality: row.Tonality,
    currentAccidental: row.Accidental,
    currentHighlightNotes: JSON.parse(row.HighlightNotes),
    currentCAGED: {
      CShape: row.ShapeC,
      AShape: row.ShapeA,
      GShape: row.ShapeG,
      EShape: row.ShapeE,
      DShape: row.ShapeD,
    },
    currentStrings: {
      E: row.StringLowE,
      A: row.StringA,
      D: row.StringD,
      G: row.StringG,
      B: row.StringB,
      e: row.StringHighE,
    },
    currentChordPosition: row.ChordPosition,
  };
  if (row.ChordView) data.chordView = row.ChordView;
  return data;
}

function toStackRows(fretboards) {
  return fretboards.map(function (fretboard, index) {
    return toFretboardColumns(fretboard, index);
  });
}

module.exports = { toFretboardColumns, toFretboardData, toStackRows };
