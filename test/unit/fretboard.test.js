var test = require('node:test');
var assert = require('node:assert/strict');
var { fretboardSchema, stackSchema } = require('../../validation/fretboard');
var { toFretboardColumns, toFretboardData, toStackRows } = require('../../mappers/fretboard');
var { sampleFretboard } = require('../support/fixtures');

function issuePaths(schema, value) {
  var result = schema.safeParse(value);
  assert.equal(result.success, false, 'expected validation to fail for ' + JSON.stringify(value));
  return result.error.issues.map(function (issue) {
    return issue.path.join('.');
  });
}

test('accepts a fretboard as the frontend sends it', function () {
  assert.equal(fretboardSchema.safeParse(sampleFretboard()).success, true);
});

test('strips fields that have no column, at every level', function () {
  var parsed = fretboardSchema.parse(sampleFretboard({
    currentSetup: 'Chord',
    extra: 'ignored',
    currentCAGED: { CShape: true, AShape: true, GShape: true, EShape: true, DShape: true, XShape: true },
  }));
  assert.equal('currentSetup' in parsed, false);
  assert.equal('extra' in parsed, false);
  assert.deepEqual(Object.keys(parsed.currentCAGED), ['CShape', 'AShape', 'GShape', 'EShape', 'DShape']);
});

test('rejects out-of-range and unknown values, naming the field', function () {
  var cases = [
    [{ fretAmount: 11 }, 'fretAmount'],
    [{ fretAmount: 25 }, 'fretAmount'],
    [{ fretAmount: 12.5 }, 'fretAmount'],
    [{ currentKey: 'H' }, 'currentKey'],
    [{ currentPattern: 'Sixth Chord' }, 'currentPattern'],
    [{ currentTonality: 'Dorian' }, 'currentTonality'],
    [{ currentAccidental: 'natural' }, 'currentAccidental'],
    [{ currentHighlightNotes: ['roots', 'roots'] }, 'currentHighlightNotes'],
    [{ currentHighlightNotes: ['ninths'] }, 'currentHighlightNotes.0'],
    [{ currentStrings: { E: true, A: true, D: true, G: true, B: true } }, 'currentStrings.e'],
    [{ currentChordPosition: 24 }, 'currentChordPosition'],
    [{ chordView: 'diagram' }, 'chordView'],
  ];
  cases.forEach(function (entry) {
    assert.deepEqual(issuePaths(fretboardSchema, sampleFretboard(entry[0])), [entry[1]], JSON.stringify(entry[0]));
  });
});

test('a stack holds 1 to 50 fretboards', function () {
  assert.equal(stackSchema.safeParse([]).success, false);
  assert.equal(stackSchema.safeParse(Array(51).fill(sampleFretboard())).success, false);
  assert.equal(stackSchema.safeParse(Array(50).fill(sampleFretboard())).success, true);
});

test('the mapper round-trips a fretboard through a row', function () {
  var fretboard = sampleFretboard({ currentSetup: 'Chord' });
  var row = toFretboardColumns(fretboardSchema.parse(fretboard), 3);
  assert.equal(row.Position, 3);
  assert.equal(row.KeyName, 'F♯');
  assert.equal(row.StringLowE, true);
  assert.equal(row.StringHighE, false);
  assert.equal(row.ChordView, 'fingering');
  assert.equal(row.HighlightNotes, '["roots","minor thirds","fifths"]');
  assert.deepEqual(toFretboardData(row, 'Chord'), fretboard);
});

test('the mapper omits chordView when the row has none', function () {
  var fretboard = sampleFretboard();
  delete fretboard.chordView;
  var row = toFretboardColumns(fretboard, 0);
  assert.equal(row.ChordView, null);
  var data = toFretboardData(row, 'Scale');
  assert.equal('chordView' in data, false);
  assert.deepEqual(data, fretboard);
});

test('toStackRows numbers positions in stack order', function () {
  var rows = toStackRows([sampleFretboard({ currentKey: 'C' }), sampleFretboard({ currentKey: 'D' })]);
  assert.deepEqual(rows.map(function (row) {
    return [row.Position, row.KeyName];
  }), [[0, 'C'], [1, 'D']]);
});
