var bcrypt = require('bcrypt');
var { conflict, unauthorized } = require('../lib/errors');

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

function findById(db, userId) {
  return db.user.findUnique({ where: { UserId: userId } });
}

function updateUsername(db, userId, username) {
  return db.user.update({ where: { UserId: userId }, data: { Username: username } });
}

module.exports = { toUserResponse, createWithPassword, verifyPassword, findById, updateUsername };
