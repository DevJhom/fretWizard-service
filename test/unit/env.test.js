var test = require('node:test');
var assert = require('node:assert/strict');
var { assertTestDatabaseUrl } = require('../support/env');

test('accepts a URL whose database name contains "test"', function () {
  assert.doesNotThrow(function () {
    assertTestDatabaseUrl('postgresql://fretwizard:secret@localhost:5432/fretwizard_test?schema=public');
  });
});

test('refuses every other database, even when the server or user is called "test"', function () {
  [
    'postgresql://fretwizard:secret@localhost:5432/fretwizard?schema=public',
    'postgresql://fretwizard:secret@testserver:5432/fretwizard',
    'postgresql://test:secret@localhost:5432/fretwizard',
    'postgresql://fretwizard:test@localhost:5432/fretwizard?schema=test',
    // A stale SQL Server .env.test must not pass
    'sqlserver://localhost;database=Fretwizard_Test;integratedSecurity=true',
    'not a url',
    undefined,
  ].forEach(function (url) {
    assert.throws(function () {
      assertTestDatabaseUrl(url);
    }, /test database/, String(url));
  });
});
