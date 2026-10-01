function sampleFretboard(overrides) {
  return Object.assign({
    fretAmount: 22,
    currentKey: 'F♯',
    currentSetup: 'Scale',
    currentPattern: 'Diatonic Scale',
    currentTonality: 'Minor',
    currentAccidental: 'sharp',
    currentHighlightNotes: ['roots', 'minor thirds', 'fifths'],
    currentCAGED: { CShape: false, AShape: true, GShape: false, EShape: false, DShape: false },
    currentStrings: { E: true, A: true, D: false, G: true, B: true, e: false },
    currentChordPosition: 2,
    chordView: 'fingering',
  }, overrides);
}

function withSetup(fretboards, setup) {
  return fretboards.map(function (fretboard) {
    return Object.assign({}, fretboard, { currentSetup: setup });
  });
}

function sampleProgression(overrides) {
  return Object.assign({
    key: 'F♯',
    tonality: 'Minor',
    progression: [{ id: 'client-1', degree: 0 }, { id: 'client-2', degree: 3 }, { id: 'client-3', degree: 4 }],
  }, overrides);
}

module.exports = { sampleFretboard, withSetup, sampleProgression };
