const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Create logs directory if it doesn't exist
const logDir = config.LOG_DIR || 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'post-master-api' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: consoleFormat,
      silent: config.NODE_ENV === 'test',
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
    
    // File transport for HTTP requests
    new winston.transports.File({
      filename: path.join(logDir, 'http.log'),
      level: 'http',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
  
  // Handle exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  
  // Handle rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Morgan stream for HTTP logging
const morganStream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Custom log levels for different contexts
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Helper methods for structured logging
const structuredLogger = {
  // Request logging
  request: (req, res, responseTime) => {
    logger.http({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id || 'anonymous',
      referrer: req.get('referer'),
    });
  },
  
  // Error logging with context
  errorWithContext: (error, context = {}) => {
    logger.error({
      message: error.message,
      stack: error.stack,
      ...context,
    });
  },
  
  // Business logic logging
  business: (event, data = {}) => {
    logger.info({
      event,
      ...data,
      type: 'business',
    });
  },
  
  // Security logging
  security: (event, data = {}) => {
    logger.warn({
      event,
      ...data,
      type: 'security',
    });
  },
  
  // Performance logging
  performance: (operation, duration, data = {}) => {
    logger.debug({
      operation,
      duration: `${duration}ms`,
      ...data,
      type: 'performance',
    });
  },
  
  // Database query logging
  query: (query, duration, data = {}) => {
    logger.debug({
      query,
      duration: `${duration}ms`,
      ...data,
      type: 'database',
    });
  },
  
  // API call logging
  apiCall: (url, method, status, duration, data = {}) => {
    logger.http({
      url,
      method,
      status,
      duration: `${duration}ms`,
      ...data,
      type: 'api_call',
    });
  },
  
  // User activity logging
  userActivity: (userId, action, data = {}) => {
    logger.info({
      userId,
      action,
      ...data,
      type: 'user_activity',
    });
  },
};

// Audit logger for compliance
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'audit.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

// Audit log helper
const auditLog = (event, userId, action, details = {}) => {
  auditLogger.info({
    event,
    userId,
    action,
    timestamp: new Date().toISOString(),
    ip: details.ip,
    userAgent: details.userAgent,
    resource: details.resource,
    changes: details.changes,
    status: details.status,
    metadata: details.metadata,
  });
};

module.exports = {
  logger,
  morganStream,
  structuredLogger,
  auditLog,
  
  // Shortcut methods
  error: (message, meta) => logger.error(message, meta),
  warn: (message, meta) => logger.warn(message, meta),
  info: (message, meta) => logger.info(message, meta),
  http: (message, meta) => logger.http(message, meta),
  verbose: (message, meta) => logger.verbose(message, meta),
  debug: (message, meta) => logger.debug(message, meta),
};