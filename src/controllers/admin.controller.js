const { Op } = require('sequelize');
const User = require('../models/User');
const Post = require('../models/Post');
const Group = require('../models/Group');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const analyticsService = require('../services/analytics.service');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');

class AdminController {
  // Get users with filtering
  getUsers = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      search,
      role,
      status,
      verified,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const where = {};
    
    if (search) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { fullName: { [Op.iLike]: `%${search}%` } },
      ];
    }
    
    if (role) {
      where.role = role;
    }
    
    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    } else if (status === 'banned') {
      where.isBanned = true;
    }
    
    if (verified === 'true') {
      where.isEmailVerified = true;
    } else if (verified === 'false') {
      where.isEmailVerified = false;
    }
    
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
      if (toDate) where.createdAt[Op.lte] = new Date(toDate);
    }
    
    const order = [[sortBy, sortOrder.toUpperCase()]];
    
    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: {
        exclude: ['password', 'refreshToken', 'twoFactorSecret'],
      },
      order,
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Users retrieved successfully', {
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get user details
  getUserDetails = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    const user = await User.findByPk(userId, {
      attributes: {
        exclude: ['password', 'refreshToken', 'twoFactorSecret'],
      },
      include: [
        {
          association: 'posts',
          limit: 10,
          order: [['createdAt', 'DESC']],
        },
        {
          association: 'followers',
          limit: 10,
        },
        {
          association: 'following',
          limit: 10,
        },
      ],
    });
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    // Get user statistics
    const [postsCount, followersCount, followingCount] = await Promise.all([
      Post.count({ where: { userId } }),
      // Add other counts as needed
    ]);
    
    const userData = user.toJSON();
    userData.statistics = {
      postsCount,
      followersCount,
      followingCount,
    };
    
    new ApiResponse(res, 200, 'User details retrieved successfully', {
      user: userData,
    });
  });

  // Update user
  updateUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const updates = req.body;
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    // Prevent modifying certain fields
    const allowedUpdates = [
      'role',
      'isActive',
      'isBanned',
      'isEmailVerified',
      'fullName',
      'bio',
      'location',
      'website',
      'privacySettings',
      'notificationSettings',
    ];
    
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    await user.update(filteredUpdates);
    
    // Log admin action
    logger.info(`Admin ${req.user.id} updated user ${userId}`, {
      adminId: req.user.id,
      userId,
      updates: filteredUpdates,
    });
    
    new ApiResponse(res, 200, 'User updated successfully', {
      user: await this.getSafeUserData(user),
    });
  });

  // Ban user
  banUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { reason, duration } = req.body;
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    if (user.role === 'admin' || user.role === 'super_admin') {
      throw new ApiError(403, 'Cannot ban administrators');
    }
    
    user.isBanned = true;
    user.bannedAt = new Date();
    user.bannedReason = reason;
    user.bannedUntil = duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
    await user.save();
    
    // Notify user
    await emailService.sendCustomEmail(
      user.email,
      'Account Banned',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">Account Banned</h1>
          <p>Hello ${user.username},</p>
          <p>Your account has been banned for violating our community guidelines.</p>
          <div style="background: #fef2f2; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p><strong>Reason:</strong> ${reason}</p>
            <p><strong>Duration:</strong> ${duration ? `${duration} days` : 'Permanent'}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>If you believe this is a mistake, you can appeal this decision by contacting support.</p>
        </div>
      `
    );
    
    // Log action
    logger.warn(`User ${userId} banned by admin ${req.user.id}`, {
      adminId: req.user.id,
      userId,
      reason,
      duration,
    });
    
    new ApiResponse(res, 200, 'User banned successfully');
  });

  // Unban user
  unbanUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    user.isBanned = false;
    user.bannedAt = null;
    user.bannedReason = null;
    user.bannedUntil = null;
    await user.save();
    
    // Notify user
    await emailService.sendCustomEmail(
      user.email,
      'Account Unbanned',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Account Unbanned</h1>
          <p>Hello ${user.username},</p>
          <p>Your account has been unbanned and is now active again.</p>
          <p>Please review our community guidelines to ensure compliance in the future.</p>
          <a href="${process.env.FRONTEND_URL}/guidelines" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
            View Guidelines
          </a>
        </div>
      `
    );
    
    logger.info(`User ${userId} unbanned by admin ${req.user.id}`, {
      adminId: req.user.id,
      userId,
    });
    
    new ApiResponse(res, 200, 'User unbanned successfully');
  });

  // Verify user
  verifyUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    user.isVerified = true;
    user.verifiedAt = new Date();
    await user.save();
    
    // Notify user
    await emailService.sendCustomEmail(
      user.email,
      'Account Verified',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Account Verified</h1>
          <p>Hello ${user.username},</p>
          <p>Your account has been verified by our team!</p>
          <p>You now have access to additional features and your profile shows a verification badge.</p>
          <p>Thank you for being a valuable member of our community.</p>
        </div>
      `
    );
    
    logger.info(`User ${userId} verified by admin ${req.user.id}`, {
      adminId: req.user.id,
      userId,
    });
    
    new ApiResponse(res, 200, 'User verified successfully');
  });

  // Delete user
  deleteUser = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    if (user.role === 'admin' || user.role === 'super_admin') {
      throw new ApiError(403, 'Cannot delete administrators');
    }
    
    // Soft delete
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = req.user.id;
    await user.save();
    
    logger.warn(`User ${userId} deleted by admin ${req.user.id}`, {
      adminId: req.user.id,
      userId,
    });
    
    new ApiResponse(res, 200, 'User deleted successfully');
  });

  // Get posts with filtering
  getPosts = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      status,
      userId,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const where = {
      isDeleted: false,
    };
    
    if (search) {
      where[Op.or] = [
        { content: { [Op.iLike]: `%${search}%` } },
      ];
    }
    
    if (type) {
      where.type = type;
    }
    
    if (status === 'published') {
      where.isPublished = true;
    } else if (status === 'draft') {
      where.isPublished = false;
    } else if (status === 'scheduled') {
      where.scheduledAt = { [Op.ne]: null };
    }
    
    if (userId) {
      where.userId = userId;
    }
    
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
      if (toDate) where.createdAt[Op.lte] = new Date(toDate);
    }
    
    const order = [[sortBy, sortOrder.toUpperCase()]];
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'profilePicture'],
      }],
      order,
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Posts retrieved successfully', {
      posts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get post details
  getPostDetails = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    
    const post = await Post.findByPk(postId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'profilePicture'],
        },
        {
          association: 'comments',
          limit: 10,
          order: [['createdAt', 'DESC']],
        },
        {
          association: 'likes',
          limit: 10,
        },
        {
          association: 'reports',
          limit: 10,
        },
      ],
    });
    
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }
    
    new ApiResponse(res, 200, 'Post details retrieved successfully', {
      post,
    });
  });

  // Update post
  updatePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const updates = req.body;
    
    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }
    
    const allowedUpdates = [
      'isPublished',
      'isFeatured',
      'isHidden',
      'privacy',
      'tags',
    ];
    
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    await post.update(filteredUpdates);
    
    logger.info(`Admin ${req.user.id} updated post ${postId}`, {
      adminId: req.user.id,
      postId,
      updates: filteredUpdates,
    });
    
    new ApiResponse(res, 200, 'Post updated successfully');
  });

  // Feature post
  featurePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    
    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }
    
    post.isFeatured = true;
    post.featuredAt = new Date();
    await post.save();
    
    // Notify user
    const user = await User.findByPk(post.userId);
    if (user) {
      await Notification.create({
        userId: user.id,
        fromUserId: req.user.id,
        type: 'post_featured',
        title: 'Post Featured',
        body: 'Your post has been featured on the platform!',
        data: {
          postId: post.id,
        },
        priority: 'high',
      });
    }
    
    logger.info(`Post ${postId} featured by admin ${req.user.id}`, {
      adminId: req.user.id,
      postId,
    });
    
    new ApiResponse(res, 200, 'Post featured successfully');
  });

  // Hide post
  hidePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { reason } = req.body;
    
    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }
    
    post.isHidden = true;
    post.hiddenAt = new Date();
    post.hiddenReason = reason;
    post.hiddenBy = req.user.id;
    await post.save();
    
    // Notify user
    const user = await User.findByPk(post.userId);
    if (user) {
      await Notification.create({
        userId: user.id,
        fromUserId: req.user.id,
        type: 'post_hidden',
        title: 'Post Hidden',
        body: `Your post has been hidden: ${reason}`,
        data: {
          postId: post.id,
          reason,
        },
        priority: 'medium',
      });
    }
    
    logger.warn(`Post ${postId} hidden by admin ${req.user.id}`, {
      adminId: req.user.id,
      postId,
      reason,
    });
    
    new ApiResponse(res, 200, 'Post hidden successfully');
  });

  // Delete post
  deletePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { reason } = req.body;
    
    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }
    
    // Soft delete
    post.isDeleted = true;
    post.deletedAt = new Date();
    post.deletedBy = req.user.id;
    post.deletionReason = reason;
    await post.save();
    
    // Notify user
    const user = await User.findByPk(post.userId);
    if (user) {
      await Notification.create({
        userId: user.id,
        fromUserId: req.user.id,
        type: 'post_deleted',
        title: 'Post Deleted',
        body: `Your post has been deleted: ${reason}`,
        data: {
          postId: post.id,
          reason,
        },
        priority: 'high',
      });
    }
    
    logger.warn(`Post ${postId} deleted by admin ${req.user.id}`, {
      adminId: req.user.id,
      postId,
      reason,
    });
    
    new ApiResponse(res, 200, 'Post deleted successfully');
  });

  // Get reports
  getReports = asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      severity,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    if (type) {
      where.type = type;
    }
    
    if (severity) {
      where.severity = severity;
    }
    
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt[Op.gte] = new Date(fromDate);
      if (toDate) where.createdAt[Op.lte] = new Date(toDate);
    }
    
    const order = [[sortBy, sortOrder.toUpperCase()]];
    
    const { count, rows: reports } = await Report.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'profilePicture'],
        },
        {
          model: User,
          as: 'userReported',
          attributes: ['id', 'username', 'profilePicture'],
        },
        {
          model: Post,
          as: 'post',
          attributes: ['id', 'content', 'type'],
        },
      ],
      order,
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Reports retrieved successfully', {
      reports,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get report details
  getReportDetails = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    
    const report = await Report.findByPk(reportId, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'profilePicture'],
        },
        {
          model: User,
          as: 'userReported',
          attributes: ['id', 'username', 'profilePicture'],
        },
        {
          model: Post,
          as: 'post',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'profilePicture'],
          }],
        },
      ],
    });
    
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }
    
    new ApiResponse(res, 200, 'Report details retrieved successfully', {
      report,
    });
  });

  // Update report
  updateReport = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const updates = req.body;
    
    const report = await Report.findByPk(reportId);
    
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }
    
    await report.update(updates);
    
    logger.info(`Report ${reportId} updated by admin ${req.user.id}`, {
      adminId: req.user.id,
      reportId,
      updates,
    });
    
    new ApiResponse(res, 200, 'Report updated successfully');
  });

  // Resolve report
  resolveReport = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const { resolution, actionTaken } = req.body;
    
    const report = await Report.findByPk(reportId);
    
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }
    
    report.status = 'resolved';
    report.resolution = resolution;
    report.actionTaken = actionTaken;
    report.resolvedBy = req.user.id;
    report.resolvedAt = new Date();
    await report.save();
    
    // Notify reporter
    await Notification.create({
      userId: report.userId,
      fromUserId: req.user.id,
      type: 'report_resolved',
      title: 'Report Resolved',
      body: `Your report has been resolved: ${resolution}`,
      data: {
        reportId: report.id,
        resolution,
        actionTaken,
      },
      priority: 'medium',
    });
    
    logger.info(`Report ${reportId} resolved by admin ${req.user.id}`, {
      adminId: req.user.id,
      reportId,
      resolution,
      actionTaken,
    });
    
    new ApiResponse(res, 200, 'Report resolved successfully');
  });

  // Get analytics
  getAnalytics = asyncHandler(async (req, res) => {
    const { timeRange = '7d' } = req.query;
    
    const analytics = await analyticsService.getPlatformAnalytics(timeRange);
    
    new ApiResponse(res, 200, 'Analytics retrieved successfully', {
      analytics,
    });
  });

  // Get system logs
  getLogs = asyncHandler(async (req, res) => {
    const { level, fromDate, toDate, search, page = 1, limit = 50 } = req.query;
    
    // This would read from log files or log database
    // For now, return sample
    
    new ApiResponse(res, 200, 'Logs retrieved successfully', {
      logs: [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  });

  // Send broadcast email
  sendBroadcastEmail = asyncHandler(async (req, res) => {
    const { subject, content, userGroup, filters } = req.body;
    
    // Get users based on filters
    const where = { isActive: true };
    
    if (userGroup === 'all') {
      // All active users
    } else if (userGroup === 'verified') {
      where.isEmailVerified = true;
    } else if (userGroup === 'unverified') {
      where.isEmailVerified = false;
    }
    
    if (filters) {
      if (filters.role) where.role = filters.role;
      if (filters.fromDate) where.createdAt = { [Op.gte]: new Date(filters.fromDate) };
      if (filters.toDate) where.createdAt = { [Op.lte]: new Date(filters.toDate) };
    }
    
    const users = await User.findAll({
      where,
      attributes: ['id', 'email', 'username'],
      limit: 1000, // Safety limit
    });
    
    if (users.length === 0) {
      throw new ApiError(400, 'No users found matching criteria');
    }
    
    // Send emails in batches
    await emailService.sendBulkEmails(users, subject, content);
    
    logger.info(`Broadcast email sent to ${users.length} users by admin ${req.user.id}`, {
      adminId: req.user.id,
      userCount: users.length,
      subject,
    });
    
    new ApiResponse(res, 200, 'Broadcast email sent successfully', {
      sentTo: users.length,
    });
  });

  // Helper methods
  getSafeUserData(user) {
    const userData = user.toJSON();
    delete userData.password;
    delete userData.refreshToken;
    delete userData.twoFactorSecret;
    return userData;
  }
}

module.exports = new AdminController();