const express = require('express');
const router = express.Router();
const config = require('../config');

// Import route modules
const authRoutes = require('./v1/auth.routes');
const userRoutes = require('./v1/user.routes');
const postRoutes = require('./v1/post.routes');
const feedRoutes = require('./v1/feed.routes');
const chatRoutes = require('./v1/chat.routes');
const storyRoutes = require('./v1/story.routes');
const notificationRoutes = require('./v1/notification.routes');
const searchRoutes = require('./v1/search.routes');
const uploadRoutes = require('./v1/upload.routes');
const adminRoutes = require('./v1/admin.routes');
const groupRoutes = require('./v1/group.routes');
const eventRoutes = require('./v1/event.routes');

// API documentation route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Post Master API',
    version: config.API_VERSION,
    documentation: `${config.BASE_URL}/api-docs`,
    endpoints: {
      auth: `${config.BASE_URL}/api/${config.API_VERSION}/auth`,
      users: `${config.BASE_URL}/api/${config.API_VERSION}/users`,
      posts: `${config.BASE_URL}/api/${config.API_VERSION}/posts`,
      feed: `${config.BASE_URL}/api/${config.API_VERSION}/feed`,
      chat: `${config.BASE_URL}/api/${config.API_VERSION}/chat`,
      stories: `${config.BASE_URL}/api/${config.API_VERSION}/stories`,
      notifications: `${config.BASE_URL}/api/${config.API_VERSION}/notifications`,
      search: `${config.BASE_URL}/api/${config.API_VERSION}/search`,
      upload: `${config.BASE_URL}/api/${config.API_VERSION}/upload`,
      admin: `${config.BASE_URL}/api/${config.API_VERSION}/admin`,
      groups: `${config.BASE_URL}/api/${config.API_VERSION}/groups`,
      events: `${config.BASE_URL}/api/${config.API_VERSION}/events`,
    },
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: config.NODE_ENV,
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/feed', feedRoutes);
router.use('/chat', chatRoutes);
router.use('/stories', storyRoutes);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);
router.use('/upload', uploadRoutes);
router.use('/admin', adminRoutes);
router.use('/groups', groupRoutes);
router.use('/events', eventRoutes);

// 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: `API endpoint ${req.originalUrl} not found`,
    },
  });
});

module.exports = router;