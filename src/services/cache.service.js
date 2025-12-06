const redis = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.defaultTTL = config.CACHE_TTL || 3600; // 1 hour default
  }

  // Set cache with TTL
  async set(key, value, ttl = this.defaultTTL) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      const stringValue = JSON.stringify(value);
      await redis.setex(key, ttl, stringValue);
      logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  // Get cache
  async get(key) {
    if (!config.ENABLE_CACHING) return null;
    
    try {
      const value = await redis.get(key);
      if (value) {
        logger.debug(`Cache hit: ${key}`);
        return JSON.parse(value);
      }
      logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  // Delete cache
  async del(key) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      await redis.del(key);
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  // Delete multiple keys by pattern
  async delPattern(pattern) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
        logger.debug(`Cache deleted pattern: ${pattern} (${keys.length} keys)`);
      }
    } catch (error) {
      logger.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  // Check if key exists
  async exists(key) {
    if (!config.ENABLE_CACHING) return false;
    
    try {
      const exists = await redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  // Get TTL
  async ttl(key) {
    if (!config.ENABLE_CACHING) return -2;
    
    try {
      return await redis.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -2;
    }
  }

  // Increment value
  async incr(key, amount = 1) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      await redis.incrby(key, amount);
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
    }
  }

  // Decrement value
  async decr(key, amount = 1) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      await redis.decrby(key, amount);
    } catch (error) {
      logger.error(`Cache decrement error for key ${key}:`, error);
    }
  }

  // Set hash field
  async hset(key, field, value) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      const stringValue = JSON.stringify(value);
      await redis.hset(key, field, stringValue);
    } catch (error) {
      logger.error(`Cache hset error for key ${key}.${field}:`, error);
    }
  }

  // Get hash field
  async hget(key, field) {
    if (!config.ENABLE_CACHING) return null;
    
    try {
      const value = await redis.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache hget error for key ${key}.${field}:`, error);
      return null;
    }
  }

  // Get all hash fields
  async hgetall(key) {
    if (!config.ENABLE_CACHING) return {};
    
    try {
      const data = await redis.hgetall(key);
      const result = {};
      
      for (const [field, value] of Object.entries(data)) {
        result[field] = JSON.parse(value);
      }
      
      return result;
    } catch (error) {
      logger.error(`Cache hgetall error for key ${key}:`, error);
      return {};
    }
  }

  // Delete hash field
  async hdel(key, field) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      await redis.hdel(key, field);
    } catch (error) {
      logger.error(`Cache hdel error for key ${key}.${field}:`, error);
    }
  }

  // Add to sorted set
  async zadd(key, score, value) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      const stringValue = JSON.stringify(value);
      await redis.zadd(key, score, stringValue);
    } catch (error) {
      logger.error(`Cache zadd error for key ${key}:`, error);
    }
  }

  // Get range from sorted set
  async zrange(key, start, stop, withScores = false) {
    if (!config.ENABLE_CACHING) return [];
    
    try {
      const args = [key, start, stop];
      if (withScores) args.push('WITHSCORES');
      
      const result = await redis.zrange(...args);
      
      if (withScores) {
        const parsed = [];
        for (let i = 0; i < result.length; i += 2) {
          parsed.push({
            score: parseFloat(result[i + 1]),
            value: JSON.parse(result[i]),
          });
        }
        return parsed;
      }
      
      return result.map(item => JSON.parse(item));
    } catch (error) {
      logger.error(`Cache zrange error for key ${key}:`, error);
      return [];
    }
  }

  // Remove from sorted set
  async zrem(key, value) {
    if (!config.ENABLE_CACHING) return;
    
    try {
      const stringValue = JSON.stringify(value);
      await redis.zrem(key, stringValue);
    } catch (error) {
      logger.error(`Cache zrem error for key ${key}:`, error);
    }
  }

  // User-specific cache methods

  // Invalidate user cache
  async invalidateUserCache(userId) {
    await this.delPattern(`user:${userId}:*`);
    await this.del(`user:${userId}:profile`);
    await this.del(`user:${userId}:settings`);
  }

  // Cache user profile
  async cacheUserProfile(userId, profile) {
    await this.set(`user:${userId}:profile`, profile, 1800); // 30 minutes
  }

  // Get cached user profile
  async getCachedUserProfile(userId) {
    return await this.get(`user:${userId}:profile`);
  }

  // Invalidate user feed cache
  async invalidateUserFeed(userId) {
    await this.delPattern(`feed:user:${userId}:*`);
    await this.del(`feed:user:${userId}:home`);
    await this.del(`feed:user:${userId}:for-you`);
  }

  // Cache user feed
  async cacheUserFeed(userId, feedType, feed, page = 1) {
    const key = `feed:user:${userId}:${feedType}:page:${page}`;
    await this.set(key, feed, 300); // 5 minutes
  }

  // Get cached user feed
  async getCachedUserFeed(userId, feedType, page = 1) {
    const key = `feed:user:${userId}:${feedType}:page:${page}`;
    return await this.get(key);
  }

  // Post cache methods

  // Invalidate post cache
  async invalidatePostCache(postId) {
    await this.del(`post:${postId}`);
    await this.del(`post:${postId}:comments`);
    await this.del(`post:${postId}:likes`);
    await this.delPattern(`post:${postId}:analytics:*`);
  }

  // Cache post
  async cachePost(postId, post) {
    await this.set(`post:${postId}`, post, 900); // 15 minutes
  }

  // Get cached post
  async getCachedPost(postId) {
    return await this.get(`post:${postId}`);
  }

  // Cache post comments
  async cachePostComments(postId, comments, page = 1) {
    const key = `post:${postId}:comments:page:${page}`;
    await this.set(key, comments, 600); // 10 minutes
  }

  // Get cached post comments
  async getCachedPostComments(postId, page = 1) {
    const key = `post:${postId}:comments:page:${page}`;
    return await this.get(key);
  }

  // Search cache methods

  // Cache search results
  async cacheSearchResults(query, type, results) {
    const key = `search:${type}:${this.hashQuery(query)}`;
    await this.set(key, results, 1800); // 30 minutes
  }

  // Get cached search results
  async getCachedSearchResults(query, type) {
    const key = `search:${type}:${this.hashQuery(query)}`;
    return await this.get(key);
  }

  // Invalidate search cache
  async invalidateSearchCache(query, type) {
    const key = `search:${type}:${this.hashQuery(query)}`;
    await this.del(key);
  }

  // Analytics cache methods

  // Cache analytics
  async cacheAnalytics(key, data, ttl = 3600) {
    await this.set(`analytics:${key}`, data, ttl);
  }

  // Get cached analytics
  async getCachedAnalytics(key) {
    return await this.get(`analytics:${key}`);
  }

  // Session cache methods

  // Cache user session
  async cacheUserSession(userId, sessionId, data) {
    const key = `session:${userId}:${sessionId}`;
    await this.set(key, data, 86400); // 24 hours
  }

  // Get cached session
  async getCachedSession(userId, sessionId) {
    const key = `session:${userId}:${sessionId}`;
    return await this.get(key);
  }

  // Delete user session
  async deleteUserSession(userId, sessionId) {
    const key = `session:${userId}:${sessionId}`;
    await this.del(key);
  }

  // Rate limiting cache methods

  // Increment rate limit counter
  async incrementRateLimit(key, windowMs) {
    const count = await this.incr(key);
    
    if (count === 1) {
      // Set expiration on first increment
      await redis.expire(key, Math.floor(windowMs / 1000));
    }
    
    return count;
  }

  // Get rate limit count
  async getRateLimitCount(key) {
    const count = await redis.get(key);
    return count ? parseInt(count) : 0;
  }

  // Helper methods

  // Hash query for cache key
  hashQuery(query) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(query).digest('hex');
  }

  // Generate cache key
  generateKey(prefix, ...args) {
    const keyParts = args.map(arg => {
      if (typeof arg === 'object') {
        return this.hashQuery(JSON.stringify(arg));
      }
      return String(arg);
    });
    
    return `${prefix}:${keyParts.join(':')}`;
  }

  // Clear all cache (use with caution)
  async clearAll() {
    if (!config.ENABLE_CACHING) return;
    
    try {
      await redis.flushall();
      logger.warn('All cache cleared');
    } catch (error) {
      logger.error('Failed to clear cache:', error);
    }
  }

  // Get cache stats
  async getStats() {
    if (!config.ENABLE_CACHING) return {};
    
    try {
      const info = await redis.info();
      const lines = info.split('\r\n');
      const stats = {};
      
      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          stats[key] = value;
        }
      }
      
      return {
        connected_clients: stats.connected_clients,
        used_memory_human: stats.used_memory_human,
        total_connections_received: stats.total_connections_received,
        total_commands_processed: stats.total_commands_processed,
        instantaneous_ops_per_sec: stats.instantaneous_ops_per_sec,
        keyspace_hits: stats.keyspace_hits,
        keyspace_misses: stats.keyspace_misses,
        hit_rate: stats.keyspace_hits && stats.keyspace_misses ? 
          (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses))).toFixed(2) : '0',
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {};
    }
  }

  // Health check
  async healthCheck() {
    if (!config.ENABLE_CACHING) return { healthy: true, message: 'Caching disabled' };
    
    try {
      await redis.ping();
      return { healthy: true, message: 'Redis is connected' };
    } catch (error) {
      return { healthy: false, message: 'Redis connection failed', error: error.message };
    }
  }
}

module.exports = new CacheService();