var bcrypt = require('bcrypt');
var tokens = require('./tokens');
var { conflict, unauthorized } = require('../lib/errors');

var GOOGLE = 'google';
var DUMMY_PASSWORD = 'fretwizard-dummy-password';
var dummyHashes = {};

function toUserResponse(user) {
  return { id: user.UserId, email: user.Email, username: user.Username };
}

// Comparing against a real hash when the account can't use a password keeps the
// response time the same, so it doesn't reveal which emails have accounts.
function dummyHash(cost) {
  if (!dummyHashes[cost]) dummyHashes[cost] = bcrypt.hashSync(DUMMY_PASSWORD, cost);
  return dummyHashes[cost];
}

async function createWithPassword(db, config, input) {
  var existing = await db.user.findUnique({ where: { Email: input.email } });
  if (existing) throw conflict('An account with this email already exists');
  var passwordHash = await bcrypt.hash(input.password, config.bcryptCost);
  return db.user.create({ data: { Email: input.email, Username: input.username, PasswordHash: passwordHash } });
}

async function verifyPassword(db, config, input) {
  var user = await db.user.findUnique({ where: { Email: input.email } });
  var canUsePassword = Boolean(user && user.IsActive && user.PasswordHash);
  var matches = await bcrypt.compare(input.password, canUsePassword ? user.PasswordHash : dummyHash(config.bcryptCost));
  if (!canUsePassword || !matches) throw unauthorized('Invalid email or password');
  return user;
}

function googleUsername(name, email) {
  var fromName = (name || '').trim().slice(0, 100);
  return fromName || email.split('@')[0].slice(0, 100);
}

async function signInWithGoogle(prisma, identity) {
  if (!identity.emailVerified || !identity.email) throw unauthorized('Google login failed');
  var email = identity.email.trim().toLowerCase();

  var login = await prisma.userLogin.findUnique({
    where: { Provider_ProviderUserId: { Provider: GOOGLE, ProviderUserId: identity.sub } },
    include: { User: true },
  });
  if (login) {
    if (!login.User.IsActive) throw unauthorized('Google login failed');
    return { user: login.User, isNewUser: false };
  }

  var existing = await prisma.user.findUnique({ where: { Email: email } });
  if (existing) {
    if (!existing.IsActive) throw unauthorized('Google login failed');
    // Google proved who owns this email; the password never was, so it goes,
    // along with every session that password may have started.
    var linked = await prisma.$transaction(async function (tx) {
      await tx.userLogin.create({ data: { UserId: existing.UserId, Provider: GOOGLE, ProviderUserId: identity.sub } });
      await tokens.revokeAllForUser(tx, existing.UserId);
      return tx.user.update({ where: { UserId: existing.UserId }, data: { PasswordHash: null } });
    });
    return { user: linked, isNewUser: false };
  }

  var created = await prisma.user.create({
    data: {
      Email: email,
      Username: googleUsername(identity.name, email),
      Logins: { create: { Provider: GOOGLE, ProviderUserId: identity.sub } },
    },
  });
  return { user: created, isNewUser: true };
}

function findById(db, userId) {
  return db.user.findUnique({ where: { UserId: userId } });
}

function updateUsername(db, userId, username) {
  return db.user.update({ where: { UserId: userId }, data: { Username: username } });
}

module.exports = { toUserResponse, createWithPassword, verifyPassword, signInWithGoogle, findById, updateUsername };
