const config = require('../config');
const logger = require('../utils/logger');

/**
 * Middleware to optimize for Render.com free tier
 */
const renderOptimizer = (req, res, next) => {
  // Skip for non-API routes
  if (!req.path.startsWith('/api')) {
    return next();
  }
  
  // Add Render-specific headers
  res.set('X-Powered-By', 'Post-Master Pro on Render');
  res.set('X-Environment', config.NODE_ENV);
  
  // Log slow requests (Render free tier is slower)
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) { // Log requests slower than 1 second
      logger.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  
  next();
};

/**
 * Middleware to prevent cold start issues
 */
const keepAlive = (req, res, next) => {
  // Simple keep-alive endpoint
  if (req.path === '/keep-alive') {
    return res.status(200).json({ 
      alive: true, 
      timestamp: new Date().toISOString() 
    });
  }
  next();
};

/**
 * Memory usage monitor
 */
const memoryMonitor = (req, res, next) => {
  const memoryUsage = process.memoryUsage();
  const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  
  // Log if memory usage is high
  if (memoryPercent > 80) {
    logger.warn(`High memory usage: ${memoryPercent.toFixed(2)}%`);
  }
  
  // Add memory info to response headers in development
  if (config.NODE_ENV === 'development') {
    res.set('X-Memory-Usage', `${memoryPercent.toFixed(2)}%`);
  }
  
  next();
};

module.exports = {
  renderOptimizer,
  keepAlive,
  memoryMonitor,
};