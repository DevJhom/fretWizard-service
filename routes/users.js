var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var bcrypt = require('bcrypt');
var { PrismaClient } = require('@prisma/client');

var prisma = new PrismaClient();

var SALT_ROUNDS = 10;

// Fields to return in responses (excludes PasswordHash)
var userSelect = {
  UserId: true,
  Username: true,
  Email: true,
  FirstName: true,
  LastName: true,
  IsActive: true,
  CreatedDate: true,
  ModifiedDate: true,
};

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
 *         Email:
 *           type: string
 *         FirstName:
 *           type: string
 *           nullable: true
 *         LastName:
 *           type: string
 *           nullable: true
 *         IsActive:
 *           type: boolean
 *         CreatedDate:
 *           type: string
 *           format: date-time
 *         ModifiedDate:
 *           type: string
 *           format: date-time
 *     UserInput:
 *       type: object
 *       required:
 *         - Email
 *         - Password
 *       properties:
 *         Username:
 *           type: string
 *         Email:
 *           type: string
 *         Password:
 *           type: string
 *         FirstName:
 *           type: string
 *         LastName:
 *           type: string
 *     UserUpdateInput:
 *       type: object
 *       properties:
 *         Username:
 *           type: string
 *         Email:
 *           type: string
 *         Password:
 *           type: string
 *         FirstName:
 *           type: string
 *         LastName:
 *           type: string
 *         IsActive:
 *           type: boolean
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
    var users = await prisma.user.findMany({ select: userSelect });
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
      where: { UserId: req.params.id },
      select: userSelect,
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
    var hashedPassword = await bcrypt.hash(req.body.Password, SALT_ROUNDS);
    var user = await prisma.user.create({
      data: {
        UserId: crypto.randomUUID(),
        Username: req.body.Username,
        Email: req.body.Email,
        PasswordHash: hashedPassword,
        FirstName: req.body.FirstName,
        LastName: req.body.LastName,
      },
      select: userSelect,
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
 *             $ref: '#/components/schemas/UserUpdateInput'
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
    var data = {};
    if (req.body.Username !== undefined) data.Username = req.body.Username;
    if (req.body.Email !== undefined) data.Email = req.body.Email;
    if (req.body.FirstName !== undefined) data.FirstName = req.body.FirstName;
    if (req.body.LastName !== undefined) data.LastName = req.body.LastName;
    if (req.body.IsActive !== undefined) data.IsActive = req.body.IsActive;
    if (req.body.Password) data.PasswordHash = await bcrypt.hash(req.body.Password, SALT_ROUNDS);

    var user = await prisma.user.update({
      where: { UserId: req.params.id },
      data: data,
      select: userSelect,
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
