var { ZodError } = require('zod');
var { AppError } = require('../lib/errors');

function sendError(res, status, code, message, details) {
  var body = { error: { code: code, message: message } };
  if (details && details.length) body.error.details = details;
  res.status(status).json(body);
}

function formatIssues(issues) {
  return issues.map(function (issue) {
    return { path: issue.path.join('.'), message: issue.message };
  });
}

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) return sendError(res, err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request', formatIssues(err.issues));
  if (err.type === 'entity.parse.failed') return sendError(res, 400, 'VALIDATION_ERROR', 'Malformed JSON body');
  if (err.type === 'entity.too.large') return sendError(res, 400, 'VALIDATION_ERROR', 'Request body too large');
  if (err.name === 'PrismaClientKnownRequestError' && err.code === 'P2002') {
    return sendError(res, 409, 'CONFLICT', 'Already exists');
  }
  if (err.name === 'PrismaClientKnownRequestError' && err.code === 'P2025') {
    return sendError(res, 404, 'NOT_FOUND', 'Not found');
  }
  console.error(err);
  return sendError(res, 500, 'INTERNAL', 'Something went wrong');
}

module.exports = errorHandler;
