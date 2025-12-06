const { sequelize } = require('../config/database');
const redis = require('../config/redis');

// Set test environment
process.env.NODE_ENV = 'test';

// Global test setup
beforeAll(async () => {
  // Create test database connection
  await sequelize.authenticate();
  
  // Clear Redis
  await redis.flushall();
});

// Global test teardown
afterAll(async () => {
  // Close database connection
  await sequelize.close();
  
  // Close Redis connection
  await redis.quit();
});

// Clear database between tests
beforeEach(async () => {
  // Clear all tables
  const tables = Object.keys(sequelize.models);
  for (const table of tables) {
    await sequelize.models[table].destroy({ where: {}, force: true });
  }
  
  // Clear Redis
  await redis.flushall();
});

// Global test utilities
global.createTestUser = async (userData = {}) => {
  const User = require('../models/User');
  return await User.create({
    username: 'testuser',
    email: 'test@example.com',
    password: 'Password123!',
    fullName: 'Test User',
    ...userData,
  });
};

global.createTestPost = async (userId, postData = {}) => {
  const Post = require('../models/Post');
  return await Post.create({
    userId,
    content: 'Test post content',
    ...postData,
  });
};

global.getAuthToken = (userId) => {
  const jwt = require('jsonwebtoken');
  const config = require('../config');
  
  return jwt.sign(
    { userId },
    config.JWT_SECRET,
    { expiresIn: '1h' }
  );
};