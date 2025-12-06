const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/admin.controller');
const { auth, authorize } = require('../../middleware/auth');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

// All admin routes require authentication and admin role
router.use(auth);
router.use(authorize('admin', 'super_admin'));

// User management
router.get('/users', adminController.getUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/users/:userId', adminController.updateUser);
router.post('/users/:userId/ban', adminController.banUser);
router.post('/users/:userId/unban', adminController.unbanUser);
router.post('/users/:userId/verify', adminController.verifyUser);
router.delete('/users/:userId', adminController.deleteUser);

// Content moderation
router.get('/posts', adminController.getPosts);
router.get('/posts/:postId', adminController.getPostDetails);
router.put('/posts/:postId', adminController.updatePost);
router.post('/posts/:postId/feature', adminController.featurePost);
router.post('/posts/:postId/unfeature', adminController.unfeaturePost);
router.post('/posts/:postId/hide', adminController.hidePost);
router.post('/posts/:postId/unhide', adminController.unhidePost);
router.delete('/posts/:postId', adminController.deletePost);

// Reports management
router.get('/reports', adminController.getReports);
router.get('/reports/:reportId', adminController.getReportDetails);
router.put('/reports/:reportId', adminController.updateReport);
router.post('/reports/:reportId/resolve', adminController.resolveReport);
router.delete('/reports/:reportId', adminController.deleteReport);

// Groups management
router.get('/groups', adminController.getGroups);
router.get('/groups/:groupId', adminController.getGroupDetails);
router.put('/groups/:groupId', adminController.updateGroup);
router.post('/groups/:groupId/verify', adminController.verifyGroup);
router.post('/groups/:groupId/feature', adminController.featureGroup);
router.post('/groups/:groupId/ban', adminController.banGroup);
router.delete('/groups/:groupId', adminController.deleteGroup);

// Analytics
router.get('/analytics', adminController.getAnalytics);
router.get('/analytics/users', adminController.getUserAnalytics);
router.get('/analytics/posts', adminController.getPostAnalytics);
router.get('/analytics/revenue', adminController.getRevenueAnalytics);
router.get('/analytics/platform', adminController.getPlatformAnalytics);

// System logs
router.get('/logs', adminController.getLogs);
router.get('/logs/errors', adminController.getErrorLogs);
router.get('/logs/audit', adminController.getAuditLogs);

// System settings
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Backup and restore
router.post('/backup', adminController.createBackup);
router.get('/backups', adminController.getBackups);
router.post('/restore/:backupId', adminController.restoreBackup);
router.delete('/backup/:backupId', adminController.deleteBackup);

// Email management
router.post('/email/broadcast', adminController.sendBroadcastEmail);
router.get('/email/templates', adminController.getEmailTemplates);
router.post('/email/templates', adminController.createEmailTemplate);
router.put('/email/templates/:templateId', adminController.updateEmailTemplate);

// Announcements
router.post('/announcements', adminController.createAnnouncement);
router.get('/announcements', adminController.getAnnouncements);
router.put('/announcements/:announcementId', adminController.updateAnnouncement);
router.delete('/announcements/:announcementId', adminController.deleteAnnouncement);

module.exports = router;