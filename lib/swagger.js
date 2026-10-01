var path = require('path');
var swaggerJsdoc = require('swagger-jsdoc');

// swagger-jsdoc globs need forward slashes, also on Windows.
var routeFiles = path.join(__dirname, '..', 'routes', '*.js').replace(/\\/g, '/');

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'FretWizard API', version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [routeFiles],
});
