var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var users = require('../services/users');
var importService = require('../services/import');
var { importSchema } = require('../validation/import');
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

  /**
   * @swagger
   * /me/import:
   *   post:
   *     summary: Copy a guest's browser data into the account
   *     description: Cards are appended. Each workspace and the progression are only saved if the account has none yet. All or nothing.
   *     tags: [Me]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               libraryCards: { type: array, maxItems: 200, items: { type: object, properties: { name: { type: string }, setup: { type: string, enum: [Scale, Chord] }, fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } } }
   *               workspaces: { type: object, properties: { scale: { type: object, properties: { fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } }, chord: { type: object, properties: { fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } } } }
   *               chordProgression: { $ref: '#/components/schemas/ChordProgression' }
   *     responses:
   *       200: { description: What was applied, content: { application/json: { schema: { type: object, properties: { importedCards: { type: integer }, appliedWorkspaces: { type: array, items: { type: string, enum: [scale, chord] } }, appliedChordProgression: { type: boolean } } } } } }
   *       400: { description: Validation error; nothing saved }
   *       409: { description: LIMIT_EXCEEDED; nothing saved }
   */
  router.post('/import', validate({ body: importSchema }), asyncHandler(async function (req, res) {
    res.json(await importService.importGuestData(prisma, req.userId, req.body));
  }));

  return router;
}

module.exports = createMeRouter;
