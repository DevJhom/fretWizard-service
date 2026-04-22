var express = require('express');
var router = express.Router();
var { PrismaClient } = require('@prisma/client');

var prisma = new PrismaClient();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         UserId:
 *           type: string
 *           format: uuid
 *         Username:
 *           type: string
 *           nullable: true
 *     UserInput:
 *       type: object
 *       properties:
 *         Username:
 *           type: string
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Array of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
router.get('/', async function(req, res, next) {
  try {
    var users = await prisma.user.findMany();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: A user object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get('/:id', async function(req, res, next) {
  try {
    var user = await prisma.user.findUnique({
      where: { UserId: req.params.id }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       201:
 *         description: Created user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
router.post('/', async function(req, res, next) {
  try {
    var user = await prisma.user.create({
      data: {
        UserId: crypto.randomUUID(),
        Username: req.body.Username
      }
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [Users]
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
 *             $ref: '#/components/schemas/UserInput'
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.put('/:id', async function(req, res, next) {
  try {
    var user = await prisma.user.update({
      where: { UserId: req.params.id },
      data: { Username: req.body.Username }
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       404:
 *         description: User not found
 */
router.delete('/:id', async function(req, res, next) {
  try {
    await prisma.user.delete({
      where: { UserId: req.params.id }
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
