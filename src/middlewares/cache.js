const redis = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Cache service for Redis operations
 */
class CacheService {
  constructor() {
    this.client = redis;
    this.defaultTTL = config.CACHE_TTL || 3600; // 1 hour default
    this.enabled = config.ENABLE_CACHING !== 'false';
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.enabled) return null;

    try {
      const value = await this.client.get(key);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled) return;

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl) {
        await this.client.setEx(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    if (!this.enabled) return;

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  /**
   * Delete multiple keys
   */
  async delMultiple(keys) {
    if (!this.enabled || !keys.length) return;

    try {
      await this.client.del(keys);
    } catch (error) {
      logger.error('Cache delete multiple error:', error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.enabled) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget(keys) {
    if (!this.enabled || !keys.length) return [];

    try {
      const values = await this.client.mGet(keys);
      return values.map(value => {
        if (!value) return null;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    } catch (error) {
      logger.error('Cache mget error:', error);
      return [];
    }
  }

  /**
   * Set multiple keys
   */
  async mset(keyValuePairs, ttl = this.defaultTTL) {
    if (!this.enabled || !keyValuePairs.length) return;

    try {
      const pipeline = this.client.multi();
      
      keyValuePairs.forEach(([key, value]) => {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttl) {
          pipeline.setEx(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      });

      await pipeline.exec();
    } catch (error) {
      logger.error('Cache mset error:', error);
    }
  }

  /**
   * Increment counter
   */
  async incr(key, ttl = this.defaultTTL) {
    if (!this.enabled) return 0;

    try {
      const result = await this.client.incr(key);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error('Cache incr error:', error);
      return 0;
    }
  }

  /**
   * Decrement counter
   */
  async decr(key, ttl = this.defaultTTL) {
    if (!this.enabled) return 0;

    try {
      const result = await this.client.decr(key);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error('Cache decr error:', error);
      return 0;
    }
  }

  /**
   * Get keys by pattern
   */
  async keys(pattern) {
    if (!this.enabled) return [];

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  }

  /**
   * Delete keys by pattern
   */
  async delByPattern(pattern) {
    if (!this.enabled) return;

    try {
      const keysToDelete = await this.client.keys(pattern);
      if (keysToDelete.length > 0) {
        await this.client.del(keysToDelete);
      }
    } catch (error) {
      logger.error('Cache delByPattern error:', error);
    }
  }

  /**
   * Set hash field
   */
  async hset(key, field, value) {
    if (!this.enabled) return;

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.hSet(key, field, serialized);
    } catch (error) {
      logger.error('Cache hset error:', error);
    }
  }

  /**
   * Get hash field
   */
  async hget(key, field) {
    if (!this.enabled) return null;

    try {
      const value = await this.client.hGet(key, field);
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return null;
    } catch (error) {
      logger.error('Cache hget error:', error);
      return null;
    }
  }

  /**
   * Get all hash fields
   */
  async hgetall(key) {
    if (!this.enabled) return {};

    try {
      const hash = await this.client.hGetAll(key);
      const result = {};
      
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Cache hgetall error:', error);
      return {};
    }
  }

  /**
   * Delete hash field
   */
  async hdel(key, field) {
    if (!this.enabled) return;

    try {
      await this.client.hDel(key, field);
    } catch (error) {
      logger.error('Cache hdel error:', error);
    }
  }

  /**
   * Set with lock to prevent cache stampede
   */
  async setWithLock(key, fetchFn, ttl = this.defaultTTL, lockTTL = 10) {
    if (!this.enabled) {
      return await fetchFn();
    }

    const lockKey = `lock:${key}`;
    const lockAcquired = await this.acquireLock(lockKey, lockTTL);

    if (!lockAcquired) {
      // Wait and retry getting from cache
      await this.sleep(100);
      const cached = await this.get(key);
      if (cached) return cached;
      
      // If still not cached, wait longer and call fetch function
      await this.sleep(200);
      return await fetchFn();
    }

    try {
      const value = await fetchFn();
      await this.set(key, value, ttl);
      return value;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Acquire distributed lock
   */
  async acquireLock(lockKey, ttl = 10) {
    try {
      const result = await this.client.set(
        lockKey,
        'locked',
        {
          NX: true,
          EX: ttl,
        }
      );
      return result === 'OK';
    } catch (error) {
      logger.error('Cache acquireLock error:', error);
      return false;
    }
  }

  /**
   * Release distributed lock
   */
  async releaseLock(lockKey) {
    try {
      await this.client.del(lockKey);
    } catch (error) {
      logger.error('Cache releaseLock error:', error);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cache middleware for Express
   */
  middleware(ttl = this.defaultTTL) {
    return async (req, res, next) => {
      if (!this.enabled || req.method !== 'GET') {
        return next();
      }

      const cacheKey = `express:${req.originalUrl}`;
      
      try {
        const cached = await this.get(cacheKey);
        if (cached) {
          logger.debug(`Cache hit: ${cacheKey}`);
          return res.json(cached);
        }

        // Store original send function
        const originalSend = res.json;
        
        res.json = function(data) {
          // Cache the response
          cacheService.set(cacheKey, data, ttl)
            .catch(error => logger.error('Cache middleware set error:', error));
          
          // Call original send function
          originalSend.call(this, data);
        };

        next();
      } catch (error) {
        logger.error('Cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern) {
    if (!this.enabled) return;

    try {
      await this.delByPattern(pattern);
    } catch (error) {
      logger.error('Cache invalidate error:', error);
    }
  }

  /**
   * Clear all cache (use with caution)
   */
  async clearAll() {
    if (!this.enabled) return;

    try {
      await this.client.flushAll();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error('Cache clearAll error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.enabled) return null;

    try {
      const info = await this.client.info();
      const stats = {
        connected_clients: 0,
        used_memory_human: '0B',
        total_connections_received: 0,
        total_commands_processed: 0,
        keyspace_hits: 0,
        keyspace_misses: 0,
        uptime_in_seconds: 0,
      };

      // Parse Redis INFO output
      const lines = info.split('\r\n');
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (stats.hasOwnProperty(key)) {
          stats[key] = value;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Cache getStats error:', error);
      return null;
    }
  }

  /**
   * Cache user data
   */
  async cacheUser(userId, userData, ttl = 300) {
    const key = `user:${userId}`;
    await this.set(key, userData, ttl);
    return key;
  }

  /**
   * Get cached user data
   */
  async getCachedUser(userId) {
    const key = `user:${userId}`;
    return await this.get(key);
  }

  /**
   * Invalidate user cache
   */
  async invalidateUserCache(userId) {
    const patterns = [
      `user:${userId}`,
      `user:${userId}:*`,
      `feed:${userId}:*`,
      `posts:user:${userId}:*`,
    ];
    
    await Promise.all(
      patterns.map(pattern => this.invalidate(pattern))
    );
  }

  /**
   * Cache post data
   */
  async cachePost(postId, postData, ttl = 300) {
    const key = `post:${postId}`;
    await this.set(key, postData, ttl);
    return key;
  }

  /**
   * Get cached post data
   */
  async getCachedPost(postId) {
    const key = `post:${postId}`;
    return await this.get(key);
  }

  /**
   * Invalidate post cache
   */
  async invalidatePostCache(postId) {
    const patterns = [
      `post:${postId}`,
      `post:${postId}:*`,
      `feed:*:${postId}`,
      `comments:post:${postId}:*`,
    ];
    
    await Promise.all(
      patterns.map(pattern => this.invalidate(pattern))
    );
  }

  /**
   * Cache feed data
   */
  async cacheFeed(userId, page, feedData, ttl = 60) {
    const key = `feed:${userId}:${page}`;
    await this.set(key, feedData, ttl);
    return key;
  }

  /**
   * Get cached feed data
   */
  async getCachedFeed(userId, page) {
    const key = `feed:${userId}:${page}`;
    return await this.get(key);
  }

  /**
   * Invalidate feed cache
   */
  async invalidateFeedCache(userId) {
    const pattern = `feed:${userId}:*`;
    await this.invalidate(pattern);
  }
}

const cacheService = new CacheService();
module.exports = cacheService;