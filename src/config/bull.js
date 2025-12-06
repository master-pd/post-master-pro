const Queue = require('bull');
const config = require('./index');
const logger = require('../utils/logger');
const redis = require('./redis');

// Initialize Redis connection for Bull
const queueOptions = {
  redis: config.QUEUE_REDIS_URL || config.REDIS_URL,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 1000, // Keep last 1000 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
};

// Create queues
const queues = {
  email: new Queue('email', queueOptions),
  notification: new Queue('notification', queueOptions),
  video: new Queue('video-processing', queueOptions),
  image: new Queue('image-processing', queueOptions),
  analytics: new Queue('analytics', queueOptions),
  cleanup: new Queue('cleanup', queueOptions),
};

// Processors
const initQueueProcessors = () => {
  // Email queue processor
  queues.email.process(config.QUEUE_CONCURRENCY || 5, async (job) => {
    const { emailService } = require('../services/email.service');
    const { type, data } = job.data;
    
    try {
      switch (type) {
        case 'welcome':
          await emailService.sendWelcomeEmail(data.user);
          break;
        case 'verification':
          await emailService.sendVerificationEmail(data.user, data.token);
          break;
        case 'password_reset':
          await emailService.sendPasswordResetEmail(data.user, data.token);
          break;
        case 'notification':
          await emailService.sendNotificationEmail(data.user, data.notification);
          break;
        default:
          logger.warn(`Unknown email type: ${type}`);
      }
      
      logger.info(`Email job ${job.id} processed successfully`);
    } catch (error) {
      logger.error(`Email job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Notification queue processor
  queues.notification.process(config.QUEUE_CONCURRENCY || 10, async (job) => {
    const { notificationService } = require('../services/notification.service');
    const { type, data } = job.data;
    
    try {
      switch (type) {
        case 'push':
          await notificationService.sendPushNotification(data);
          break;
        case 'in_app':
          await notificationService.createInAppNotification(data);
          break;
        default:
          logger.warn(`Unknown notification type: ${type}`);
      }
      
      logger.debug(`Notification job ${job.id} processed successfully`);
    } catch (error) {
      logger.error(`Notification job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Video processing queue processor
  queues.video.process(2, async (job) => { // Lower concurrency for CPU-intensive tasks
    const { videoService } = require('../services/video.service');
    const { videoUrl, options } = job.data;
    
    try {
      const result = await videoService.processVideo(videoUrl, options);
      logger.info(`Video processing job ${job.id} completed`);
      return result;
    } catch (error) {
      logger.error(`Video processing job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Image processing queue processor
  queues.image.process(config.QUEUE_CONCURRENCY || 5, async (job) => {
    const { imageService } = require('../services/image.service');
    const { imageUrl, options } = job.data;
    
    try {
      const result = await imageService.processImage(imageUrl, options);
      logger.debug(`Image processing job ${job.id} completed`);
      return result;
    } catch (error) {
      logger.error(`Image processing job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Analytics queue processor
  queues.analytics.process(1, async (job) => { // Sequential processing for analytics
    const { analyticsService } = require('../services/analytics.service');
    const { type, data } = job.data;
    
    try {
      switch (type) {
        case 'daily_summary':
          await analyticsService.generateDailySummary();
          break;
        case 'user_analytics':
          await analyticsService.updateUserAnalytics(data.userId);
          break;
        case 'post_analytics':
          await analyticsService.updatePostAnalytics(data.postId);
          break;
        default:
          logger.warn(`Unknown analytics type: ${type}`);
      }
      
      logger.info(`Analytics job ${job.id} processed successfully`);
    } catch (error) {
      logger.error(`Analytics job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Cleanup queue processor
  queues.cleanup.process(1, async (job) => {
    const { cleanupService } = require('../services/cleanup.service');
    const { type } = job.data;
    
    try {
      switch (type) {
        case 'expired_stories':
          await cleanupService.cleanupExpiredStories();
          break;
        case 'old_notifications':
          await cleanupService.cleanupOldNotifications();
          break;
        case 'temporary_files':
          await cleanupService.cleanupTemporaryFiles();
          break;
        case 'cache':
          await cleanupService.cleanupOldCache();
          break;
        default:
          logger.warn(`Unknown cleanup type: ${type}`);
      }
      
      logger.info(`Cleanup job ${job.id} processed successfully`);
    } catch (error) {
      logger.error(`Cleanup job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Error handling for all queues
  Object.values(queues).forEach(queue => {
    queue.on('error', (error) => {
      logger.error(`Queue ${queue.name} error:`, error);
    });

    queue.on('failed', (job, error) => {
      logger.error(`Job ${job.id} failed in queue ${queue.name}:`, error);
    });

    queue.on('completed', (job, result) => {
      logger.debug(`Job ${job.id} completed in queue ${queue.name}`);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job.id} stalled in queue ${queue.name}`);
    });
  });
};

// Initialize queues
const initQueue = async () => {
  initQueueProcessors();
  
  // Start scheduled jobs
  await setupScheduledJobs();
  
  logger.info('Bull queues initialized successfully');
  return queues;
};

// Setup scheduled/cron jobs
const setupScheduledJobs = async () => {
  // Daily analytics summary at 2 AM
  await queues.analytics.add('daily_summary', {}, {
    repeat: { cron: '0 2 * * *' }, // 2 AM daily
    jobId: 'daily_analytics',
  });

  // Cleanup expired stories every hour
  await queues.cleanup.add('expired_stories', {}, {
    repeat: { cron: '0 * * * *' }, // Every hour
    jobId: 'expired_stories_cleanup',
  });

  // Cleanup old notifications daily at 3 AM
  await queues.cleanup.add('old_notifications', {}, {
    repeat: { cron: '0 3 * * *' }, // 3 AM daily
    jobId: 'old_notifications_cleanup',
  });

  // Cleanup cache weekly on Sunday at 4 AM
  await queues.cleanup.add('cache', {}, {
    repeat: { cron: '0 4 * * 0' }, // 4 AM every Sunday
    jobId: 'weekly_cache_cleanup',
  });

  logger.info('Scheduled jobs configured');
};

// Helper to add jobs
const addJob = (queueName, data, options = {}) => {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }
  return queue.add(data, options);
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down queues...');
  
  const closingPromises = Object.values(queues).map(queue => 
    queue.close()
  );
  
  await Promise.all(closingPromises);
  logger.info('Queues shut down gracefully');
};

module.exports = {
  queues,
  initQueue,
  addJob,
  gracefulShutdown,
};