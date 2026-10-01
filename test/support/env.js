var path = require('path');
var dotenv = require('dotenv');

var ENV_TEST_PATH = path.join(__dirname, '..', '..', '.env.test');

function databaseName(url) {
  var match = /database=([^;]+)/i.exec(url || '');
  return match ? match[1] : '';
}

function assertTestDatabaseUrl(url) {
  if (!/test/i.test(databaseName(url))) {
    throw new Error('Integration tests need .env.test with DATABASE_URL pointing at a test database (for example Fretwizard_Test). Copy .env.test.example.');
  }
}

function loadTestEnv() {
  dotenv.config({ path: ENV_TEST_PATH, override: true, quiet: true });
  assertTestDatabaseUrl(process.env.DATABASE_URL);
}

module.exports = { assertTestDatabaseUrl, loadTestEnv };
