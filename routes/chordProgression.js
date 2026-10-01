var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var chordProgression = require('../services/chordProgression');
var { notFound } = require('../lib/errors');
var { chordProgressionSchema } = require('../validation/chordProgression');

/**
 * @swagger
 * components:
 *   schemas:
 *     ChordProgression:
 *       type: object
 *       required: [key, tonality, progression]
 *       properties:
 *         key: { type: string, example: F♯ }
 *         tonality: { type: string, enum: [Major, Minor] }
 *         progression:
 *           type: array
 *           maxItems: 100
 *           items:
 *             type: object
 *             properties:
 *               id: { type: string, description: Server-generated; ignored on input }
 *               degree: { type: integer, minimum: 0, maximum: 6 }
 */

function createChordProgressionRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /chord-progression:
   *   get:
   *     summary: The saved Chord Progression
   *     tags: [Chord Progression]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: The progression, content: { application/json: { schema: { $ref: '#/components/schemas/ChordProgression' } } } }
   *       404: { description: Never saved }
   *   put:
   *     summary: Replace the Chord Progression
   *     tags: [Chord Progression]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/ChordProgression' }
   *     responses:
   *       204: { description: Saved }
   *       400: { description: Validation error }
   */
  router.get('/', asyncHandler(async function (req, res) {
    var progression = await chordProgression.getProgression(prisma, req.userId);
    if (!progression) throw notFound('Chord progression not saved yet');
    res.json(progression);
  }));

  router.put('/', validate({ body: chordProgressionSchema }), asyncHandler(async function (req, res) {
    await prisma.$transaction(function (tx) {
      return chordProgression.replaceProgression(tx, req.userId, req.body);
    });
    res.status(204).end();
  }));

  return router;
}

module.exports = createChordProgressionRouter;
