var REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'CORS_ORIGINS'];

function parseList(value) {
  return value.split(',').map(function (item) {
    return item.trim();
  }).filter(Boolean);
}

function parseTrustProxy(value) {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  var hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

function loadConfig(env) {
  env = env || process.env;
  var missing = REQUIRED.filter(function (name) {
    return !env[name];
  });
  if (missing.length) {
    throw new Error('Missing required environment variables: ' + missing.join(', '));
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return {
    port: env.PORT || '3000',
    jwtSecret: env.JWT_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    corsOrigins: parseList(env.CORS_ORIGINS),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    bcryptCost: 12,
    rateLimits: { auth: 10, refresh: 60 },
    logRequests: true,
  };
}

module.exports = { loadConfig };
