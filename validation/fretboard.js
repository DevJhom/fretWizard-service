var { z } = require('zod');
var { MAX_FRETBOARDS } = require('../lib/limits');

// Allowed values mirror fret-wizard/src/lib/music-theory/constants.ts.
var SETUPS = ['Scale', 'Chord'];
var TONALITIES = ['Major', 'Minor'];
var ACCIDENTALS = ['sharp', 'flat'];
var KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'D♭', 'E♭', 'G♭', 'A♭', 'B♭'];
var PATTERNS = [
  'Pentatonic Scale', 'Blue Scale', 'Diatonic Scale', 'Chromatic Scale',
  'Power Chord', 'Triad', 'Seventh Chord', 'Add9 Chord', 'Add11 Chord', 'Add13 Chord', 'Dominant Chord',
];
var DEGREES = [
  'roots', 'minor seconds', 'seconds', 'minor thirds', 'thirds', 'fourths',
  'tritones', 'fifths', 'minor sixths', 'sixths', 'minor sevenths', 'sevenths',
];
var CHORD_VIEWS = ['shapes', 'fingering'];

var setupSchema = z.enum(SETUPS);
var tonalitySchema = z.enum(TONALITIES);

var fretboardSchema = z.object({
  fretAmount: z.number().int().min(12, 'Must be between 12 and 24').max(24, 'Must be between 12 and 24'),
  currentKey: z.enum(KEYS),
  currentPattern: z.enum(PATTERNS),
  currentTonality: tonalitySchema,
  currentAccidental: z.enum(ACCIDENTALS),
  currentHighlightNotes: z.array(z.enum(DEGREES)).max(DEGREES.length).refine(function (notes) {
    return new Set(notes).size === notes.length;
  }, 'Highlight notes must be unique'),
  currentCAGED: z.object({
    CShape: z.boolean(),
    AShape: z.boolean(),
    GShape: z.boolean(),
    EShape: z.boolean(),
    DShape: z.boolean(),
  }),
  currentStrings: z.object({
    E: z.boolean(),
    A: z.boolean(),
    D: z.boolean(),
    G: z.boolean(),
    B: z.boolean(),
    e: z.boolean(),
  }),
  currentChordPosition: z.number().int().min(0).max(23),
  chordView: z.enum(CHORD_VIEWS).optional(),
});

var stackSchema = z.array(fretboardSchema)
  .min(1, 'A stack needs at least one fretboard')
  .max(MAX_FRETBOARDS, 'A stack can hold at most ' + MAX_FRETBOARDS + ' fretboards');

module.exports = { SETUPS, KEYS, setupSchema, tonalitySchema, fretboardSchema, stackSchema };
