var express = require('express');

var router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Liveness check
 *     tags: [Health]
 *     responses:
 *       200: { description: The service is running }
 */
router.get('/', function (req, res) {
  res.json({ ok: true });
});

module.exports = router;
