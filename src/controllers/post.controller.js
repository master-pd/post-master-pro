const { Op } = require('sequelize');
const Post = require('../models/Post');
const User = require('../models/User');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Share = require('../models/Share');
const Bookmark = require('../models/Bookmark');
const View = require('../models/View');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const postService = require('../services/post.service');
const fileService = require('../services/file.service');
const notificationService = require('../services/notification.service');
const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');

class PostController {
  // Create Post
  createPost = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
      content,
      type = 'text',
      mediaUrls = [],
      privacy = 'public',
      location,
      latitude,
      longitude,
      tags = [],
      mentions = [],
      hashtags = [],
      scheduledAt,
      pollQuestion,
      pollOptions = [],
      pollEndsAt,
      linkPreview,
    } = req.body;

    // Validate media based on type
    if (type === 'video' && mediaUrls.length === 0) {
      throw new ApiError(400, 'Video post requires media');
    }

    // Process media if any
    let processedMedia = mediaUrls;
    if (req.files && req.files.length > 0) {
      processedMedia = await Promise.all(
        req.files.map(file => fileService.uploadMedia(file, type))
      );
    }

    // Extract hashtags from content
    const extractedHashtags = this.extractHashtags(content);
    const finalHashtags = [...new Set([...hashtags, ...extractedHashtags])];

    // Extract mentions from content
    const extractedMentions = this.extractMentions(content);
    const finalMentions = [...new Set([...mentions, ...extractedMentions])];

    // Create post
    const post = await Post.create({
      userId,
      type,
      content: content?.trim(),
      mediaUrls: processedMedia,
      privacy,
      location,
      latitude,
      longitude,
      tags,
      mentions: finalMentions,
      hashtags: finalHashtags,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      pollQuestion,
      pollOptions,
      pollEndsAt: pollEndsAt ? new Date(pollEndsAt) : null,
      linkPreview,
      isPublished: !scheduledAt,
    });

    // Generate thumbnail for video
    if (type === 'video' && processedMedia.length > 0) {
      await this.generateVideoThumbnail(post, processedMedia[0]);
    }

    // Notify mentioned users
    if (finalMentions.length > 0) {
      await notificationService.createMentionNotifications({
        postId: post.id,
        userId,
        mentionedUsers: finalMentions,
      });
    }

    // Invalidate feed cache
    await cacheService.invalidateUserFeed(userId);

    // Real-time notification via Socket.io
    req.io?.to(`user:${userId}`).emit('post:created', post);

    logger.info(`Post created: ${post.id} by user: ${userId}`);

    new ApiResponse(res, 201, 'Post created successfully', {
      post: await this.enrichPostData(post, userId),
    });
  });

  // Get Single Post
  getPost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user?.id;

    const post = await Post.findByPk(postId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture'],
        },
        {
          model: Like,
          as: 'likes',
          where: userId ? { userId } : { userId: null },
          required: false,
          attributes: ['id'],
        },
        {
          model: Bookmark,
          as: 'bookmarks',
          where: userId ? { userId } : { userId: null },
          required: false,
          attributes: ['id'],
        },
      ],
    });

    if (!post || post.isDeleted) {
      throw new ApiError(404, 'Post not found');
    }

    // Check privacy
    if (!this.canViewPost(post, userId)) {
      throw new ApiError(403, 'You do not have permission to view this post');
    }

    // Record view if user is authenticated
    if (userId && userId !== post.userId) {
      await View.findOrCreate({
        where: { userId, postId: post.id },
        defaults: { userId, postId: post.id },
      });

      // Increment view count
      await post.incrementViews();
    }

    new ApiResponse(res, 200, 'Post retrieved successfully', {
      post: await this.enrichPostData(post, userId),
    });
  });

  // Update Post
  updatePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Check ownership
    if (post.userId !== userId && req.user.role !== 'admin') {
      throw new ApiError(403, 'You can only edit your own posts');
    }

    // Prevent editing after certain time (optional)
    const hoursSinceCreation = (new Date() - post.createdAt) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24 && req.user.role !== 'admin') {
      throw new ApiError(400, 'Posts can only be edited within 24 hours of creation');
    }

    // Process new media if uploaded
    if (req.files && req.files.length > 0) {
      const newMedia = await Promise.all(
        req.files.map(file => fileService.uploadMedia(file, post.type))
      );
      updateData.mediaUrls = [...post.mediaUrls, ...newMedia];
    }

    // Extract new hashtags and mentions
    if (updateData.content) {
      const extractedHashtags = this.extractHashtags(updateData.content);
      const extractedMentions = this.extractMentions(updateData.content);
      
      updateData.hashtags = [...new Set([...post.hashtags, ...extractedHashtags])];
      updateData.mentions = [...new Set([...post.mentions, ...extractedMentions])];
      updateData.isEdited = true;
      updateData.editedAt = new Date();
    }

    // Update post
    await post.update(updateData);

    // Invalidate caches
    await cacheService.invalidatePostCache(postId);
    await cacheService.invalidateUserFeed(userId);

    logger.info(`Post updated: ${postId} by user: ${userId}`);

    new ApiResponse(res, 200, 'Post updated successfully', {
      post: await this.enrichPostData(post, userId),
    });
  });

  // Delete Post (Soft Delete)
  deletePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new ApiError(404, 'Post not found');
    }

    // Check ownership or admin
    if (post.userId !== userId && req.user.role !== 'admin') {
      throw new ApiError(403, 'You can only delete your own posts');
    }

    // Soft delete
    await post.update({
      isDeleted: true,
      deletedAt: new Date(),
    });

    // Delete associated media from storage
    if (post.mediaUrls && post.mediaUrls.length > 0) {
      await Promise.all(
        post.mediaUrls.map(url => fileService.deleteMedia(url))
      );
    }

    // Invalidate caches
    await cacheService.invalidatePostCache(postId);
    await cacheService.invalidateUserFeed(userId);

    logger.info(`Post deleted: ${postId} by user: ${userId}`);

    new ApiResponse(res, 200, 'Post deleted successfully');
  });

  // Like/Unlike Post
  toggleLike = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findByPk(postId);
    if (!post || post.isDeleted) {
      throw new ApiError(404, 'Post not found');
    }

    const existingLike = await Like.findOne({
      where: { userId, postId },
    });

    let action;
    
    if (existingLike) {
      // Unlike
      await existingLike.destroy();
      await post.decrement('likesCount');
      action = 'unliked';
    } else {
      // Like
      await Like.create({ userId, postId });
      await post.increment('likesCount');
      action = 'liked';

      // Create notification (except for own posts)
      if (post.userId !== userId) {
        await notificationService.createLikeNotification({
          postId: post.id,
          userId: post.userId,
          likedBy: userId,
        });

        // Real-time notification
        req.io?.to(`user:${post.userId}`).emit('post:liked', {
          postId: post.id,
          likedBy: userId,
        });
      }
    }

    // Update cache
    await cacheService.invalidatePostCache(postId);

    new ApiResponse(res, 200, `Post ${action} successfully`, {
      isLiked: !existingLike,
      likesCount: post.likesCount,
    });
  });

  // Save/Unsave Post (Bookmark)
  toggleSave = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findByPk(postId);
    if (!post || post.isDeleted) {
      throw new ApiError(404, 'Post not found');
    }

    const existingBookmark = await Bookmark.findOne({
      where: { userId, postId },
    });

    let action;
    
    if (existingBookmark) {
      await existingBookmark.destroy();
      await post.decrement('savesCount');
      action = 'unsaved';
    } else {
      await Bookmark.create({ userId, postId });
      await post.increment('savesCount');
      action = 'saved';
    }

    new ApiResponse(res, 200, `Post ${action} successfully`, {
      isSaved: !existingBookmark,
      savesCount: post.savesCount,
    });
  });

  // Share Post
  sharePost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;
    const { content, privacy = 'public' } = req.body;

    const originalPost = await Post.findByPk(postId);
    if (!originalPost || originalPost.isDeleted) {
      throw new ApiError(404, 'Post not found');
    }

    // Check if user can share this post
    if (!this.canViewPost(originalPost, userId)) {
      throw new ApiError(403, 'You cannot share this post');
    }

    // Create shared post
    const sharedPost = await Post.create({
      userId,
      type: 'shared',
      content: content?.trim(),
      sharedPostId: postId,
      privacy,
      isPublished: true,
    });

    // Increment share count on original post
    await originalPost.increment('sharesCount');

    // Create notification for original post owner
    if (originalPost.userId !== userId) {
      await notificationService.createShareNotification({
        postId: originalPost.id,
        userId: originalPost.userId,
        sharedBy: userId,
      });

      // Real-time notification
      req.io?.to(`user:${originalPost.userId}`).emit('post:shared', {
        postId: originalPost.id,
        sharedBy: userId,
      });
    }

    // Invalidate feeds
    await cacheService.invalidateUserFeed(userId);
    await cacheService.invalidatePostCache(postId);

    new ApiResponse(res, 201, 'Post shared successfully', {
      post: await this.enrichPostData(sharedPost, userId),
    });
  });

  // Get Post Comments
  getPostComments = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { page = 1, limit = 20, sort = 'recent' } = req.query;
    
    const offset = (page - 1) * limit;

    const post = await Post.findByPk(postId);
    if (!post || post.isDeleted) {
      throw new ApiError(404, 'Post not found');
    }

    let order;
    switch (sort) {
      case 'top':
        order = [['likesCount', 'DESC']];
        break;
      case 'oldest':
        order = [['createdAt', 'ASC']];
        break;
      default:
        order = [['createdAt', 'DESC']];
    }

    const { count, rows: comments } = await Comment.findAndCountAll({
      where: { postId },
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order,
      limit: parseInt(limit),
      offset,
    });

    new ApiResponse(res, 200, 'Comments retrieved successfully', {
      comments,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Report Post
  reportPost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;
    const { reason, description } = req.body;

    const post = await Post.findByPk(postId);
    if (!post || post.isDeleted) {
      throw new ApiError(404, 'Post not found');
    }

    // Check if already reported by this user
    const existingReport = await Report.findOne({
      where: { userId, postId },
    });

    if (existingReport) {
      throw new ApiError(400, 'You have already reported this post');
    }

    // Create report
    await Report.create({
      userId,
      postId,
      reason,
      description,
      status: 'pending',
    });

    // Notify admins
    await notificationService.createAdminNotification({
      type: 'post_reported',
      data: {
        postId,
        reporterId: userId,
        reason,
      },
    });

    logger.warn(`Post reported: ${postId} by user: ${userId}, reason: ${reason}`);

    new ApiResponse(res, 201, 'Post reported successfully');
  });

  // Get User Posts
  getUserPosts = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user?.id;
    const { page = 1, limit = 20, type } = req.query;
    
    const offset = (page - 1) * limit;

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Build where clause
    const where = {
      userId,
      isPublished: true,
      isDeleted: false,
    };

    // Filter by type if specified
    if (type) {
      where.type = type;
    }

    // Privacy check: if not current user's profile, only show public/friends posts
    if (currentUserId !== userId) {
      where[Op.or] = [
        { privacy: 'public' },
        {
          [Op.and]: [
            { privacy: 'friends' },
            // Check if current user is a friend (implement friend check)
          ]
        }
      ];
    }

    const { count, rows: posts } = await Post.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    // Enrich posts with user-specific data
    const enrichedPosts = await Promise.all(
      posts.map(post => this.enrichPostData(post, currentUserId))
    );

    new ApiResponse(res, 200, 'User posts retrieved successfully', {
      posts: enrichedPosts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get Trending Posts
  getTrendingPosts = asyncHandler(async (req, res) => {
    const { limit = 20, timeRange = 'day' } = req.query;
    
    let hours;
    switch (timeRange) {
      case 'hour':
        hours = 1;
        break;
      case 'week':
        hours = 168;
        break;
      case 'month':
        hours = 720;
        break;
      default:
        hours = 24;
    }

    const trendingPosts = await postService.getTrendingPosts(hours, parseInt(limit));

    new ApiResponse(res, 200, 'Trending posts retrieved successfully', {
      posts: trendingPosts,
    });
  });

  // Get Post Analytics
  getPostAnalytics = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findByPk(postId);
    if (!post || post.isDeleted) {
      throw new ApiError(404, 'Post not found');
    }

    // Only post owner or admin can view analytics
    if (post.userId !== userId && req.user.role !== 'admin') {
      throw new ApiError(403, 'You can only view analytics for your own posts');
    }

    const analytics = await postService.getPostAnalytics(postId);

    new ApiResponse(res, 200, 'Post analytics retrieved successfully', {
      analytics,
    });
  });

  // Helper Methods
  extractHashtags(content) {
    if (!content) return [];
    const hashtagRegex = /#(\w+)/g;
    const matches = content.match(hashtagRegex);
    return matches ? matches.map(tag => tag.substring(1).toLowerCase()) : [];
  }

  extractMentions(content) {
    if (!content) return [];
    const mentionRegex = /@(\w+)/g;
    const matches = content.match(mentionRegex);
    return matches ? matches.map(mention => mention.substring(1).toLowerCase()) : [];
  }

  canViewPost(post, userId) {
    if (post.privacy === 'public') return true;
    if (!userId) return false;
    if (post.userId === userId) return true;
    if (post.privacy === 'friends') {
      // Implement friend check here
      return false; // Placeholder
    }
    if (post.privacy === 'private') return false;
    return false;
  }

  async enrichPostData(post, userId) {
    const enriched = post.toJSON();
    
    // Add user-specific flags
    if (userId) {
      const [isLiked, isSaved, isShared] = await Promise.all([
        Like.findOne({ where: { userId, postId: post.id } }),
        Bookmark.findOne({ where: { userId, postId: post.id } }),
        Share.findOne({ where: { userId, postId: post.id } }),
      ]);

      enriched.isLiked = !!isLiked;
      enriched.isSaved = !!isSaved;
      enriched.isShared = !!isShared;
    }

    // Add author info if not already included
    if (!enriched.author && post.author) {
      enriched.author = post.author.toJSON();
    }

    // Calculate engagement rate
    enriched.engagementRate = post.getEngagementRate();

    return enriched;
  }

  async generateVideoThumbnail(post, videoUrl) {
    try {
      // This would use a service like FFmpeg or Cloudinary
      // For now, we'll set a placeholder
      post.thumbnailUrl = videoUrl.replace('.mp4', '.jpg');
      await post.save();
    } catch (error) {
      logger.error('Failed to generate video thumbnail:', error);
    }
  }
}

module.exports = new PostController();