var { z } = require('zod');
var { tonalitySchema } = require('./fretboard');
var { MAX_CHORDS } = require('../lib/limits');

// Mirrors majorProgressionKeys / minorProgressionKeys in fret-wizard/src/lib/music-theory/progressions.ts.
var KEYS_BY_TONALITY = {
  Major: ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'],
  Minor: ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'E♭', 'B♭', 'F', 'C', 'G', 'D'],
};

var chordProgressionSchema = z.object({
  key: z.string(),
  tonality: tonalitySchema,
  progression: z.array(z.object({ degree: z.number().int().min(0).max(6) }))
    .max(MAX_CHORDS, 'A progression can hold at most ' + MAX_CHORDS + ' chords'),
}).superRefine(function (value, ctx) {
  if (!KEYS_BY_TONALITY[value.tonality].includes(value.key)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['key'],
      message: value.key + ' is not a ' + value.tonality + ' progression key',
    });
  }
});

module.exports = { chordProgressionSchema };
