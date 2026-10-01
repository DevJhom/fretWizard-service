var { z } = require('zod');
var { setupSchema, stackSchema } = require('./fretboard');

var cardName = z.string()
  .trim()
  .min(1, 'Enter a card name')
  .max(100, 'Card name must be at most 100 characters');

var createCardSchema = z.object({ name: cardName, setup: setupSchema, fretboards: stackSchema });

var updateCardSchema = z.object({ name: cardName.optional(), fretboards: stackSchema.optional() })
  .refine(function (patch) {
    return patch.name !== undefined || patch.fretboards !== undefined;
  }, 'Provide a name or fretboards to update');

module.exports = { createCardSchema, updateCardSchema };
