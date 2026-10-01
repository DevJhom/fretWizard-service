var crypto = require('crypto');
var jwt = require('jsonwebtoken');

var ACCESS_TOKEN_TTL = '15m';
var REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(config, userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL });
}

function verifyAccessToken(config, token) {
  var payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string') throw new Error('Access token has no subject');
  return payload.sub;
}

async function createRefreshToken(db, userId, familyId) {
  var token = crypto.randomBytes(32).toString('base64url');
  await db.refreshToken.create({
    data: {
      UserId: userId,
      TokenHash: hashToken(token),
      FamilyId: familyId,
      ExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

async function issueTokens(db, config, userId) {
  await db.refreshToken.deleteMany({ where: { UserId: userId, ExpiresAt: { lt: new Date() } } });
  var refreshToken = await createRefreshToken(db, userId, crypto.randomUUID());
  return { accessToken: signAccessToken(config, userId), refreshToken: refreshToken };
}

module.exports = { REFRESH_TOKEN_TTL_MS, hashToken, signAccessToken, verifyAccessToken, issueTokens };
