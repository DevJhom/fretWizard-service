var { verifyAccessToken } = require('../services/tokens');
var { unauthorized } = require('../lib/errors');

function createRequireAuth(config) {
  return function requireAuth(req, res, next) {
    var match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (!match) return next(unauthorized('Access token required'));
    try {
      req.userId = verifyAccessToken(config, match[1]);
    } catch (_err) {
      return next(unauthorized('Invalid or expired access token'));
    }
    next();
  };
}

module.exports = createRequireAuth;
