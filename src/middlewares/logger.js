const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Create logs directory if it doesn't exist
const logDir = config.LOG_DIR || 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0 && !meta.stack) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (meta.stack) {
      log += `\n${meta.stack}`;
    }
    
    return log;
  })
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(meta).length > 0 && !meta.stack) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (meta.stack) {
      log += `\n${meta.stack}`;
    }
    
    return log;
  })
);

// Define transports based on environment
const transports = [];

// Console transport for all environments
transports.push(
  new winston.transports.Console({
    format: consoleFormat,
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
  })
);

// File transport for errors
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 10,
    tailable: true,
  })
);

// File transport for combined logs
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 10,
    tailable: true,
  })
);

// HTTP log transport
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'http.log'),
    level: 'http',
    maxsize: 5242880,
    maxFiles: 10,
    tailable: true,
  })
);

// Audit log transport for security events
transports.push(
  new winston.transports.File({
    filename: path.join(logDir, 'audit.log'),
    level: 'info',
    maxsize: 5242880,
    maxFiles: 5,
    tailable: true,
  })
);

// Create the logger instance
const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
    }),
  ],
  exitOnError: false,
});

// Log stream for Morgan
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

/**
 * Log HTTP requests
 */
logger.http = function (data) {
  const { method, url, status, duration, ip, userAgent, userId } = data;
  
  const logData = {
    method,
    url,
    status,
    duration,
    ip,
    userAgent,
    userId: userId || 'anonymous',
    timestamp: new Date().toISOString(),
  };
  
  this.log('http', `${method} ${url} ${status} ${duration}`, logData);
};

/**
 * Log database queries
 */
logger.db = function (query, duration, params = {}) {
  const logData = {
    query,
    duration: `${duration}ms`,
    params,
    timestamp: new Date().toISOString(),
  };
  
  this.debug('Database query executed', logData);
};

/**
 * Log cache operations
 */
logger.cache = function (operation, key, hit = false, duration = 0) {
  const logData = {
    operation,
    key,
    hit,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
  };
  
  this.debug(`Cache ${operation}: ${key} (${hit ? 'HIT' : 'MISS'})`, logData);
};

/**
 * Log authentication events
 */
logger.auth = function (event, userId, ip, success = true) {
  const logData = {
    event,
    userId,
    ip,
    success,
    timestamp: new Date().toISOString(),
  };
  
  const message = `${event} ${success ? 'successful' : 'failed'} for user ${userId}`;
  
  if (success) {
    this.info(message, logData);
  } else {
    this.warn(message, logData);
  }
};

/**
 * Log security events
 */
logger.security = function (event, details) {
  const logData = {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  };
  
  this.warn(`Security event: ${event}`, logData);
};

/**
 * Log business events
 */
logger.business = function (event, entity, entityId, details = {}) {
  const logData = {
    event,
    entity,
    entityId,
    ...details,
    timestamp: new Date().toISOString(),
  };
  
  this.info(`Business event: ${event} for ${entity} ${entityId}`, logData);
};

/**
 * Log performance metrics
 */
logger.performance = function (operation, duration, details = {}) {
  const logData = {
    operation,
    duration: `${duration}ms`,
    ...details,
    timestamp: new Date().toISOString(),
  };
  
  if (duration > 1000) {
    this.warn(`Slow operation: ${operation} took ${duration}ms`, logData);
  } else {
    this.debug(`Performance: ${operation} took ${duration}ms`, logData);
  }
};

/**
 * Log email sending
 */
logger.email = function (event, to, subject, success = true) {
  const logData = {
    event,
    to,
    subject,
    success,
    timestamp: new Date().toISOString(),
  };
  
  const message = `Email ${event} ${success ? 'sent' : 'failed'} to ${to}`;
  
  if (success) {
    this.info(message, logData);
  } else {
    this.error(message, logData);
  }
};

/**
 * Log file uploads
 */
logger.upload = function (operation, filename, size, userId, success = true) {
  const logData = {
    operation,
    filename,
    size: `${size} bytes`,
    userId,
    success,
    timestamp: new Date().toISOString(),
  };
  
  const message = `File upload ${operation} ${success ? 'completed' : 'failed'} for ${filename}`;
  
  if (success) {
    this.info(message, logData);
  } else {
    this.error(message, logData);
  }
};

/**
 * Log API responses
 */
logger.api = function (endpoint, method, status, responseTime, userId) {
  const logData = {
    endpoint,
    method,
    status,
    responseTime: `${responseTime}ms`,
    userId: userId || 'anonymous',
    timestamp: new Date().toISOString(),
  };
  
  let level = 'info';
  
  if (status >= 500) {
    level = 'error';
  } else if (status >= 400) {
    level = 'warn';
  } else if (responseTime > 1000) {
    level = 'warn';
  }
  
  this.log(level, `${method} ${endpoint} ${status} ${responseTime}ms`, logData);
};

/**
 * Log job queue events
 */
logger.job = function (queue, jobId, event, details = {}) {
  const logData = {
    queue,
    jobId,
    event,
    ...details,
    timestamp: new Date().toISOString(),
  };
  
  this.info(`Job ${event} in queue ${queue}`, logData);
};

/**
 * Log socket events
 */
logger.socket = function (event, socketId, userId, details = {}) {
  const logData = {
    event,
    socketId,
    userId: userId || 'anonymous',
    ...details,
    timestamp: new Date().toISOString(),
  };
  
  this.debug(`Socket event: ${event}`, logData);
};

/**
 * Create a child logger with additional metadata
 */
logger.child = function (metadata) {
  return this.childLogger = winston.createLogger({
    level: this.level,
    levels: this.levels,
    format: winston.format.combine(
      winston.format.metadata(),
      this.format
    ),
    transports: this.transports,
    defaultMeta: metadata,
  });
};

/**
 * Middleware for Express logging
 */
logger.middleware = function () {
  return (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      
      this.api(
        req.originalUrl,
        req.method,
        res.statusCode,
        duration,
        req.user?.id
      );
    });
    
    next();
  };
};

/**
 * Log startup information
 */
logger.startup = function (appName, version, port, environment) {
  this.info('='.repeat(50));
  this.info(`${appName} v${version}`);
  this.info(`Environment: ${environment}`);
  this.info(`Port: ${port}`);
  this.info(`PID: ${process.pid}`);
  this.info(`Node: ${process.version}`);
  this.info(`Platform: ${process.platform}`);
  this.info(`Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
  this.info('='.repeat(50));
};

/**
 * Log shutdown information
 */
logger.shutdown = function (signal) {
  this.info(`Received ${signal} signal. Shutting down gracefully...`);
};

module.exports = logger;