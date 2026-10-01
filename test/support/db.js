var { beforeEach, after } = require('node:test');
var { loadTestEnv } = require('./env');

loadTestEnv();

var { PrismaClient } = require('@prisma/client');

var prisma = new PrismaClient();

function useDatabase() {
  beforeEach(async function () {
    // Every other table cascades from User.
    await prisma.user.deleteMany();
  });
  after(async function () {
    await prisma.$disconnect();
  });
}

module.exports = { prisma, useDatabase };
