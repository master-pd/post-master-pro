const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient;
let memoryCache = new Map();
let useMemoryCache = false;

// Function to initialize Redis with fallback
const initializeRedis = () => {
  try {
    if (config.REDIS_URL && !config.REDIS_URL.includes('localhost')) {
      // Use provided Redis URL
      redisClient = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        enableOfflineQueue: false,
      });

      redisClient.on('connect', () => {
        logger.info('✅ Connected to Redis');
        useMemoryCache = false;
      });

      redisClient.on('error', (error) => {
        logger.warn('⚠️ Redis error, falling back to memory cache:', error.message);
        useMemoryCache = true;
      });

      redisClient.on('end', () => {
        logger.warn('⚠️ Redis connection ended, using memory cache');
        useMemoryCache = true;
      });
    } else {
      // No Redis URL provided or localhost, use memory cache
      logger.info('ℹ️ Using memory cache (Redis not configured)');
      useMemoryCache = true;
    }
  } catch (error) {
    logger.warn('⚠️ Redis initialization failed, using memory cache:', error.message);
    useMemoryCache = true;
  }
};

// Initialize Redis
initializeRedis();

// Unified client with fallback to memory cache
const unifiedClient = {
  async get(key) {
    if (!useMemoryCache && redisClient) {
      try {
        return await redisClient.get(key);
      } catch (error) {
        logger.debug('Redis get failed, using memory cache:', error.message);
        useMemoryCache = true;
        return memoryCache.get(key) || null;
      }
    }
    return memoryCache.get(key) || null;
  },

  async set(key, value, expiryMode = 'EX', time) {
    if (!useMemoryCache && redisClient) {
      try {
        if (time) {
          return await redisClient.set(key, value, expiryMode, time);
        }
        return await redisClient.set(key, value);
      } catch (error) {
        logger.debug('Redis set failed, using memory cache:', error.message);
        useMemoryCache = true;
      }
    }
    
    memoryCache.set(key, value);
    if (time) {
      setTimeout(() => {
        memoryCache.delete(key);
      }, time * 1000);
    }
    return 'OK';
  },

  async del(key) {
    if (!useMemoryCache && redisClient) {
      try {
        return await redisClient.del(key);
      } catch (error) {
        logger.debug('Redis del failed, using memory cache:', error.message);
        useMemoryCache = true;
      }
    }
    
    const deleted = memoryCache.delete(key);
    return deleted ? 1 : 0;
  },

  async exists(key) {
    if (!useMemoryCache && redisClient) {
      try {
        return await redisClient.exists(key);
      } catch (error) {
        logger.debug('Redis exists failed, using memory cache:', error.message);
        useMemoryCache = true;
      }
    }
    
    return memoryCache.has(key) ? 1 : 0;
  },

  async expire(key, seconds) {
    if (!useMemoryCache && redisClient) {
      try {
        return await redisClient.expire(key, seconds);
      } catch (error) {
        logger.debug('Redis expire failed, using memory cache:', error.message);
        useMemoryCache = true;
      }
    }
    
    if (memoryCache.has(key)) {
      setTimeout(() => {
        memoryCache.delete(key);
      }, seconds * 1000);
      return 1;
    }
    return 0;
  },

  async quit() {
    if (redisClient && !useMemoryCache) {
      try {
        await redisClient.quit();
      } catch (error) {
        logger.debug('Redis quit failed:', error.message);
      }
    }
    memoryCache.clear();
    return 'OK';
  },

  // Additional utility methods
  async hset(key, field, value) {
    if (!useMemoryCache && redisClient) {
      try {
        return await redisClient.hset(key, field, value);
      } catch (error) {
        logger.debug('Redis hset failed, using memory cache:', error.message);
        useMemoryCache = true;
      }
    }
    
    const hashKey = `${key}:${field}`;
    memoryCache.set(hashKey, value);
    return 1;
  },

  async hget(key, field) {
    if (!useMemoryCache && redisClient) {
      try {
        return await redisClient.hget(key, field);
      } catch (error) {
        logger.debug('Redis hget failed, using memory cache:', error.message);
        useMemoryCache = true;
      }
    }
    
    const hashKey = `${key}:${field}`;
    return memoryCache.get(hashKey) || null;
  },

  // Event emitter stub
  on(event, handler) {
    if (redisClient && !useMemoryCache) {
      redisClient.on(event, handler);
    }
  },
};

const connectRedis = async () => {
  return unifiedClient;
};

module.exports = unifiedClient;
module.exports.connectRedis = connectRedis;