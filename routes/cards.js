var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var { PrismaClient } = require('@prisma/client');

var prisma = new PrismaClient();

/**
 * @swagger
 * components:
 *   schemas:
 *     Card:
 *       type: object
 *       properties:
 *         CardId:
 *           type: string
 *           format: uuid
 *         Title:
 *           type: string
 *         Description:
 *           type: string
 *           nullable: true
 *         Tags:
 *           type: string
 *           nullable: true
 *         IsFavorite:
 *           type: boolean
 *         IsActive:
 *           type: boolean
 *         IsDeleted:
 *           type: boolean
 *         CreatedDate:
 *           type: string
 *           format: date-time
 *         ModifyDate:
 *           type: string
 *           format: date-time
 *         UserId:
 *           type: string
 *           format: uuid
 *     CardInput:
 *       type: object
 *       required:
 *         - Title
 *         - UserId
 *       properties:
 *         Title:
 *           type: string
 *         Description:
 *           type: string
 *         Tags:
 *           type: string
 *         UserId:
 *           type: string
 *           format: uuid
 *     CardUpdateInput:
 *       type: object
 *       properties:
 *         Title:
 *           type: string
 *         Description:
 *           type: string
 *         Tags:
 *           type: string
 *         IsFavorite:
 *           type: boolean
 *         IsActive:
 *           type: boolean
 */

/**
 * @swagger
 * /cards:
 *   get:
 *     summary: List all cards
 *     tags: [Cards]
 *     responses:
 *       200:
 *         description: Array of cards
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Card'
 */
router.get('/', async function(req, res, next) {
  try {
    var cards = await prisma.card.findMany({
      where: { IsDeleted: false },
    });
    res.json(cards);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /cards/{id}:
 *   get:
 *     summary: Get a card by ID
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: A card object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Card'
 *       404:
 *         description: Card not found
 */
router.get('/:id', async function(req, res, next) {
  try {
    var card = await prisma.card.findUnique({
      where: { CardId: req.params.id },
    });
    if (!card || card.IsDeleted) return res.status(404).json({ message: 'Card not found' });
    res.json(card);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /cards/user/{userId}:
 *   get:
 *     summary: Get all cards by user ID
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of cards for the user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Card'
 */
router.get('/user/:userId', async function(req, res, next) {
  try {
    var cards = await prisma.card.findMany({
      where: { UserId: req.params.userId, IsDeleted: false },
    });
    res.json(cards);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /cards:
 *   post:
 *     summary: Create a new card
 *     tags: [Cards]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CardInput'
 *     responses:
 *       201:
 *         description: Created card
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Card'
 */
router.post('/', async function(req, res, next) {
  try {
    var card = await prisma.card.create({
      data: {
        CardId: crypto.randomUUID(),
        Title: req.body.Title,
        Description: req.body.Description,
        Tags: req.body.Tags,
        UserId: req.body.UserId,
      },
    });
    res.status(201).json(card);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /cards/{id}:
 *   put:
 *     summary: Update a card
 *     tags: [Cards]
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
 *             $ref: '#/components/schemas/CardUpdateInput'
 *     responses:
 *       200:
 *         description: Updated card
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Card'
 *       404:
 *         description: Card not found
 */
router.put('/:id', async function(req, res, next) {
  try {
    var data = {};
    if (req.body.Title !== undefined) data.Title = req.body.Title;
    if (req.body.Description !== undefined) data.Description = req.body.Description;
    if (req.body.Tags !== undefined) data.Tags = req.body.Tags;
    if (req.body.IsFavorite !== undefined) data.IsFavorite = req.body.IsFavorite;
    if (req.body.IsActive !== undefined) data.IsActive = req.body.IsActive;

    var card = await prisma.card.update({
      where: { CardId: req.params.id },
      data: data,
    });
    res.json(card);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /cards/{id}:
 *   delete:
 *     summary: Soft delete a card
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Card soft deleted
 *       404:
 *         description: Card not found
 */
router.delete('/:id', async function(req, res, next) {
  try {
    await prisma.card.update({
      where: { CardId: req.params.id },
      data: { IsDeleted: true },
    });
    res.json({ message: 'Card deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
