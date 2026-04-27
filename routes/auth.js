var express = require('express');
var router = express.Router();
var bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');
var crypto = require('crypto');
var { PrismaClient } = require('@prisma/client');

var prisma = new PrismaClient();

var SALT_ROUNDS = 10;
var ACCESS_TOKEN_EXPIRY = '15m';
var REFRESH_TOKEN_EXPIRY = '7d';
var REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.UserId, email: user.Email },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.UserId, email: user.Email },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

async function storeRefreshToken(token, userId) {
  return prisma.refreshToken.create({
    data: {
      TokenId: crypto.randomUUID(),
      Token: token,
      UserId: userId,
      ExpiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    },
  });
}

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthResponse:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *         refreshToken:
 *           type: string
 *         user:
 *           $ref: '#/components/schemas/User'
 *     SignupInput:
 *       type: object
 *       required:
 *         - Email
 *         - Password
 *       properties:
 *         Email:
 *           type: string
 *           format: email
 *         Password:
 *           type: string
 *         Username:
 *           type: string
 *         FirstName:
 *           type: string
 *         LastName:
 *           type: string
 *     LoginInput:
 *       type: object
 *       required:
 *         - Email
 *         - Password
 *       properties:
 *         Email:
 *           type: string
 *           format: email
 *         Password:
 *           type: string
 *     RefreshInput:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 */

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignupInput'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: Email already exists
 */
router.post('/signup', async function (req, res, next) {
  try {
    var { Email, Password, Username, FirstName, LastName } = req.body;

    if (!Email || !Password) {
      return res.status(400).json({ message: 'Email and Password are required' });
    }

    var existingUser = await prisma.user.findUnique({ where: { Email: Email } });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    var hashedPassword = await bcrypt.hash(Password, SALT_ROUNDS);
    var userId = crypto.randomUUID();

    var user = await prisma.user.create({
      data: {
        UserId: userId,
        Email: Email,
        PasswordHash: hashedPassword,
        Username: Username || null,
        FirstName: FirstName || null,
        LastName: LastName || null,
      },
      select: userSelect,
    });

    var accessToken = generateAccessToken(user);
    var refreshToken = generateRefreshToken(user);
    await storeRefreshToken(refreshToken, userId);

    res.status(201).json({ accessToken, refreshToken, user });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginInput'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async function (req, res, next) {
  try {
    var { Email, Password } = req.body;

    if (!Email || !Password) {
      return res.status(400).json({ message: 'Email and Password are required' });
    }

    var user = await prisma.user.findUnique({ where: { Email: Email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.IsActive) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    var validPassword = await bcrypt.compare(Password, user.PasswordHash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    var accessToken = generateAccessToken(user);
    var refreshToken = generateRefreshToken(user);
    await storeRefreshToken(refreshToken, user.UserId);

    var { PasswordHash, ...userWithoutPassword } = user;

    res.json({ accessToken, refreshToken, user: userWithoutPassword });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshInput'
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         description: Missing refresh token
 *       403:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', async function (req, res, next) {
  try {
    var { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    var storedToken = await prisma.refreshToken.findUnique({
      where: { Token: refreshToken },
    });
    if (!storedToken) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    var decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      await prisma.refreshToken.delete({ where: { TokenId: storedToken.TokenId } });
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }

    await prisma.refreshToken.delete({ where: { TokenId: storedToken.TokenId } });

    var user = await prisma.user.findUnique({ where: { UserId: decoded.userId } });
    if (!user || !user.IsActive) {
      return res.status(403).json({ message: 'User not found or inactive' });
    }

    var newAccessToken = generateAccessToken(user);
    var newRefreshToken = generateRefreshToken(user);
    await storeRefreshToken(newRefreshToken, user.UserId);

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and invalidate refresh token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshInput'
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', async function (req, res, next) {
  try {
    var { refreshToken } = req.body;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { Token: refreshToken } });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
