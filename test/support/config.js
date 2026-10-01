function testConfig(overrides) {
  return Object.assign({
    port: '0',
    jwtSecret: 'test-jwt-secret-that-is-at-least-32-characters',
    googleClientId: 'test-google-client-id',
    corsOrigins: ['http://localhost:5173'],
    trustProxy: false,
    bcryptCost: 4,
    rateLimits: { auth: 1000, refresh: 1000 },
    logRequests: false,
  }, overrides);
}

module.exports = { testConfig };
