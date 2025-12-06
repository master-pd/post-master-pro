const { Op } = require('sequelize');
const Notification = require('../models/Notification');
const User = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');
const { emitToUser } = require('../config/socket');
const { queues } = require('../config/bull');
const ApiError = require('../utils/ApiError');

class NotificationService {
  constructor() {
    // Initialize push service if configured
    this.pushService = this.initPushService();
  }

  initPushService() {
    // Initialize Firebase, OneSignal, etc.
    // This is a placeholder implementation
    return {
      sendPush: async (notification) => {
        logger.debug('Push notification would be sent:', notification);
        return true;
      },
    };
  }

  // Create notification
  async createNotification(data) {
    try {
      const notification = await Notification.create(data);
      
      // Send real-time notification via Socket.io
      if (config.ENABLE_SOCKETS) {
        emitToUser(data.userId, 'notification:new', notification.toJSON());
      }
      
      // Queue push notification if user has push enabled
      if (data.priority === 'high' || data.priority === 'urgent') {
        await queues.notification.add('push', { notification });
      }
      
      logger.debug(`Notification created: ${notification.id} for user ${data.userId}`);
      return notification;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw new ApiError(500, 'Failed to create notification');
    }
  }

  // Create like notification
  async createLikeNotification(data) {
    const { postId, userId, likedBy } = data;
    
    // Get user who liked the post
    const user = await User.findByPk(likedBy);
    if (!user) return;
    
    // Check notification preferences
    const targetUser = await User.findByPk(userId);
    if (!targetUser?.notificationSettings?.likes) return;
    
    return this.createNotification({
      userId,
      fromUserId: likedBy,
      type: 'like_post',
      title: 'New Like',
      body: `${user.username} liked your post`,
      data: {
        postId,
        likedBy,
      },
      priority: 'medium',
    });
  }

  // Create comment notification
  async createCommentNotification(data) {
    const { postId, userId, commentId, commentedBy } = data;
    
    const user = await User.findByPk(commentedBy);
    if (!user) return;
    
    const targetUser = await User.findByPk(userId);
    if (!targetUser?.notificationSettings?.comments) return;
    
    return this.createNotification({
      userId,
      fromUserId: commentedBy,
      type: 'comment',
      title: 'New Comment',
      body: `${user.username} commented on your post`,
      data: {
        postId,
        commentId,
        commentedBy,
      },
      priority: 'medium',
    });
  }

  // Create follow notification
  async createFollowNotification(data) {
    const { userId, followerId } = data;
    
    const user = await User.findByPk(followerId);
    if (!user) return;
    
    const targetUser = await User.findByPk(userId);
    if (!targetUser?.notificationSettings?.follows) return;
    
    return this.createNotification({
      userId,
      fromUserId: followerId,
      type: 'follow',
      title: 'New Follower',
      body: `${user.username} started following you`,
      data: {
        followerId,
      },
      priority: 'medium',
    });
  }

  // Create mention notification
  async createMentionNotification(data) {
    const { postId, userId, mentionedBy, commentId } = data;
    
    const user = await User.findByPk(mentionedBy);
    if (!user) return;
    
    const targetUser = await User.findByPk(userId);
    if (!targetUser?.notificationSettings?.mentions) return;
    
    return this.createNotification({
      userId,
      fromUserId: mentionedBy,
      type: 'mention',
      title: 'You were mentioned',
      body: `${user.username} mentioned you in a ${commentId ? 'comment' : 'post'}`,
      data: {
        postId,
        commentId,
        mentionedBy,
      },
      priority: 'high',
    });
  }

  // Create share notification
  async createShareNotification(data) {
    const { postId, userId, sharedBy } = data;
    
    const user = await User.findByPk(sharedBy);
    if (!user) return;
    
    const targetUser = await User.findByPk(userId);
    if (!targetUser?.notificationSettings?.shares) return;
    
    return this.createNotification({
      userId,
      fromUserId: sharedBy,
      type: 'share',
      title: 'Post Shared',
      body: `${user.username} shared your post`,
      data: {
        postId,
        sharedBy,
      },
      priority: 'medium',
    });
  }

  // Create message notification
  async createMessageNotification(data) {
    const { conversationId, userId, messageId, sentBy } = data;
    
    const user = await User.findByPk(sentBy);
    if (!user) return;
    
    const targetUser = await User.findByPk(userId);
    if (!targetUser?.notificationSettings?.messages) return;
    
    return this.createNotification({
      userId,
      fromUserId: sentBy,
      type: 'message',
      title: 'New Message',
      body: `${user.username} sent you a message`,
      data: {
        conversationId,
        messageId,
        sentBy,
      },
      priority: 'high',
    });
  }

  // Create group invite notification
  async createGroupInviteNotification(data) {
    const { groupId, userId, invitedBy } = data;
    
    const user = await User.findByPk(invitedBy);
    if (!user) return;
    
    const targetUser = await User.findByPk(userId);
    if (!targetUser?.notificationSettings?.group_invites) return;
    
    return this.createNotification({
      userId,
      fromUserId: invitedBy,
      type: 'group_invite',
      title: 'Group Invitation',
      body: `${user.username} invited you to join a group`,
      data: {
        groupId,
        invitedBy,
      },
      priority: 'medium',
    });
  }

  // Create system notification
  async createSystemNotification(userId, title, body, data = {}) {
    return this.createNotification({
      userId,
      type: 'system',
      title,
      body,
      data,
      priority: data.priority || 'medium',
    });
  }

  // Create bulk notifications
  async createBulkNotifications(userIds, data) {
    const notifications = userIds.map(userId => ({
      ...data,
      userId,
    }));
    
    try {
      const created = await Notification.bulkCreate(notifications);
      
      // Send real-time notifications
      if (config.ENABLE_SOCKETS) {
        userIds.forEach(userId => {
          emitToUser(userId, 'notifications:new_bulk', {
            count: notifications.length,
            type: data.type,
          });
        });
      }
      
      logger.info(`Created ${created.length} bulk notifications`);
      return created;
    } catch (error) {
      logger.error('Failed to create bulk notifications:', error);
      throw new ApiError(500, 'Failed to create notifications');
    }
  }

  // Get user notifications
  async getUserNotifications(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      type,
      fromDate,
      toDate,
    } = options;
    
    const offset = (page - 1) * limit;
    
    const where = { userId };
    
    if (unreadOnly) {
      where.isRead = false;
    }
    
    if (type) {
      where.type = type;
    }
    
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
      if (toDate) where.createdAt[Op.lte] = new Date(toDate);
    }
    
    const { count, rows: notifications } = await Notification.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'fromUser',
        attributes: ['id', 'username', 'profilePicture'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    return {
      notifications: notifications.map(n => n.toJSON()),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    };
  }

  // Get unread notification count
  async getUnreadCount(userId) {
    return await Notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      where: {
        id: notificationId,
        userId, // Ensure user owns the notification
      },
    });
    
    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }
    
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
      
      // Emit real-time update
      emitToUser(userId, 'notification:read', { notificationId });
    }
    
    return notification;
  }

  // Mark all notifications as read
  async markAllAsRead(userId) {
    const [updatedCount] = await Notification.update(
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        where: {
          userId,
          isRead: false,
        },
      }
    );
    
    // Emit real-time update
    emitToUser(userId, 'notifications:all_read', { count: updatedCount });
    
    return updatedCount;
  }

  // Mark notification as seen
  async markAsSeen(notificationId, userId) {
    const notification = await Notification.findOne({
      where: {
        id: notificationId,
        userId,
      },
    });
    
    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }
    
    if (!notification.isSeen) {
      notification.isSeen = true;
      notification.seenAt = new Date();
      await notification.save();
      
      emitToUser(userId, 'notification:seen', { notificationId });
    }
    
    return notification;
  }

  // Delete notification
  async deleteNotification(notificationId, userId) {
    const notification = await Notification.findOne({
      where: {
        id: notificationId,
        userId,
      },
    });
    
    if (!notification) {
      throw new ApiError(404, 'Notification not found');
    }
    
    await notification.destroy();
    
    emitToUser(userId, 'notification:deleted', { notificationId });
    
    return true;
  }

  // Clear all notifications
  async clearAllNotifications(userId) {
    const deletedCount = await Notification.destroy({
      where: { userId },
    });
    
    emitToUser(userId, 'notifications:cleared', { count: deletedCount });
    
    return deletedCount;
  }

  // Cleanup old notifications
  async cleanupOldNotifications(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const deletedCount = await Notification.destroy({
      where: {
        createdAt: { [Op.lt]: cutoffDate },
        isRead: true,
        priority: { [Op.notIn]: ['high', 'urgent'] },
      },
    });
    
    logger.info(`Cleaned up ${deletedCount} old notifications`);
    return deletedCount;
  }

  // Get notification statistics
  async getNotificationStats(userId, timeRange = '7d') {
    const { Op } = require('sequelize');
    
    let startDate = new Date();
    switch (timeRange) {
      case '1d':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }
    
    const stats = await Notification.findAll({
      where: {
        userId,
        createdAt: { [Op.gte]: startDate },
      },
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN "isRead" = true THEN 1 ELSE 0 END')), 'readCount'],
      ],
      group: ['type'],
      raw: true,
    });
    
    const total = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
    const read = stats.reduce((sum, stat) => sum + parseInt(stat.readCount || 0), 0);
    const unread = total - read;
    
    return {
      total,
      read,
      unread,
      byType: stats.reduce((acc, stat) => {
        acc[stat.type] = {
          total: parseInt(stat.count),
          read: parseInt(stat.readCount || 0),
          unread: parseInt(stat.count) - parseInt(stat.readCount || 0),
        };
        return acc;
      }, {}),
      readRate: total > 0 ? (read / total) * 100 : 0,
    };
  }

  // Update notification settings
  async updateNotificationSettings(userId, settings) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    user.notificationSettings = {
      ...user.notificationSettings,
      ...settings,
    };
    
    await user.save();
    
    return user.notificationSettings;
  }

  // Get notification settings
  async getNotificationSettings(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['notificationSettings'],
    });
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    return user.notificationSettings || {};
  }

  // Send test notification
  async sendTestNotification(userId) {
    return this.createSystemNotification(
      userId,
      'Test Notification',
      'This is a test notification to verify your notification settings are working correctly.',
      {
        test: true,
        timestamp: new Date().toISOString(),
      }
    );
  }

  // Handle notification click
  async handleNotificationClick(notificationId, userId) {
    const notification = await this.markAsRead(notificationId, userId);
    
    // Track click analytics
    logger.info(`Notification clicked: ${notificationId} by user ${userId}`);
    
    // Return notification data for redirection
    return notification;
  }

  // Get notification delivery stats
  async getDeliveryStats() {
    // This would integrate with push service providers
    // For now, return placeholder stats
    return {
      push: {
        sent: 0,
        delivered: 0,
        opened: 0,
        deliveryRate: 0,
        openRate: 0,
      },
      email: {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
      },
      inApp: {
        sent: 0,
        seen: 0,
        clicked: 0,
      },
    };
  }
}

module.exports = new NotificationService();