var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var createRateLimit = require('../middleware/rateLimits');
var users = require('../services/users');
var tokens = require('../services/tokens');
var { signupSchema, loginSchema } = require('../validation/auth');

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

  return router;
}

module.exports = createAuthRouter;
