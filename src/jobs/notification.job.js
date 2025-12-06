const { addNotificationJob } = require('../workers/notification.worker');
const logger = require('../utils/logger');
const constants = require('../utils/constants');

/**
 * Notification job utilities
 */
class NotificationJobs {
  /**
   * Send like notification
   */
  static async sendLikeNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.LIKE,
        data,
        options: {
          sendPush: true,
          priority: 'high',
        },
      }, {
        priority: 1, // High priority
        attempts: 3,
        backoff: 5000,
      });

      logger.notification('like_notification_job_added', {
        userId,
        postId: data.postId,
        likerId: data.userId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add like notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send comment notification
   */
  static async sendCommentNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.COMMENT,
        data,
        options: {
          sendPush: true,
          priority: 'high',
        },
      }, {
        priority: 1,
        attempts: 3,
        backoff: 5000,
      });

      logger.notification('comment_notification_job_added', {
        userId,
        postId: data.postId,
        commenterId: data.userId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add comment notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send follow notification
   */
  static async sendFollowNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.FOLLOW,
        data,
        options: {
          sendPush: true,
          priority: 'medium',
        },
      }, {
        priority: 0,
        attempts: 3,
      });

      logger.notification('follow_notification_job_added', {
        userId,
        followerId: data.userId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add follow notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send mention notification
   */
  static async sendMentionNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.MENTION,
        data,
        options: {
          sendPush: true,
          priority: 'high',
        },
      }, {
        priority: 1,
        attempts: 3,
        backoff: 5000,
      });

      logger.notification('mention_notification_job_added', {
        userId,
        postId: data.postId,
        mentionerId: data.userId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add mention notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send message notification
   */
  static async sendMessageNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.MESSAGE,
        data,
        options: {
          sendPush: true,
          priority: 'high',
          sound: 'message',
        },
      }, {
        priority: 2, // Very high priority for messages
        attempts: 5,
        backoff: 3000,
      });

      logger.notification('message_notification_job_added', {
        userId,
        senderId: data.senderId,
        conversationId: data.conversationId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add message notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send event notification
   */
  static async sendEventNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.EVENT,
        data,
        options: {
          sendPush: true,
          priority: 'medium',
        },
      }, {
        priority: 0,
        attempts: 3,
      });

      logger.notification('event_notification_job_added', {
        userId,
        eventId: data.eventId,
        notificationType: data.notificationType,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add event notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send group notification
   */
  static async sendGroupNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.GROUP,
        data,
        options: {
          sendPush: true,
          priority: 'medium',
        },
      }, {
        priority: 0,
        attempts: 3,
      });

      logger.notification('group_notification_job_added', {
        userId,
        groupId: data.groupId,
        notificationType: data.notificationType,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add group notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send friend request notification
   */
  static async sendFriendRequestNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.FRIEND_REQUEST,
        data,
        options: {
          sendPush: true,
          priority: 'high',
        },
      }, {
        priority: 1,
        attempts: 3,
        backoff: 5000,
      });

      logger.notification('friend_request_notification_job_added', {
        userId,
        requesterId: data.userId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add friend request notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send invitation notification
   */
  static async sendInvitationNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.INVITATION,
        data,
        options: {
          sendPush: true,
          priority: 'medium',
        },
      }, {
        priority: 0,
        attempts: 3,
      });

      logger.notification('invitation_notification_job_added', {
        userId,
        inviterId: data.userId,
        targetType: data.targetType,
        targetId: data.targetId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add invitation notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send system notification
   */
  static async sendSystemNotification(userId, data) {
    try {
      const job = await addNotificationJob('sendNotification', {
        userId,
        type: constants.NOTIFICATION_TYPES.SYSTEM,
        data,
        options: {
          sendPush: false, // System notifications usually don't need push
          priority: 'low',
        },
      }, {
        priority: -1,
        attempts: 2,
      });

      logger.notification('system_notification_job_added', {
        userId,
        message: data.message,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add system notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  static async sendBulkNotifications(userIds, type, data, options = {}) {
    try {
      const job = await addNotificationJob('sendBulkNotifications', {
        userIds,
        type,
        data,
        options,
      }, {
        priority: -1, // Low priority for bulk
        attempts: 3,
        backoff: 10000,
        timeout: 300000, // 5 minutes timeout
      });

      logger.notification('bulk_notification_job_added', {
        userCount: userIds.length,
        type,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add bulk notification job', {
        userCount: userIds.length,
        type,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send push notification
   */
  static async sendPushNotification(userId, notification) {
    try {
      const job = await addNotificationJob('sendPushNotification', {
        userId,
        notification,
      }, {
        priority: 1,
        attempts: 3,
        backoff: 5000,
      });

      logger.notification('push_notification_job_added', {
        userId,
        notificationId: notification.id,
        type: notification.type,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add push notification job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send scheduled notification
   */
  static async sendScheduledNotification(userId, type, data, sendAt, options = {}) {
    try {
      const delay = new Date(sendAt) - new Date();
      
      if (delay < 0) {
        throw new Error('Scheduled time is in the past');
      }

      const job = await addNotificationJob('sendNotification', {
        userId,
        type,
        data,
        options,
      }, {
        priority: 0,
        delay,
        attempts: 3,
      });

      logger.notification('scheduled_notification_job_added', {
        userId,
        type,
        sendAt,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add scheduled notification job', {
        userId,
        type,
        sendAt,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllNotificationsAsRead(userId) {
    try {
      const job = await addNotificationJob('markAllAsRead', {
        userId,
      }, {
        priority: 0,
        attempts: 2,
      });

      logger.notification('mark_all_read_job_added', {
        userId,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add mark all read job', {
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clean old notifications
   */
  static async cleanOldNotifications(days = 30) {
    try {
      const job = await addNotificationJob('cleanOldNotifications', {
        days,
      }, {
        priority: -2, // Very low priority
        attempts: 2,
        backoff: 30000,
      });

      logger.notification('clean_old_notifications_job_added', {
        days,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add clean old notifications job', {
        days,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get notification job status
   */
  static async getJobStatus(jobId) {
    try {
      const { getJob } = require('../workers/notification.worker');
      const job = await getJob(jobId);
      
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
      logger.error('Failed to get notification job status', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cancel scheduled notification
   */
  static async cancelScheduledNotification(jobId) {
    try {
      const { removeJob } = require('../workers/notification.worker');
      const success = await removeJob(jobId);
      
      if (success) {
        logger.info('Scheduled notification cancelled', { jobId });
      } else {
        logger.warn('Notification job not found or already processed', { jobId });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to cancel scheduled notification', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Retry failed notification job
   */
  static async retryFailedNotification(jobId) {
    try {
      const { retryJob } = require('../workers/notification.worker');
      const success = await retryJob(jobId);
      
      if (success) {
        logger.info('Failed notification job retried', { jobId });
      } else {
        logger.warn('Failed notification job not found', { jobId });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to retry notification job', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get notification queue statistics
   */
  static async getQueueStats() {
    try {
      const { getQueueStats } = require('../workers/notification.worker');
      const stats = await getQueueStats();
      return stats;
    } catch (error) {
      logger.error('Failed to get notification queue stats', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clean old notification jobs
   */
  static async cleanOldJobs() {
    try {
      const { cleanOldJobs } = require('../workers/notification.worker');
      await cleanOldJobs();
      logger.info('Old notification jobs cleaned');
    } catch (error) {
      logger.error('Failed to clean old notification jobs', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Pause notification queue
   */
  static async pauseQueue() {
    try {
      const { pauseQueue } = require('../workers/notification.worker');
      await pauseQueue();
      logger.info('Notification queue paused');
    } catch (error) {
      logger.error('Failed to pause notification queue', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Resume notification queue
   */
  static async resumeQueue() {
    try {
      const { resumeQueue } = require('../workers/notification.worker');
      await resumeQueue();
      logger.info('Notification queue resumed');
    } catch (error) {
      logger.error('Failed to resume notification queue', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send notification with retry logic
   */
  static async sendNotificationWithRetry(userId, type, data, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const job = await addNotificationJob('sendNotification', {
          userId,
          type,
          data,
          options,
        }, {
          priority: options.priority || 0,
          attempts: 1, // Single attempt since we're handling retries manually
        });
        
        return job;
      } catch (error) {
        lastError = error;
        logger.warn(`Notification send attempt ${i + 1} failed`, {
          userId,
          type,
          error: error.message,
        });
        
        if (i < maxRetries - 1) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => 
            setTimeout(resolve, 1000 * Math.pow(2, i))
          );
        }
      }
    }
    
    throw lastError;
  }
}

module.exports = NotificationJobs;