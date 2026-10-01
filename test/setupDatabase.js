var childProcess = require('child_process');
var { loadTestEnv } = require('./support/env');

try {
  loadTestEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

childProcess.execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
  stdio: 'inherit',
  env: process.env,
});
