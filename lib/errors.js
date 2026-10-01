class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notFound(message) {
  return new AppError(404, 'NOT_FOUND', message || 'Not found');
}

function unauthorized(message) {
  return new AppError(401, 'UNAUTHORIZED', message || 'Unauthorized');
}

function conflict(message) {
  return new AppError(409, 'CONFLICT', message);
}

function limitExceeded(message) {
  return new AppError(409, 'LIMIT_EXCEEDED', message);
}

function rateLimited() {
  return new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again in a minute.');
}

module.exports = { AppError, notFound, unauthorized, conflict, limitExceeded, rateLimited };
