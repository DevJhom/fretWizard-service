var test = require('node:test');
var assert = require('node:assert/strict');
var { assertTestDatabaseUrl } = require('../support/env');

test('accepts a URL whose database name contains "test"', function () {
  assert.doesNotThrow(function () {
    assertTestDatabaseUrl('sqlserver://localhost;database=Fretwizard_Test;integratedSecurity=true');
  });
});

test('refuses every other database, even on a server called "test"', function () {
  [
    'sqlserver://localhost;database=Fretwizard;integratedSecurity=true',
    'sqlserver://testserver;database=Fretwizard;integratedSecurity=true',
    undefined,
  ].forEach(function (url) {
    assert.throws(function () {
      assertTestDatabaseUrl(url);
    }, /test database/, String(url));
  });
});
