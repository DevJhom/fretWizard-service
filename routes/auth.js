var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var createRateLimit = require('../middleware/rateLimits');
var users = require('../services/users');
var tokens = require('../services/tokens');
var { unauthorized } = require('../lib/errors');
var { signupSchema, loginSchema, googleSchema, refreshSchema } = require('../validation/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         email: { type: string, format: email }
 *         username: { type: string }
 *     TokenPair:
 *       type: object
 *       properties:
 *         accessToken: { type: string }
 *         refreshToken: { type: string }
 *     AuthResponse:
 *       type: object
 *       properties:
 *         accessToken: { type: string }
 *         refreshToken: { type: string }
 *         user: { $ref: '#/components/schemas/User' }
 *         isNewUser: { type: boolean, description: Only returned by /auth/google }
 */

function createAuthRouter(deps) {
  var prisma = deps.prisma;
  var config = deps.config;
  var router = express.Router();

  function authResponse(issued, user, extra) {
    return Object.assign({
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      user: users.toUserResponse(user),
    }, extra);
  }

  /**
   * @swagger
   * /auth/signup:
   *   post:
   *     summary: Create an account with email and password
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [username, email, password]
   *             properties:
   *               username: { type: string, maxLength: 100 }
   *               email: { type: string, format: email }
   *               password: { type: string, minLength: 8 }
   *     responses:
   *       201: { description: Account created, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
   *       400: { description: Validation error }
   *       409: { description: Email already registered }
   *       429: { description: Rate limited }
   */
  router.post('/signup', createRateLimit(config.rateLimits.auth), validate({ body: signupSchema }), asyncHandler(async function (req, res) {
    var user = await users.createWithPassword(prisma, config, req.body);
    var issued = await tokens.issueTokens(prisma, config, user.UserId);
    res.status(201).json(authResponse(issued, user));
  }));

  /**
   * @swagger
   * /auth/login:
   *   post:
   *     summary: Log in with email and password
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email: { type: string, format: email }
   *               password: { type: string }
   *     responses:
   *       200: { description: Logged in, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
   *       401: { description: Invalid email or password }
   *       429: { description: Rate limited }
   */
  router.post('/login', createRateLimit(config.rateLimits.auth), validate({ body: loginSchema }), asyncHandler(async function (req, res) {
    var user = await users.verifyPassword(prisma, config, req.body);
    var issued = await tokens.issueTokens(prisma, config, user.UserId);
    res.json(authResponse(issued, user));
  }));

  /**
   * @swagger
   * /auth/google:
   *   post:
   *     summary: Sign up or log in with a Google ID token
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [idToken]
   *             properties:
   *               idToken: { type: string, description: Credential from Google Identity Services }
   *     responses:
   *       200: { description: Signed in; isNewUser tells whether the account was just created, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
   *       401: { description: Google sign-in failed }
   *       429: { description: Rate limited }
   */
  router.post('/google', createRateLimit(config.rateLimits.auth), validate({ body: googleSchema }), asyncHandler(async function (req, res) {
    var identity;
    try {
      identity = await deps.googleVerifier.verify(req.body.idToken);
    } catch (_err) {
      throw unauthorized('Google sign-in failed');
    }
    var result = await users.signInWithGoogle(prisma, identity);
    var issued = await tokens.issueTokens(prisma, config, result.user.UserId);
    res.json(authResponse(issued, result.user, { isNewUser: result.isNewUser }));
  }));

  /**
   * @swagger
   * /auth/refresh:
   *   post:
   *     summary: Exchange a refresh token for a new token pair
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refreshToken]
   *             properties:
   *               refreshToken: { type: string }
   *     responses:
   *       200: { description: New token pair, content: { application/json: { schema: { $ref: '#/components/schemas/TokenPair' } } } }
   *       401: { description: Unknown or reused or expired token or disabled account }
   *       429: { description: Rate limited }
   */
  router.post('/refresh', createRateLimit(config.rateLimits.refresh), validate({ body: refreshSchema }), asyncHandler(async function (req, res) {
    res.json(await tokens.rotateRefreshToken(prisma, config, req.body.refreshToken));
  }));

  /**
   * @swagger
   * /auth/logout:
   *   post:
   *     summary: Revoke the refresh token's whole family
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refreshToken]
   *             properties:
   *               refreshToken: { type: string }
   *     responses:
   *       204: { description: Logged out (also for unknown tokens) }
   *       400: { description: refreshToken missing }
   */
  router.post('/logout', validate({ body: refreshSchema }), asyncHandler(async function (req, res) {
    await tokens.revokeByToken(prisma, req.body.refreshToken);
    res.status(204).end();
  }));

  return router;
}

module.exports = createAuthRouter;
