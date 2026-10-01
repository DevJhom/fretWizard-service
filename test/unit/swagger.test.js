var test = require('node:test');
var assert = require('node:assert/strict');
var swaggerSpec = require('../../lib/swagger');

var EXPECTED = {
  '/health': ['get'],
  '/auth/signup': ['post'],
  '/auth/login': ['post'],
  '/auth/google': ['post'],
  '/auth/refresh': ['post'],
  '/auth/logout': ['post'],
  '/me': ['get', 'patch'],
  '/me/import': ['post'],
  '/library-cards': ['get', 'post'],
  '/library-cards/{id}': ['delete', 'patch'],
  '/workspaces/{setup}': ['get', 'put'],
  '/chord-progression': ['get', 'put'],
};

var PROTECTED = ['/me', '/me/import', '/library-cards', '/library-cards/{id}', '/workspaces/{setup}', '/chord-progression'];

test('every endpoint is documented', function () {
  assert.deepEqual(Object.keys(swaggerSpec.paths).sort(), Object.keys(EXPECTED).sort());
  Object.keys(EXPECTED).forEach(function (path) {
    assert.deepEqual(Object.keys(swaggerSpec.paths[path]).sort(), EXPECTED[path], path);
  });
});

test('protected endpoints declare bearer auth', function () {
  PROTECTED.forEach(function (path) {
    Object.keys(swaggerSpec.paths[path]).forEach(function (method) {
      assert.deepEqual(swaggerSpec.paths[path][method].security, [{ bearerAuth: [] }], method + ' ' + path);
    });
  });
});
