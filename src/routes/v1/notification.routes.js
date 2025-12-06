const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/notification.controller');
const auth = require('../../middleware/auth');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

// All notification routes require authentication
router.use(auth);

// Get notifications
router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);

// Mark as read/seen
router.put('/read-all', notificationController.markAllAsRead);
router.put('/:notificationId/read', notificationController.markAsRead);
router.put('/:notificationId/seen', notificationController.markAsSeen);

// Delete notifications
router.delete('/:notificationId', notificationController.deleteNotification);
router.delete('/', notificationController.clearAllNotifications);

// Notification settings
router.get('/settings', notificationController.getSettings);
router.put('/settings', notificationController.updateSettings);

module.exports = router;