var path = require('path');
var { URL } = require('url');
var dotenv = require('dotenv');

var ENV_TEST_PATH = path.join(__dirname, '..', '..', '.env.test');

// postgresql://user:password@host:port/<database>?schema=public
function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch (_err) {
    return '';
  }
}

function assertTestDatabaseUrl(url) {
  if (!/test/i.test(databaseName(url))) {
    throw new Error('Integration tests need .env.test with DATABASE_URL pointing at a test database (for example postgresql://fretwizard:PASSWORD@localhost:5432/fretwizard_test?schema=public).');
  }
}

function loadTestEnv() {
  dotenv.config({ path: ENV_TEST_PATH, override: true, quiet: true });
  assertTestDatabaseUrl(process.env.DATABASE_URL);
}

module.exports = { assertTestDatabaseUrl, loadTestEnv };
