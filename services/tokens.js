var crypto = require('crypto');
var jwt = require('jsonwebtoken');
var { unauthorized } = require('../lib/errors');

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

async function revokeFamily(db, familyId) {
  await db.refreshToken.updateMany({ where: { FamilyId: familyId, RevokedAt: null }, data: { RevokedAt: new Date() } });
}

async function revokeAllForUser(db, userId) {
  await db.refreshToken.updateMany({ where: { UserId: userId, RevokedAt: null }, data: { RevokedAt: new Date() } });
}

async function rotateRefreshToken(prisma, config, token) {
  var stored = await prisma.refreshToken.findUnique({ where: { TokenHash: hashToken(token) }, include: { User: true } });
  if (!stored) throw unauthorized('Invalid refresh token');
  if (stored.RevokedAt) {
    // A revoked token coming back means it was copied: end every session descended from that login.
    await revokeFamily(prisma, stored.FamilyId);
    throw unauthorized('Refresh token was already used');
  }
  if (stored.ExpiresAt.getTime() <= Date.now()) throw unauthorized('Refresh token expired');
  if (!stored.User.IsActive) {
    await revokeFamily(prisma, stored.FamilyId);
    throw unauthorized('Account is disabled');
  }

  var refreshToken = await prisma.$transaction(async function (tx) {
    var revoked = await tx.refreshToken.updateMany({
      where: { TokenId: stored.TokenId, RevokedAt: null },
      data: { RevokedAt: new Date() },
    });
    if (revoked.count === 0) return null;
    return createRefreshToken(tx, stored.UserId, stored.FamilyId);
  });
  if (!refreshToken) {
    // Another request rotated this token between our read and our write.
    await revokeFamily(prisma, stored.FamilyId);
    throw unauthorized('Refresh token was already used');
  }
  return { accessToken: signAccessToken(config, stored.UserId), refreshToken: refreshToken };
}

async function revokeByToken(db, token) {
  var stored = await db.refreshToken.findUnique({ where: { TokenHash: hashToken(token) } });
  if (stored) await revokeFamily(db, stored.FamilyId);
}

module.exports = {
  REFRESH_TOKEN_TTL_MS,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  issueTokens,
  revokeFamily,
  revokeAllForUser,
  rotateRefreshToken,
  revokeByToken,
};
