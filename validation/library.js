var { z } = require('zod');
var { setupSchema, stackSchema } = require('./fretboard');

var cardName = z.string()
  .trim()
  .min(1, 'Enter a card name')
  .max(100, 'Card name must be at most 100 characters');

var createCardSchema = z.object({ name: cardName, setup: setupSchema, fretboards: stackSchema, isFavorite: z.boolean().optional() });

var updateCardSchema = z.object({ name: cardName.optional(), fretboards: stackSchema.optional(), isFavorite: z.boolean().optional() })
  .refine(function (patch) {
    return patch.name !== undefined || patch.fretboards !== undefined || patch.isFavorite !== undefined;
  }, 'Provide a name, fretboards or isFavorite to update');

module.exports = { createCardSchema, updateCardSchema };
