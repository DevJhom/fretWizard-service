var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var users = require('../services/users');
var { unauthorized } = require('../lib/errors');
var { updateMeSchema } = require('../validation/auth');

function createMeRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /me:
   *   get:
   *     summary: The signed-in user
   *     tags: [Me]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: The user, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
   *       401: { description: Missing or invalid access token }
   *   patch:
   *     summary: Change the display name
   *     tags: [Me]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [username]
   *             properties:
   *               username: { type: string, maxLength: 100 }
   *     responses:
   *       200: { description: The updated user, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
   *       400: { description: Validation error }
   */
  router.get('/', asyncHandler(async function (req, res) {
    var user = await users.findById(prisma, req.userId);
    if (!user || !user.IsActive) throw unauthorized('User not found');
    res.json(users.toUserResponse(user));
  }));

  router.patch('/', validate({ body: updateMeSchema }), asyncHandler(async function (req, res) {
    var user = await users.updateUsername(prisma, req.userId, req.body.username);
    res.json(users.toUserResponse(user));
  }));

  return router;
}

module.exports = createMeRouter;
