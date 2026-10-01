var { rateLimit } = require('express-rate-limit');
var { rateLimited } = require('../lib/errors');

function createRateLimit(limitPerMinute) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: limitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: function (req, res, next) {
      next(rateLimited());
    },
  });
}

module.exports = createRateLimit;
