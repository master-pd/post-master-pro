const { Op } = require('sequelize');
const Story = require('../models/Story');
const User = require('../models/User');
const View = require('../models/View');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const fileService = require('../services/file.service');
const notificationService = require('../services/notification.service');
const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');

class StoryController {
  // Create story
  createStory = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { content, type = 'image', duration = 5, privacy = 'public', 
            backgroundColor, textColor, fontSize, location, mentions, hashtags } = req.body;
    
    if (!req.file) {
      throw new ApiError(400, 'Media file is required for story');
    }
    
    // Validate file based on type
    let mediaUrl;
    let thumbnailUrl = null;
    
    if (type === 'image') {
      const result = await fileService.uploadImage(req.file, {
        folder: 'stories/images',
      });
      mediaUrl = result.url;
    } else if (type === 'video') {
      const result = await fileService.uploadVideo(req.file, {
        folder: 'stories/videos',
      });
      mediaUrl = result.url;
      thumbnailUrl = result.thumbnailUrl;
    } else if (type === 'text') {
      if (!content) {
        throw new ApiError(400, 'Content is required for text story');
      }
      // For text stories, we can generate an image or use background
      mediaUrl = await this.generateTextStoryImage(content, {
        backgroundColor,
        textColor,
        fontSize,
      });
    } else {
      throw new ApiError(400, 'Invalid story type');
    }
    
    // Calculate expiry (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    // Create story
    const story = await Story.create({
      userId,
      type,
      mediaUrl,
      thumbnailUrl,
      content: type === 'text' ? content : null,
      backgroundColor,
      textColor,
      fontSize: parseInt(fontSize) || 24,
      duration: parseInt(duration),
      privacy,
      location,
      mentions: mentions ? JSON.parse(mentions) : [],
      hashtags: hashtags ? JSON.parse(hashtags) : [],
      expiresAt,
    });
    
    // Notify mentioned users
    if (story.mentions && story.mentions.length > 0) {
      await notificationService.createBulkNotifications(
        story.mentions,
        {
          fromUserId: userId,
          type: 'mention',
          title: 'You were mentioned',
          body: `${req.user.username} mentioned you in their story`,
          data: {
            storyId: story.id,
          },
          priority: 'high',
        }
      );
    }
    
    // Invalidate cache
    await cacheService.delPattern('stories:*');
    
    logger.info(`Story created: ${story.id} by user ${userId}`);
    
    new ApiResponse(res, 201, 'Story created successfully', {
      story: await this.enrichStoryData(story, userId),
    });
  });

  // Get stories (for feed)
  getStories = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    // Get stories from followed users
    const stories = await Story.getActiveStories(null, userId);
    
    // Group by user
    const storiesByUser = {};
    stories.forEach(story => {
      if (!storiesByUser[story.userId]) {
        storiesByUser[story.userId] = {
          user: story.author.toJSON(),
          stories: [],
          hasUnviewed: false,
        };
      }
      
      storiesByUser[story.userId].stories.push(
        await this.enrichStoryData(story, userId)
      );
    });
    
    // Check for unviewed stories
    for (const userId in storiesByUser) {
      const userStories = storiesByUser[userId].stories;
      const hasUnviewed = userStories.some(story => 
        !story.viewedByCurrentUser
      );
      storiesByUser[userId].hasUnviewed = hasUnviewed;
    }
    
    const result = Object.values(storiesByUser);
    
    new ApiResponse(res, 200, 'Stories retrieved successfully', {
      stories: result,
    });
  });

  // Get user's stories
  getUserStories = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    
    const stories = await Story.getActiveStories(userId, currentUserId);
    
    new ApiResponse(res, 200, 'User stories retrieved successfully', {
      stories: await Promise.all(
        stories.map(story => this.enrichStoryData(story, currentUserId))
      ),
    });
  });

  // Get single story
  getStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    
    const story = await Story.findByPk(storyId, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
    });
    
    if (!story || !story.isActive) {
      throw new ApiError(404, 'Story not found');
    }
    
    // Check privacy
    if (!this.canViewStory(story, userId)) {
      throw new ApiError(403, 'You do not have permission to view this story');
    }
    
    new ApiResponse(res, 200, 'Story retrieved successfully', {
      story: await this.enrichStoryData(story, userId),
    });
  });

  // Delete story
  deleteStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    
    const story = await Story.findByPk(storyId);
    
    if (!story) {
      throw new ApiError(404, 'Story not found');
    }
    
    if (story.userId !== userId && req.user.role !== 'admin') {
      throw new ApiError(403, 'You can only delete your own stories');
    }
    
    // Archive instead of delete
    await story.archive();
    
    // Delete media from storage
    if (story.mediaUrl) {
      await fileService.deleteFile(story.mediaUrl);
    }
    
    if (story.thumbnailUrl) {
      await fileService.deleteFile(story.thumbnailUrl);
    }
    
    // Invalidate cache
    await cacheService.delPattern('stories:*');
    
    logger.info(`Story deleted: ${storyId} by user ${userId}`);
    
    new ApiResponse(res, 200, 'Story deleted successfully');
  });

  // View story
  viewStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    
    const story = await Story.findByPk(storyId);
    
    if (!story || !story.isActive) {
      throw new ApiError(404, 'Story not found');
    }
    
    // Check if already viewed
    const existingView = await View.findOne({
      where: { userId, storyId },
    });
    
    if (!existingView) {
      // Record view
      await View.create({
        userId,
        storyId,
        deviceType: req.useragent.platform,
        userAgent: req.useragent.source,
        ipAddress: req.ip,
      });
      
      // Increment view count
      await story.incrementViews();
      
      // If viewer is not the author, create notification
      if (story.userId !== userId) {
        await notificationService.createNotification({
          userId: story.userId,
          fromUserId: userId,
          type: 'story_view',
          title: 'Story View',
          body: `${req.user.username} viewed your story`,
          data: {
            storyId: story.id,
            viewerId: userId,
          },
          priority: 'low',
        });
      }
    }
    
    new ApiResponse(res, 200, 'Story viewed successfully');
  });

  // Reply to story
  replyToStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    const { message } = req.body;
    
    const story = await Story.findByPk(storyId);
    
    if (!story || !story.isActive) {
      throw new ApiError(404, 'Story not found');
    }
    
    if (!this.canViewStory(story, userId)) {
      throw new ApiError(403, 'You cannot reply to this story');
    }
    
    // Create reply (this would be stored in a separate table)
    // For now, just create a notification
    
    await notificationService.createNotification({
      userId: story.userId,
      fromUserId: userId,
      type: 'story_reply',
      title: 'Story Reply',
      body: `${req.user.username} replied to your story: ${message.substring(0, 100)}`,
      data: {
        storyId: story.id,
        replierId: userId,
        message,
      },
      priority: 'medium',
    });
    
    // Increment replies count
    story.repliesCount += 1;
    await story.save();
    
    new ApiResponse(res, 201, 'Reply sent successfully');
  });

  // Share story
  shareStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    
    const story = await Story.findByPk(storyId);
    
    if (!story || !story.isActive) {
      throw new ApiError(404, 'Story not found');
    }
    
    if (!this.canViewStory(story, userId)) {
      throw new ApiError(403, 'You cannot share this story');
    }
    
    // Increment share count
    story.sharesCount += 1;
    await story.save();
    
    // Create notification for story author
    if (story.userId !== userId) {
      await notificationService.createNotification({
        userId: story.userId,
        fromUserId: userId,
        type: 'story_share',
        title: 'Story Shared',
        body: `${req.user.username} shared your story`,
        data: {
          storyId: story.id,
          sharedBy: userId,
        },
        priority: 'medium',
      });
    }
    
    new ApiResponse(res, 200, 'Story shared successfully');
  });

  // Add reaction to story
  addReaction = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    const { reaction } = req.body;
    
    const story = await Story.findByPk(storyId);
    
    if (!story || !story.isActive) {
      throw new ApiError(404, 'Story not found');
    }
    
    if (!this.canViewStory(story, userId)) {
      throw new ApiError(403, 'You cannot react to this story');
    }
    
    // Increment reactions count
    story.reactionsCount += 1;
    await story.save();
    
    // Create notification for story author
    if (story.userId !== userId) {
      await notificationService.createNotification({
        userId: story.userId,
        fromUserId: userId,
        type: 'story_reaction',
        title: 'Story Reaction',
        body: `${req.user.username} reacted to your story`,
        data: {
          storyId: story.id,
          reaction,
          reactedBy: userId,
        },
        priority: 'medium',
      });
    }
    
    new ApiResponse(res, 200, 'Reaction added successfully');
  });

  // Get story views
  getStoryViews = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const story = await Story.findByPk(storyId);
    
    if (!story) {
      throw new ApiError(404, 'Story not found');
    }
    
    if (story.userId !== userId) {
      throw new ApiError(403, 'You can only view analytics for your own stories');
    }
    
    const offset = (page - 1) * limit;
    
    const { count, rows: views } = await View.findAndCountAll({
      where: { storyId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Story views retrieved successfully', {
      views: views.map(view => view.toJSON()),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get archived stories
  getArchive = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const { count, rows: stories } = await Story.findAndCountAll({
      where: {
        userId,
        isArchived: true,
      },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Archived stories retrieved successfully', {
      stories: await Promise.all(
        stories.map(story => this.enrichStoryData(story, userId))
      ),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Archive story
  archiveStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    
    const story = await Story.findByPk(storyId);
    
    if (!story) {
      throw new ApiError(404, 'Story not found');
    }
    
    if (story.userId !== userId) {
      throw new ApiError(403, 'You can only archive your own stories');
    }
    
    await story.archive();
    
    new ApiResponse(res, 200, 'Story archived successfully');
  });

  // Delete from archive
  deleteFromArchive = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId = req.user.id;
    
    const story = await Story.findByPk(storyId);
    
    if (!story || !story.isArchived) {
      throw new ApiError(404, 'Story not found in archive');
    }
    
    if (story.userId !== userId) {
      throw new ApiError(403, 'You can only delete your own stories');
    }
    
    // Delete media from storage
    if (story.mediaUrl) {
      await fileService.deleteFile(story.mediaUrl);
    }
    
    if (story.thumbnailUrl) {
      await fileService.deleteFile(story.thumbnailUrl);
    }
    
    await story.destroy();
    
    new ApiResponse(res, 200, 'Story deleted from archive successfully');
  });

  // Create story highlight
  createHighlight = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { title, storyIds, coverStoryId } = req.body;
    
    // This would create a Highlight model (not implemented yet)
    // For now, return success
    
    new ApiResponse(res, 201, 'Highlight created successfully');
  });

  // Get highlights
  getHighlights = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    // This would fetch highlights
    // For now, return empty array
    
    new ApiResponse(res, 200, 'Highlights retrieved successfully', {
      highlights: [],
    });
  });

  // Helper methods
  canViewStory(story, userId) {
    if (story.userId === userId) return true;
    if (story.privacy === 'public') return true;
    if (story.privacy === 'private') return false;
    
    // For friends/close_friends, check relationship
    // This is a simplified check
    return false;
  }

  async enrichStoryData(story, userId) {
    const storyData = story.toJSON();
    
    // Check if user viewed the story
    const view = await View.findOne({
      where: { userId, storyId: story.id },
    });
    
    storyData.viewedByCurrentUser = !!view;
    storyData.viewedAt = view?.createdAt;
    
    // Add author info
    if (!storyData.author && story.author) {
      storyData.author = story.author.toJSON();
    }
    
    // Check if expired
    storyData.isExpired = story.isExpired();
    
    return storyData;
  }

  async generateTextStoryImage(content, options = {}) {
    // This would generate an image with text
    // For now, return a placeholder
    const { backgroundColor = '#000000', textColor = '#FFFFFF', fontSize = 24 } = options;
    
    // In production, use a service like Canvas or ImageMagick
    return `https://via.placeholder.com/1080x1920/${backgroundColor.substring(1)}/${textColor.substring(1)}?text=${encodeURIComponent(content.substring(0, 100))}`;
  }
}

module.exports = new StoryController();