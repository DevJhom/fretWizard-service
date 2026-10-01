var test = require('node:test');
var assert = require('node:assert/strict');
var express = require('express');
var request = require('supertest');
var { z } = require('zod');
var { AppError } = require('../../lib/errors');
var errorHandler = require('../../middleware/errorHandler');

function appFailingWith(error) {
  var app = express();
  app.get('/', function (req, res, next) {
    next(error);
  });
  app.use(errorHandler);
  return app;
}

function prismaError(code) {
  return Object.assign(new Error('Prisma failure'), { name: 'PrismaClientKnownRequestError', code: code });
}

test('AppError keeps its status, code, message and details', async function () {
  var details = [{ path: 'email', message: 'Taken' }];
  var res = await request(appFailingWith(new AppError(409, 'CONFLICT', 'Taken', details))).get('/');
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: { code: 'CONFLICT', message: 'Taken', details: details } });
});

test('ZodError becomes VALIDATION_ERROR with one detail per field', async function () {
  var result = z.object({ email: z.string() }).safeParse({});
  var res = await request(appFailingWith(result.error)).get('/');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, {
    error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: [{ path: 'email', message: 'Required' }] },
  });
});

test('Prisma unique-constraint errors become CONFLICT', async function () {
  var res = await request(appFailingWith(prismaError('P2002'))).get('/');
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: { code: 'CONFLICT', message: 'Already exists' } });
});

test('Prisma record-not-found errors become NOT_FOUND', async function () {
  var res = await request(appFailingWith(prismaError('P2025'))).get('/');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Not found' } });
});

test('unknown errors become INTERNAL without leaking details', async function (t) {
  t.mock.method(console, 'error', function () {});
  var res = await request(appFailingWith(new Error('secret database detail'))).get('/');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: { code: 'INTERNAL', message: 'Something went wrong' } });
});
