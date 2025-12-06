const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const errorConverter = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    
    error = new ApiError(statusCode, message, false, err.stack);
  }
  
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;
  
  if (config.NODE_ENV === 'production' && !err.isOperational) {
    statusCode = 500;
    message = 'Internal Server Error';
  }

  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    statusCode: statusCode,
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode,
      message: message,
      ...(config.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

// 404 handler
const notFound = (req, res, next) => {
  next(new ApiError(404, `Route ${req.originalUrl} not found`));
};

// Async handler wrapper
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorConverter,
  errorHandler,
  notFound,
  catchAsync,
};