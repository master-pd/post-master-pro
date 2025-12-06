const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');
const notificationService = require('../services/notification.service');
const webSocketManager = require('../utils/socketManager');
const { Expo } = require('expo-server-sdk');

// Create notification queue
const notificationQueue = new Queue('notification', {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Initialize Expo SDK for push notifications
let expo = null;
if (config.FIREBASE_PROJECT_ID || config.EXPO_ACCESS_TOKEN) {
  expo = new Expo({ accessToken: config.EXPO_ACCESS_TOKEN });
}

/**
 * Notification worker processor
 */
notificationQueue.process('sendNotification', async (job) => {
  const { userId, type, data, options = {} } = job.data;
  
  logger.job('notification', job.id, 'started', {
    userId,
    type,
    data,
  });

  try {
    // Create notification in database
    const notification = await notificationService.createNotification(
      userId,
      type,
      data,
      options
    );

    // Send real-time notification via WebSocket
    await webSocketManager.sendNotification(userId, notification);

    // Send push notification if enabled
    if (options.sendPush !== false && expo) {
      await sendPushNotification(userId, notification);
    }

    logger.job('notification', job.id, 'completed', {
      userId,
      type,
      notificationId: notification.id,
    });

    return { success: true, notification };
  } catch (error) {
    logger.job('notification', job.id, 'failed', {
      userId,
      type,
      error: error.message,
    });

    throw error;
  }
});

notificationQueue.process('sendBulkNotifications', async (job) => {
  const { userIds, type, data, options = {} } = job.data;
  
  logger.job('notification', job.id, 'bulk_started', {
    userCount: userIds.length,
    type,
  });

  try {
    const results = [];
    const chunks = chunkArray(userIds, 100); // Process in chunks of 100

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (userId) => {
        try {
          const notification = await notificationService.createNotification(
            userId,
            type,
            data,
            options
          );

          // Send real-time notification
          await webSocketManager.sendNotification(userId, notification);

          return { userId, success: true, notification };
        } catch (error) {
          return { userId, success: false, error: error.message };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      // Small delay between chunks to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    logger.job('notification', job.id, 'bulk_completed', {
      total: userIds.length,
      success: successCount,
      failed: failureCount,
    });

    return { results, successCount, failureCount };
  } catch (error) {
    logger.job('notification', job.id, 'bulk_failed', {
      error: error.message,
    });

    throw error;
  }
});

notificationQueue.process('sendPushNotification', async (job) => {
  const { userId, notification } = job.data;
  
  logger.job('notification', job.id, 'push_started', {
    userId,
    notificationId: notification.id,
  });

  try {
    await sendPushNotification(userId, notification);
    
    logger.job('notification', job.id, 'push_completed', {
      userId,
      notificationId: notification.id,
    });

    return { success: true };
  } catch (error) {
    logger.job('notification', job.id, 'push_failed', {
      userId,
      notificationId: notification.id,
      error: error.message,
    });

    throw error;
  }
});

notificationQueue.process('cleanOldNotifications', async (job) => {
  const { days = 30 } = job.data;
  
  logger.job('notification', job.id, 'cleanup_started', { days });

  try {
    const result = await notificationService.cleanOldNotifications(days);
    
    logger.job('notification', job.id, 'cleanup_completed', result);
    
    return result;
  } catch (error) {
    logger.job('notification', job.id, 'cleanup_failed', {
      error: error.message,
    });

    throw error;
  }
});

notificationQueue.process('markAllAsRead', async (job) => {
  const { userId } = job.data;
  
  logger.job('notification', job.id, 'mark_read_started', { userId });

  try {
    const result = await notificationService.markAllAsRead(userId);
    
    logger.job('notification', job.id, 'mark_read_completed', {
      userId,
      count: result.count,
    });
    
    return result;
  } catch (error) {
    logger.job('notification', job.id, 'mark_read_failed', {
      userId,
      error: error.message,
    });

    throw error;
  }
});

/**
 * Send push notification using Expo
 */
async function sendPushNotification(userId, notification) {
  try {
    // Get user's push token from database
    const User = require('../models/User');
    const user = await User.findByPk(userId, {
      attributes: ['pushToken'],
    });

    if (!user || !user.pushToken) {
      return null;
    }

    // Check if token is valid
    if (!Expo.isExpoPushToken(user.pushToken)) {
      logger.warn('Invalid Expo push token', { userId, pushToken: user.pushToken });
      return null;
    }

    // Prepare push notification message
    const message = {
      to: user.pushToken,
      sound: 'default',
      title: getNotificationTitle(notification.type, notification.data),
      body: getNotificationBody(notification.type, notification.data),
      data: {
        notificationId: notification.id,
        type: notification.type,
        data: notification.data,
        url: getNotificationUrl(notification.type, notification.data),
      },
      channelId: 'notifications',
      priority: 'high',
    };

    // Send push notification
    const ticket = await expo.sendPushNotificationsAsync([message]);
    
    logger.notification('push_sent', {
      userId,
      notificationId: notification.id,
      ticket,
    });

    return ticket;
  } catch (error) {
    logger.error('Error sending push notification', {
      userId,
      notificationId: notification.id,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get notification title based on type
 */
function getNotificationTitle(type, data) {
  const titles = {
    like: 'New Like',
    comment: 'New Comment',
    follow: 'New Follower',
    mention: 'You were mentioned',
    share: 'Post Shared',
    message: 'New Message',
    event: 'Event Reminder',
    group: 'Group Update',
    friend_request: 'Friend Request',
    invitation: 'Invitation',
    system: 'System Notification',
  };

  return titles[type] || 'New Notification';
}

/**
 * Get notification body based on type
 */
function getNotificationBody(type, data) {
  switch (type) {
    case 'like':
      return `${data.userName} liked your post`;
    case 'comment':
      return `${data.userName} commented on your post`;
    case 'follow':
      return `${data.userName} started following you`;
    case 'mention':
      return `${data.userName} mentioned you in a post`;
    case 'share':
      return `${data.userName} shared your post`;
    case 'message':
      return `${data.senderName}: ${data.message}`;
    case 'event':
      return `Reminder: ${data.eventTitle} starts soon`;
    case 'group':
      return `New activity in ${data.groupName}`;
    case 'friend_request':
      return `${data.userName} sent you a friend request`;
    case 'invitation':
      return `You've been invited to ${data.eventTitle || data.groupName}`;
    default:
      return data.message || 'You have a new notification';
  }
}

/**
 * Get notification URL for deep linking
 */
function getNotificationUrl(type, data) {
  const baseUrl = config.FRONTEND_URL;
  
  switch (type) {
    case 'like':
    case 'comment':
    case 'share':
      return `${baseUrl}/post/${data.postId}`;
    case 'follow':
      return `${baseUrl}/profile/${data.userId}`;
    case 'mention':
      return `${baseUrl}/post/${data.postId}`;
    case 'message':
      return `${baseUrl}/messages/${data.conversationId}`;
    case 'event':
      return `${baseUrl}/events/${data.eventId}`;
    case 'group':
      return `${baseUrl}/groups/${data.groupId}`;
    case 'friend_request':
      return `${baseUrl}/friends/requests`;
    case 'invitation':
      if (data.eventId) return `${baseUrl}/events/${data.eventId}`;
      if (data.groupId) return `${baseUrl}/groups/${data.groupId}`;
      return baseUrl;
    default:
      return baseUrl;
  }
}

/**
 * Chunk array helper
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Queue event handlers
 */
notificationQueue.on('completed', (job, result) => {
  logger.info(`Notification job ${job.id} completed`, {
    queue: 'notification',
    jobId: job.id,
    type: job.data.type,
  });
});

notificationQueue.on('failed', (job, error) => {
  logger.error(`Notification job ${job.id} failed`, {
    queue: 'notification',
    jobId: job.id,
    type: job.data.type,
    error: error.message,
    data: job.data,
    stack: error.stack,
  });

  // Retry logic for important notifications
  if (job.attemptsMade < job.opts.attempts) {
    const delay = Math.min(30000, 3000 * Math.pow(2, job.attemptsMade));
    job.retry(delay);
  }
});

notificationQueue.on('stalled', (job) => {
  logger.warn(`Notification job ${job.id} stalled`, {
    queue: 'notification',
    jobId: job.id,
  });
});

notificationQueue.on('error', (error) => {
  logger.error('Notification queue error', {
    queue: 'notification',
    error: error.message,
    stack: error.stack,
  });
});

/**
 * Add notification job to queue
 */
const addNotificationJob = (type, data, options = {}) => {
  return notificationQueue.add(type, data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    ...options,
  });
};

/**
 * Clean old jobs
 */
const cleanOldJobs = async () => {
  try {
    // Remove completed jobs older than 7 days
    await notificationQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
    
    // Remove failed jobs older than 30 days
    await notificationQueue.clean(30 * 24 * 60 * 60 * 1000, 'failed');
    
    logger.info('Cleaned old notification jobs');
  } catch (error) {
    logger.error('Error cleaning notification jobs', { error: error.message });
  }
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount(),
      notificationQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  } catch (error) {
    logger.error('Error getting notification queue stats', { error: error.message });
    return null;
  }
};

/**
 * Pause queue processing
 */
const pauseQueue = async () => {
  await notificationQueue.pause();
  logger.info('Notification queue paused');
};

/**
 * Resume queue processing
 */
const resumeQueue = async () => {
  await notificationQueue.resume();
  logger.info('Notification queue resumed');
};

/**
 * Empty the queue
 */
const emptyQueue = async () => {
  await notificationQueue.empty();
  logger.info('Notification queue emptied');
};

/**
 * Get job by ID
 */
const getJob = async (jobId) => {
  try {
    const job = await notificationQueue.getJob(jobId);
    return job;
  } catch (error) {
    logger.error('Error getting notification job', { jobId, error: error.message });
    return null;
  }
};

/**
 * Remove job by ID
 */
const removeJob = async (jobId) => {
  try {
    const job = await getJob(jobId);
    if (job) {
      await job.remove();
      logger.info('Notification job removed', { jobId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error removing notification job', { jobId, error: error.message });
    return false;
  }
};

/**
 * Retry failed job
 */
const retryJob = async (jobId) => {
  try {
    const job = await getJob(jobId);
    if (job) {
      await job.retry();
      logger.info('Notification job retried', { jobId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error retrying notification job', { jobId, error: error.message });
    return false;
  }
};

module.exports = {
  notificationQueue,
  addNotificationJob,
  cleanOldJobs,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  emptyQueue,
  getJob,
  removeJob,
  retryJob,
  sendPushNotification,
};