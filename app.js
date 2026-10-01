var express = require('express');
var logger = require('morgan');
var cors = require('cors');
var swaggerUi = require('swagger-ui-express');

var swaggerSpec = require('./lib/swagger');
var { notFound } = require('./lib/errors');
var errorHandler = require('./middleware/errorHandler');
var healthRouter = require('./routes/health');

function createApp(deps) {
  var config = deps.config;
  var app = express();

  app.set('trust proxy', config.trustProxy);
  if (config.logRequests) app.use(logger('dev'));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/health', healthRouter);

  app.use(function (req, res, next) {
    next(notFound());
  });
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
