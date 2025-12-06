const { Op } = require('sequelize');
const Notification = require('../models/Notification');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');
const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');

class NotificationController {
  // Get notifications
  getNotifications = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      type,
      fromDate,
      toDate,
    } = req.query;
    
    const result = await notificationService.getUserNotifications(
      userId,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        unreadOnly: unreadOnly === 'true',
        type,
        fromDate,
        toDate,
      }
    );
    
    new ApiResponse(res, 200, 'Notifications retrieved successfully', {
      notifications: result.notifications,
      pagination: result.pagination,
    });
  });

  // Get unread count
  getUnreadCount = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const unreadCount = await notificationService.getUnreadCount(userId);
    
    new ApiResponse(res, 200, 'Unread count retrieved successfully', {
      unreadCount,
    });
  });

  // Mark notification as read
  markAsRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const userId = req.user.id;
    
    const notification = await notificationService.markAsRead(notificationId, userId);
    
    new ApiResponse(res, 200, 'Notification marked as read', {
      notification,
    });
  });

  // Mark all notifications as read
  markAllAsRead = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const updatedCount = await notificationService.markAllAsRead(userId);
    
    new ApiResponse(res, 200, 'All notifications marked as read', {
      updatedCount,
    });
  });

  // Mark notification as seen
  markAsSeen = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const userId = req.user.id;
    
    const notification = await notificationService.markAsSeen(notificationId, userId);
    
    new ApiResponse(res, 200, 'Notification marked as seen', {
      notification,
    });
  });

  // Delete notification
  deleteNotification = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const userId = req.user.id;
    
    await notificationService.deleteNotification(notificationId, userId);
    
    new ApiResponse(res, 200, 'Notification deleted successfully');
  });

  // Clear all notifications
  clearAllNotifications = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const deletedCount = await notificationService.clearAllNotifications(userId);
    
    new ApiResponse(res, 200, 'All notifications cleared', {
      deletedCount,
    });
  });

  // Get notification settings
  getSettings = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const settings = await notificationService.getNotificationSettings(userId);
    
    new ApiResponse(res, 200, 'Notification settings retrieved successfully', {
      settings,
    });
  });

  // Update notification settings
  updateSettings = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const settings = req.body;
    
    const updatedSettings = await notificationService.updateNotificationSettings(
      userId,
      settings
    );
    
    new ApiResponse(res, 200, 'Notification settings updated successfully', {
      settings: updatedSettings,
    });
  });

  // Get notification statistics
  getStats = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { timeRange = '7d' } = req.query;
    
    const stats = await notificationService.getNotificationStats(userId, timeRange);
    
    new ApiResponse(res, 200, 'Notification statistics retrieved successfully', {
      stats,
    });
  });

  // Handle notification click
  handleClick = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const userId = req.user.id;
    
    const notification = await notificationService.handleNotificationClick(
      notificationId,
      userId
    );
    
    // Redirect based on notification type
    let redirectUrl = null;
    
    switch (notification.type) {
      case 'like_post':
        redirectUrl = `/post/${notification.data.postId}`;
        break;
      case 'comment':
      case 'reply':
        redirectUrl = `/post/${notification.data.postId}#comment-${notification.data.commentId}`;
        break;
      case 'follow':
        redirectUrl = `/profile/${notification.data.followerId}`;
        break;
      case 'mention':
        redirectUrl = notification.data.commentId 
          ? `/post/${notification.data.postId}#comment-${notification.data.commentId}`
          : `/post/${notification.data.postId}`;
        break;
      case 'message':
        redirectUrl = `/chat/${notification.data.conversationId}`;
        break;
      case 'group_invite':
        redirectUrl = `/group/${notification.data.groupId}`;
        break;
      default:
        redirectUrl = '/notifications';
    }
    
    new ApiResponse(res, 200, 'Notification click handled', {
      notification,
      redirectUrl,
    });
  });

  // Send test notification
  sendTest = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const notification = await notificationService.sendTestNotification(userId);
    
    new ApiResponse(res, 200, 'Test notification sent', {
      notification,
    });
  });
}

module.exports = new NotificationController();