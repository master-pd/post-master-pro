const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const Post = require('../models/Post');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const cacheService = require('../services/cache.service');
const fileService = require('../services/file.service');

// Create cleanup queue
const cleanupQueue = new Queue('cleanup', {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

/**
 * Cleanup worker processor
 */
cleanupQueue.process('cleanTempFiles', async (job) => {
  const { days = 1 } = job.data;
  
  logger.job('cleanup', job.id, 'temp_files_started', { days });

  try {
    const result = await cleanTempFiles(days);
    
    logger.job('cleanup', job.id, 'temp_files_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'temp_files_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanOldPosts', async (job) => {
  const { days = 90, softDelete = true } = job.data;
  
  logger.job('cleanup', job.id, 'old_posts_started', { days, softDelete });

  try {
    const result = await cleanOldPosts(days, softDelete);
    
    logger.job('cleanup', job.id, 'old_posts_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'old_posts_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanInactiveUsers', async (job) => {
  const { days = 365, deleteData = false } = job.data;
  
  logger.job('cleanup', job.id, 'inactive_users_started', { days, deleteData });

  try {
    const result = await cleanInactiveUsers(days, deleteData);
    
    logger.job('cleanup', job.id, 'inactive_users_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'inactive_users_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanOldMessages', async (job) => {
  const { days = 30, archive = true } = job.data;
  
  logger.job('cleanup', job.id, 'old_messages_started', { days, archive });

  try {
    const result = await cleanOldMessages(days, archive);
    
    logger.job('cleanup', job.id, 'old_messages_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'old_messages_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanOldNotifications', async (job) => {
  const { days = 30 } = job.data;
  
  logger.job('cleanup', job.id, 'old_notifications_started', { days });

  try {
    const result = await cleanOldNotifications(days);
    
    logger.job('cleanup', job.id, 'old_notifications_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'old_notifications_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanExpiredSessions', async (job) => {
  const { days = 7 } = job.data;
  
  logger.job('cleanup', job.id, 'expired_sessions_started', { days });

  try {
    const result = await cleanExpiredSessions(days);
    
    logger.job('cleanup', job.id, 'expired_sessions_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'expired_sessions_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanOrphanedFiles', async (job) => {
  logger.job('cleanup', job.id, 'orphaned_files_started');

  try {
    const result = await cleanOrphanedFiles();
    
    logger.job('cleanup', job.id, 'orphaned_files_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'orphaned_files_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanCache', async (job) => {
  const { pattern = '*', maxAge = 86400 } = job.data;
  
  logger.job('cleanup', job.id, 'cache_started', { pattern, maxAge });

  try {
    const result = await cleanCache(pattern, maxAge);
    
    logger.job('cleanup', job.id, 'cache_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'cache_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('cleanLogs', async (job) => {
  const { days = 30, compress = true } = job.data;
  
  logger.job('cleanup', job.id, 'logs_started', { days, compress });

  try {
    const result = await cleanLogs(days, compress);
    
    logger.job('cleanup', job.id, 'logs_completed', result);
    
    return result;
  } catch (error) {
    logger.job('cleanup', job.id, 'logs_failed', {
      error: error.message,
    });

    throw error;
  }
});

cleanupQueue.process('fullCleanup', async (job) => {
  const { options = {} } = job.data;
  
  logger.job('cleanup', job.id, 'full_cleanup_started', { options });

  try {
    const results = await performFullCleanup(options);
    
    logger.job('cleanup', job.id, 'full_cleanup_completed', {
      tasks: Object.keys(results),
    });
    
    return results;
  } catch (error) {
    logger.job('cleanup', job.id, 'full_cleanup_failed', {
      error: error.message,
    });

    throw error;
  }
});

/**
 * Clean temporary files
 */
async function cleanTempFiles(days) {
  const fs = require('fs');
  const path = require('path');
  const { promisify } = require('util');
  
  const readdirAsync = promisify(fs.readdir);
  const statAsync = promisify(fs.stat);
  const unlinkAsync = promisify(fs.unlink);
  const rmdirAsync = promisify(fs.rmdir);
  
  const tempDir = path.join(__dirname, '../../temp');
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  let deletedFiles = 0;
  let deletedDirs = 0;
  let totalSize = 0;
  
  async function cleanDirectory(dirPath) {
    try {
      const files = await readdirAsync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await statAsync(filePath);
        
        if (stats.isDirectory()) {
          await cleanDirectory(filePath);
          
          // Check if directory is empty
          const dirFiles = await readdirAsync(filePath);
          if (dirFiles.length === 0) {
            await rmdirAsync(filePath);
            deletedDirs++;
          }
        } else if (stats.mtime < cutoffDate) {
          await unlinkAsync(filePath);
          deletedFiles++;
          totalSize += stats.size;
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  
  if (fs.existsSync(tempDir)) {
    await cleanDirectory(tempDir);
  }
  
  return {
    deletedFiles,
    deletedDirs,
    totalSize: formatBytes(totalSize),
    cutoffDate,
  };
}

/**
 * Clean old posts
 */
async function cleanOldPosts(days, softDelete) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const where = {
    createdAt: { [Op.lt]: cutoffDate },
    isDeleted: false,
  };
  
  let result;
  
  if (softDelete) {
    // Soft delete (mark as deleted)
    result = await Post.update(
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
      {
        where,
        limit: 1000, // Process in batches
      }
    );
  } else {
    // Hard delete (remove from database)
    // First, get posts to delete their files
    const posts = await Post.findAll({
      where,
      attributes: ['id', 'mediaUrls'],
      limit: 1000,
    });
    
    // Delete associated files
    for (const post of posts) {
      if (post.mediaUrls && Array.isArray(post.mediaUrls)) {
        for (const mediaUrl of post.mediaUrls) {
          try {
            await fileService.deleteFile(mediaUrl);
          } catch (error) {
            logger.warn('Failed to delete post file', {
              postId: post.id,
              mediaUrl,
              error: error.message,
            });
          }
        }
      }
    }
    
    // Delete from database
    result = await Post.destroy({
      where,
      limit: 1000,
    });
  }
  
  return {
    affectedRows: result,
    cutoffDate,
    method: softDelete ? 'soft_delete' : 'hard_delete',
  };
}

/**
 * Clean inactive users
 */
async function cleanInactiveUsers(days, deleteData) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const where = {
    lastLogin: { [Op.lt]: cutoffDate },
    isActive: true,
    role: 'user', // Don't clean admins/moderators
  };
  
  let result;
  
  if (deleteData) {
    // Get users to delete
    const users = await User.findAll({
      where,
      attributes: ['id'],
      limit: 100,
    });
    
    const userIds = users.map(user => user.id);
    
    // Delete user data (posts, comments, etc.)
    // This would need to be implemented based on your data model
    
    // Delete users
    result = await User.destroy({
      where: { id: { [Op.in]: userIds } },
    });
  } else {
    // Deactivate users
    result = await User.update(
      { isActive: false },
      {
        where,
        limit: 100,
      }
    );
  }
  
  return {
    affectedUsers: result,
    cutoffDate,
    action: deleteData ? 'deleted' : 'deactivated',
  };
}

/**
 * Clean old messages
 */
async function cleanOldMessages(days, archive) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const where = {
    createdAt: { [Op.lt]: cutoffDate },
    isDeleted: false,
  };
  
  let result;
  
  if (archive) {
    // Archive old messages (move to archive table)
    // This would require an archive table implementation
    
    // For now, just mark as archived
    result = await Message.update(
      { isArchived: true, archivedAt: new Date() },
      {
        where,
        limit: 5000,
      }
    );
  } else {
    // Delete old messages
    result = await Message.destroy({
      where,
      limit: 5000,
    });
  }
  
  return {
    affectedMessages: result,
    cutoffDate,
    action: archive ? 'archived' : 'deleted',
  };
}

/**
 * Clean old notifications
 */
async function cleanOldNotifications(days) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const result = await Notification.destroy({
    where: {
      createdAt: { [Op.lt]: cutoffDate },
      isRead: true, // Only delete read notifications
    },
    limit: 10000,
  });
  
  return {
    deletedNotifications: result,
    cutoffDate,
  };
}

/**
 * Clean expired sessions
 */
async function cleanExpiredSessions(days) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  // Clean Redis sessions
  const redis = require('../config/redis');
  const sessionPattern = 'sess:*';
  
  const keys = await redis.keys(sessionPattern);
  let deletedSessions = 0;
  
  for (const key of keys) {
    try {
      const sessionData = await redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.cookie && session.cookie.expires) {
          const expires = new Date(session.cookie.expires);
          if (expires < cutoffDate) {
            await redis.del(key);
            deletedSessions++;
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to check session', { key, error: error.message });
    }
  }
  
  // Clean refresh tokens
  const refreshTokenPattern = 'refresh:*';
  const refreshKeys = await redis.keys(refreshTokenPattern);
  let deletedTokens = 0;
  
  for (const key of refreshKeys) {
    const ttl = await redis.ttl(key);
    if (ttl < 0) { // Expired
      await redis.del(key);
      deletedTokens++;
    }
  }
  
  return {
    deletedSessions,
    deletedTokens,
    cutoffDate,
  };
}

/**
 * Clean orphaned files
 */
async function cleanOrphanedFiles() {
  // This is a complex operation that requires checking database references
  // For Cloudinary, you might need to list all files and check if they're referenced
  
  // Simplified version: Clean files from temp directory that are older than 1 day
  return await cleanTempFiles(1);
}

/**
 * Clean cache
 */
async function cleanCache(pattern, maxAge) {
  const keys = await cacheService.keys(pattern);
  let deletedKeys = 0;
  
  for (const key of keys) {
    const ttl = await cacheService.client.ttl(key);
    if (ttl < 0 || ttl > maxAge) {
      await cacheService.del(key);
      deletedKeys++;
    }
  }
  
  return {
    deletedKeys,
    pattern,
    maxAge,
  };
}

/**
 * Clean logs
 */
async function cleanLogs(days, compress) {
  const fs = require('fs');
  const path = require('path');
  const { promisify } = require('util');
  const { gzip } = require('zlib');
  const gzipAsync = promisify(gzip);
  
  const readdirAsync = promisify(fs.readdir);
  const statAsync = promisify(fs.stat);
  const unlinkAsync = promisify(fs.unlink);
  const renameAsync = promisify(fs.rename);
  const writeFileAsync = promisify(fs.writeFile);
  
  const logDir = path.join(__dirname, '../../logs');
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  let deletedFiles = 0;
  let compressedFiles = 0;
  let totalSize = 0;
  
  if (!fs.existsSync(logDir)) {
    return { message: 'Log directory does not exist' };
  }
  
  const files = await readdirAsync(logDir);
  
  for (const file of files) {
    if (file.endsWith('.log')) {
      const filePath = path.join(logDir, file);
      const stats = await statAsync(filePath);
      
      if (stats.mtime < cutoffDate) {
        if (compress) {
          // Compress old logs
          try {
            const content = fs.readFileSync(filePath);
            const compressed = await gzipAsync(content);
            const compressedPath = filePath + '.gz';
            
            await writeFileAsync(compressedPath, compressed);
            await unlinkAsync(filePath);
            
            compressedFiles++;
            totalSize += stats.size;
          } catch (error) {
            logger.error('Failed to compress log file', {
              file,
              error: error.message,
            });
          }
        } else {
          // Delete old logs
          await unlinkAsync(filePath);
          deletedFiles++;
          totalSize += stats.size;
        }
      }
    }
  }
  
  return {
    deletedFiles,
    compressedFiles,
    totalSize: formatBytes(totalSize),
    cutoffDate,
    action: compress ? 'compressed' : 'deleted',
  };
}

/**
 * Perform full cleanup
 */
async function performFullCleanup(options) {
  const results = {};
  
  // Run all cleanup tasks
  if (options.cleanTempFiles !== false) {
    results.tempFiles = await cleanTempFiles(options.tempFilesDays || 1);
  }
  
  if (options.cleanOldPosts !== false) {
    results.oldPosts = await cleanOldPosts(
      options.postsDays || 90,
      options.softDeletePosts !== false
    );
  }
  
  if (options.cleanOldMessages !== false) {
    results.oldMessages = await cleanOldMessages(
      options.messagesDays || 30,
      options.archiveMessages !== false
    );
  }
  
  if (options.cleanOldNotifications !== false) {
    results.oldNotifications = await cleanOldNotifications(
      options.notificationsDays || 30
    );
  }
  
  if (options.cleanExpiredSessions !== false) {
    results.expiredSessions = await cleanExpiredSessions(
      options.sessionsDays || 7
    );
  }
  
  if (options.cleanCache !== false) {
    results.cache = await cleanCache(options.cachePattern || '*', options.cacheMaxAge || 86400);
  }
  
  if (options.cleanLogs !== false) {
    results.logs = await cleanLogs(options.logsDays || 30, options.compressLogs !== false);
  }
  
  return results;
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Queue event handlers
 */
cleanupQueue.on('completed', (job, result) => {
  logger.info(`Cleanup job ${job.id} completed`, {
    queue: 'cleanup',
    jobId: job.id,
    type: job.name,
    result,
  });
});

cleanupQueue.on('failed', (job, error) => {
  logger.error(`Cleanup job ${job.id} failed`, {
    queue: 'cleanup',
    jobId: job.id,
    type: job.name,
    error: error.message,
    data: job.data,
    stack: error.stack,
  });

  // Retry logic
  if (job.attemptsMade < job.opts.attempts) {
    const delay = Math.min(60000, 10000 * Math.pow(2, job.attemptsMade));
    job.retry(delay);
  }
});

cleanupQueue.on('stalled', (job) => {
  logger.warn(`Cleanup job ${job.id} stalled`, {
    queue: 'cleanup',
    jobId: job.id,
  });
});

cleanupQueue.on('error', (error) => {
  logger.error('Cleanup queue error', {
    queue: 'cleanup',
    error: error.message,
    stack: error.stack,
  });
});

/**
 * Add cleanup job to queue
 */
const addCleanupJob = (type, data, options = {}) => {
  return cleanupQueue.add(type, data, {
    priority: options.priority || -2, // Very low priority by default
    delay: options.delay || 0,
    ...options,
  });
};

/**
 * Schedule recurring cleanup jobs
 */
const scheduleRecurringCleanups = () => {
  // Daily temp file cleanup at 3 AM
  cleanupQueue.add('cleanTempFiles', 
    { days: 1 },
    { repeat: { cron: '0 3 * * *' } }
  );
  
  // Weekly old posts cleanup on Sunday at 4 AM
  cleanupQueue.add('cleanOldPosts',
    { days: 90, softDelete: true },
    { repeat: { cron: '0 4 * * 0' } }
  );
  
  // Monthly inactive users cleanup on 1st at 5 AM
  cleanupQueue.add('cleanInactiveUsers',
    { days: 365, deleteData: false },
    { repeat: { cron: '0 5 1 * *' } }
  );
  
  // Daily old notifications cleanup at 2 AM
  cleanupQueue.add('cleanOldNotifications',
    { days: 30 },
    { repeat: { cron: '0 2 * * *' } }
  );
  
  // Hourly expired sessions cleanup
  cleanupQueue.add('cleanExpiredSessions',
    { days: 7 },
    { repeat: { cron: '0 * * * *' } }
  );
  
  // Daily cache cleanup at 1 AM
  cleanupQueue.add('cleanCache',
    { pattern: '*', maxAge: 86400 },
    { repeat: { cron: '0 1 * * *' } }
  );
  
  // Weekly full cleanup on Saturday at 6 AM
  cleanupQueue.add('fullCleanup',
    { options: { cleanTempFiles: true, cleanLogs: true, compressLogs: true } },
    { repeat: { cron: '0 6 * * 6' } }
  );
  
  logger.info('Scheduled recurring cleanup jobs');
};

/**
 * Get cleanup job status
 */
const getJobStatus = async (jobId) => {
  try {
    const job = await cleanupQueue.getJob(jobId);
    
    if (!job) {
      return { exists: false };
    }

    const state = await job.getState();
    const progress = job._progress;
    const result = await job.finished().catch(() => null);

    return {
      exists: true,
      id: job.id,
      name: job.name,
      data: job.data,
      state,
      progress,
      result,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  } catch (error) {
    logger.error('Failed to get cleanup job status', {
      jobId,
      error: error.message,
    });
    throw error;
  }
};

module.exports = {
  cleanupQueue,
  addCleanupJob,
  scheduleRecurringCleanups,
  getJobStatus,
  cleanTempFiles,
  cleanOldPosts,
  cleanOldMessages,
  cleanOldNotifications,
  cleanExpiredSessions,
  cleanCache,
  cleanLogs,
  performFullCleanup,
};