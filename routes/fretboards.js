var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var { PrismaClient } = require('@prisma/client');

var prisma = new PrismaClient();

/**
 * @swagger
 * components:
 *   schemas:
 *     Fretboard:
 *       type: object
 *       properties:
 *         FretboardId:
 *           type: string
 *           format: uuid
 *         CardId:
 *           type: string
 *           format: uuid
 *         Accidental:
 *           type: string
 *         Key:
 *           type: string
 *         Pattern:
 *           type: string
 *         Setup:
 *           type: string
 *         Tonality:
 *           type: string
 *         ChordPosition:
 *           type: integer
 *         FretAmount:
 *           type: integer
 *         HighlightNotes:
 *           type: array
 *           items:
 *             type: string
 *         CAGED:
 *           type: object
 *           properties:
 *             CShape:
 *               type: boolean
 *             AShape:
 *               type: boolean
 *             GShape:
 *               type: boolean
 *             EShape:
 *               type: boolean
 *             DShape:
 *               type: boolean
 *         Strings:
 *           type: object
 *           properties:
 *             E:
 *               type: boolean
 *             A:
 *               type: boolean
 *             D:
 *               type: boolean
 *             G:
 *               type: boolean
 *             B:
 *               type: boolean
 *             e:
 *               type: boolean
 *         IsActive:
 *           type: boolean
 *         CreatedDate:
 *           type: string
 *           format: date-time
 *         ModifiedDate:
 *           type: string
 *           format: date-time
 *     FretboardInput:
 *       type: object
 *       required:
 *         - CardId
 *         - Accidental
 *         - Key
 *         - Pattern
 *         - Setup
 *         - Tonality
 *         - ChordPosition
 *         - FretAmount
 *         - HighlightNotes
 *         - CAGED
 *         - Strings
 *       properties:
 *         CardId:
 *           type: string
 *           format: uuid
 *         Accidental:
 *           type: string
 *         Key:
 *           type: string
 *         Pattern:
 *           type: string
 *         Setup:
 *           type: string
 *         Tonality:
 *           type: string
 *         ChordPosition:
 *           type: integer
 *         FretAmount:
 *           type: integer
 *         HighlightNotes:
 *           type: array
 *           items:
 *             type: string
 *         CAGED:
 *           type: object
 *         Strings:
 *           type: object
 *     FretboardUpdateInput:
 *       type: object
 *       properties:
 *         Accidental:
 *           type: string
 *         Key:
 *           type: string
 *         Pattern:
 *           type: string
 *         Setup:
 *           type: string
 *         Tonality:
 *           type: string
 *         ChordPosition:
 *           type: integer
 *         FretAmount:
 *           type: integer
 *         HighlightNotes:
 *           type: array
 *           items:
 *             type: string
 *         CAGED:
 *           type: object
 *         Strings:
 *           type: object
 */

function parseJsonFields(fretboard) {
  if (!fretboard) return fretboard;
  return {
    ...fretboard,
    HighlightNotes: JSON.parse(fretboard.HighlightNotes),
    CAGED: JSON.parse(fretboard.CAGED),
    Strings: JSON.parse(fretboard.Strings),
  };
}

/**
 * @swagger
 * /fretboards/card/{cardId}:
 *   get:
 *     summary: List all configs for a card
 *     tags: [Fretboards]
 *     parameters:
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of fretboards
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CardConfig'
 */
router.get('/card/:cardId', async function(req, res, next) {
  try {
    var fretboards = await prisma.fretboard.findMany({
      where: { CardId: req.params.cardId },
    });
    res.json(fretboards.map(parseJsonFields));
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /fretboards/{id}:
 *   get:
 *     summary: Get a fretboard by ID
 *     tags: [Fretboards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: A fretboard object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CardConfig'
 *       404:
 *         description: Fretboard not found
 */
router.get('/:id', async function(req, res, next) {
  try {
    var fretboard = await prisma.fretboard.findUnique({
      where: { FretboardId: req.params.id },
    });
    if (!fretboard) return res.status(404).json({ message: 'Fretboard not found' });
    res.json(parseJsonFields(fretboard));
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /fretboards:
 *   post:
 *     summary: Create a new fretboard
 *     tags: [Fretboards]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FretboardInput'
 *     responses:
 *       201:
 *         description: Created fretboard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CardConfig'
 */
router.post('/', async function(req, res, next) {
  try {
    var fretboard = await prisma.fretboard.create({
      data: {
        FretboardId: crypto.randomUUID(),
        CardId: req.body.CardId,
        Accidental: req.body.Accidental,
        Key: req.body.Key,
        Pattern: req.body.Pattern,
        Setup: req.body.Setup,
        Tonality: req.body.Tonality,
        ChordPosition: req.body.ChordPosition,
        FretAmount: req.body.FretAmount,
        HighlightNotes: JSON.stringify(req.body.HighlightNotes),
        CAGED: JSON.stringify(req.body.CAGED),
        Strings: JSON.stringify(req.body.Strings),
      },
    });
    res.status(201).json(parseJsonFields(fretboard));
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /fretboards/{id}:
 *   put:
 *     summary: Update a fretboard
 *     tags: [Fretboards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FretboardUpdateInput'
 *     responses:
 *       200:
 *         description: Updated fretboard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CardConfig'
 *       404:
 *         description: Fretboard not found
 */
router.put('/:id', async function(req, res, next) {
  try {
    var data = {};
    if (req.body.Accidental !== undefined) data.Accidental = req.body.Accidental;
    if (req.body.Key !== undefined) data.Key = req.body.Key;
    if (req.body.Pattern !== undefined) data.Pattern = req.body.Pattern;
    if (req.body.Setup !== undefined) data.Setup = req.body.Setup;
    if (req.body.Tonality !== undefined) data.Tonality = req.body.Tonality;
    if (req.body.ChordPosition !== undefined) data.ChordPosition = req.body.ChordPosition;
    if (req.body.FretAmount !== undefined) data.FretAmount = req.body.FretAmount;
    if (req.body.HighlightNotes !== undefined) data.HighlightNotes = JSON.stringify(req.body.HighlightNotes);
    if (req.body.CAGED !== undefined) data.CAGED = JSON.stringify(req.body.CAGED);
    if (req.body.Strings !== undefined) data.Strings = JSON.stringify(req.body.Strings);

    var fretboard = await prisma.fretboard.update({
      where: { FretboardId: req.params.id },
      data: data,
    });
    res.json(parseJsonFields(fretboard));
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /fretboards/{id}:
 *   delete:
 *     summary: Delete a fretboard
 *     tags: [Fretboards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Fretboard deleted
 *       404:
 *         description: Fretboard not found
 */
router.delete('/:id', async function(req, res, next) {
  try {
    await prisma.fretboard.delete({
      where: { FretboardId: req.params.id },
    });
    res.json({ message: 'Fretboard deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
