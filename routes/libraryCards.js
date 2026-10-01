var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var library = require('../services/library');
var { notFound } = require('../lib/errors');
var { createCardSchema, updateCardSchema } = require('../validation/library');

var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cardIdFrom(req) {
  if (!UUID_PATTERN.test(req.params.id)) throw notFound('Card not found');
  return req.params.id;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     FretboardData:
 *       type: object
 *       required: [fretAmount, currentKey, currentPattern, currentTonality, currentAccidental, currentHighlightNotes, currentCAGED, currentStrings, currentChordPosition]
 *       properties:
 *         fretAmount: { type: integer, minimum: 12, maximum: 24 }
 *         currentKey: { type: string, example: F♯ }
 *         currentSetup: { type: string, enum: [Scale, Chord], description: Ignored on input and filled from the parent on output }
 *         currentPattern: { type: string, example: Triad }
 *         currentTonality: { type: string, enum: [Major, Minor] }
 *         currentAccidental: { type: string, enum: [sharp, flat] }
 *         currentHighlightNotes: { type: array, items: { type: string } }
 *         currentCAGED: { type: object, properties: { CShape: { type: boolean }, AShape: { type: boolean }, GShape: { type: boolean }, EShape: { type: boolean }, DShape: { type: boolean } } }
 *         currentStrings: { type: object, properties: { E: { type: boolean }, A: { type: boolean }, D: { type: boolean }, G: { type: boolean }, B: { type: boolean }, e: { type: boolean } } }
 *         currentChordPosition: { type: integer, minimum: 0, maximum: 23 }
 *         chordView: { type: string, enum: [shapes, fingering] }
 *     LibraryCard:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string }
 *         setup: { type: string, enum: [Scale, Chord] }
 *         fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } }
 *         createdAt: { type: integer, description: Epoch milliseconds }
 */

function createLibraryCardsRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /library-cards:
   *   get:
   *     summary: Your library cards, oldest first
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Cards, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/LibraryCard' } } } } }
   *   post:
   *     summary: Create a library card
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, setup, fretboards]
   *             properties:
   *               name: { type: string, maxLength: 100 }
   *               setup: { type: string, enum: [Scale, Chord] }
   *               fretboards: { type: array, minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/FretboardData' } }
   *     responses:
   *       201: { description: Created card, content: { application/json: { schema: { $ref: '#/components/schemas/LibraryCard' } } } }
   *       400: { description: Validation error }
   *       409: { description: LIMIT_EXCEEDED (200 cards) }
   */
  router.get('/', asyncHandler(async function (req, res) {
    res.json(await library.listCards(prisma, req.userId));
  }));

  router.post('/', validate({ body: createCardSchema }), asyncHandler(async function (req, res) {
    await library.assertCardCapacity(prisma, req.userId, 1);
    res.status(201).json(await library.createCard(prisma, req.userId, req.body));
  }));

  /**
   * @swagger
   * /library-cards/{id}:
   *   patch:
   *     summary: Rename a card and/or replace its stack
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string, maxLength: 100 }
   *               fretboards: { type: array, minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/FretboardData' } }
   *     responses:
   *       200: { description: Updated card, content: { application/json: { schema: { $ref: '#/components/schemas/LibraryCard' } } } }
   *       404: { description: Not found or not yours }
   *   delete:
   *     summary: Delete a card
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       204: { description: Deleted }
   *       404: { description: Not found or not yours }
   */
  router.patch('/:id', validate({ body: updateCardSchema }), asyncHandler(async function (req, res) {
    res.json(await library.updateCard(prisma, req.userId, cardIdFrom(req), req.body));
  }));

  router.delete('/:id', asyncHandler(async function (req, res) {
    await library.deleteCard(prisma, req.userId, cardIdFrom(req));
    res.status(204).end();
  }));

  return router;
}

module.exports = createLibraryCardsRouter;
