var { z } = require('zod');
var { createCardSchema } = require('./library');
var { workspaceSchema } = require('./workspaces');
var { chordProgressionSchema } = require('./chordProgression');
var { MAX_CARDS } = require('../lib/limits');

var importSchema = z.object({
  libraryCards: z.array(createCardSchema).max(MAX_CARDS, 'At most ' + MAX_CARDS + ' cards can be imported').optional(),
  workspaces: z.object({ scale: workspaceSchema.optional(), chord: workspaceSchema.optional() }).optional(),
  chordProgression: chordProgressionSchema.optional(),
});

module.exports = { importSchema };
