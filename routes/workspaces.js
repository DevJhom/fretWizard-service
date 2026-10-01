var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var workspaces = require('../services/workspaces');
var { notFound } = require('../lib/errors');
var { workspaceSchema } = require('../validation/workspaces');

function setupFrom(req) {
  var setup = workspaces.setupFromParam(req.params.setup);
  if (!setup) throw notFound('Workspace not found');
  return setup;
}

function createWorkspacesRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /workspaces/{setup}:
   *   get:
   *     summary: The current stack of the Scale or Chord page
   *     tags: [Workspaces]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: setup, required: true, schema: { type: string, enum: [scale, chord] } }
   *     responses:
   *       200: { description: The stack, content: { application/json: { schema: { type: object, properties: { fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } } } } }
   *       404: { description: Never saved or unknown setup }
   *   put:
   *     summary: Replace the stack of the Scale or Chord page
   *     tags: [Workspaces]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: setup, required: true, schema: { type: string, enum: [scale, chord] } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [fretboards]
   *             properties:
   *               fretboards: { type: array, minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/FretboardData' } }
   *     responses:
   *       204: { description: Saved }
   *       400: { description: Validation error }
   *       404: { description: Unknown setup }
   */
  router.get('/:setup', asyncHandler(async function (req, res) {
    var workspace = await workspaces.getWorkspace(prisma, req.userId, setupFrom(req));
    if (!workspace) throw notFound('Workspace not saved yet');
    res.json(workspace);
  }));

  router.put('/:setup', validate({ body: workspaceSchema }), asyncHandler(async function (req, res) {
    var setup = setupFrom(req);
    await prisma.$transaction(function (tx) {
      return workspaces.replaceWorkspace(tx, req.userId, setup, req.body.fretboards);
    });
    res.status(204).end();
  }));

  return router;
}

module.exports = createWorkspacesRouter;
