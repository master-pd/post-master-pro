const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('../config/redis');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// Create Redis store for rate limiting
const createRedisStore = () => {
  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rate_limit:',
  });
};

// Standard rate limiter
const standardLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: config.RATE_LIMIT_MAX_REQUESTS || 100, // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: config.RATE_LIMIT_SKIP_SUCCESSFUL || false,
  store: config.ENABLE_REDIS ? createRedisStore() : undefined,
  keyGenerator: (req) => {
    // Use IP + user ID if available for more accurate limiting
    return req.user?.id ? `${req.ip}:${req.user.id}` : req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for ${req.ip}${req.user?.id ? ` user:${req.user.id}` : ''}`);
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(req.rateLimit.resetTime.getTime() / 1000),
      },
    });
  },
});

// Strict rate limiter for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: {
    success: false,
    error: 'Too many requests to this endpoint. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: config.ENABLE_REDIS ? createRedisStore() : undefined,
  skipFailedRequests: false,
});

// Auth rate limiter (for login/register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: config.ENABLE_REDIS ? createRedisStore() : undefined,
  skipSuccessfulRequests: true, // Only count failed attempts
});

// Upload rate limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: {
    success: false,
    error: 'Too many uploads. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: config.ENABLE_REDIS ? createRedisStore() : undefined,
});

// Search rate limiter
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: {
    success: false,
    error: 'Too many search requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: config.ENABLE_REDIS ? createRedisStore() : undefined,
});

// API key rate limiter
const apiKeyLimiter = (maxRequests, windowMs) => {
  return rateLimit({
    windowMs: windowMs || 60 * 1000, // 1 minute default
    max: maxRequests || 60, // 60 requests per minute default
    message: {
      success: false,
      error: 'API rate limit exceeded.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: config.ENABLE_REDIS ? createRedisStore() : undefined,
    keyGenerator: (req) => {
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      return apiKey || req.ip;
    },
  });
};

// Dynamic rate limiter creator
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
  };

  return rateLimit({
    ...defaultOptions,
    ...options,
    store: config.ENABLE_REDIS ? createRedisStore() : undefined,
  });
};

// Middleware to reset rate limit on successful authentication
const resetRateLimitOnAuth = (req, res, next) => {
  if (req.user && req.rateLimit && req.rateLimit.reset) {
    // Reset rate limit for this IP/user
    const key = req.user.id ? `${req.ip}:${req.user.id}` : req.ip;
    
    if (config.ENABLE_REDIS) {
      redis.del(`rate_limit:${key}`);
    }
  }
  next();
};

// Get rate limit info
const getRateLimitInfo = (req) => {
  if (!req.rateLimit) return null;
  
  return {
    limit: req.rateLimit.limit,
    current: req.rateLimit.current,
    remaining: req.rateLimit.remaining,
    resetTime: req.rateLimit.resetTime,
    windowMs: req.rateLimit.windowMs,
  };
};

module.exports = {
  standardLimiter,
  strictLimiter,
  authLimiter,
  uploadLimiter,
  searchLimiter,
  apiKeyLimiter,
  createRateLimiter,
  resetRateLimitOnAuth,
  getRateLimitInfo,
  
  // Default export
  rateLimiter: standardLimiter,
};