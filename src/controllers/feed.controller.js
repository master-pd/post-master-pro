const { Op } = require('sequelize');
const Post = require('../models/Post');
const User = require('../models/User');
const Like = require('../models/Like');
const Bookmark = require('../models/Bookmark');
const Follow = require('../models/Follow');
const View = require('../models/View');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const feedService = require('../services/feed.service');
const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');

class FeedController {
  // Get home feed (mixed content)
  getHomeFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    // Try cache first
    const cacheKey = `feed:user:${userId}:home:page:${page}`;
    const cached = await cacheService.get(cacheKey);
    
    if (cached) {
      new ApiResponse(res, 200, 'Home feed retrieved successfully', {
        feed: cached.feed,
        pagination: cached.pagination,
      });
      return;
    }
    
    const feed = await feedService.getPersonalizedFeed(userId, page, limit);
    
    // Cache the result
    await cacheService.set(cacheKey, {
      feed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feed.length === parseInt(limit),
      },
    }, 300); // 5 minutes cache
    
    new ApiResponse(res, 200, 'Home feed retrieved successfully', {
      feed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feed.length === parseInt(limit),
      },
    });
  });

  // Get "For You" feed (algorithmic recommendations)
  getForYouFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const feed = await feedService.getForYouFeed(userId, page, limit);
    
    new ApiResponse(res, 200, 'For You feed retrieved successfully', {
      feed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feed.length === parseInt(limit),
      },
    });
  });

  // Get following feed (only from followed users)
  getFollowingFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    // Get followed users
    const follows = await Follow.findAll({
      where: {
        followerId: userId,
        status: 'accepted',
      },
      attributes: ['followingId'],
    });
    
    const followingIds = follows.map(f => f.followingId);
    
    if (followingIds.length === 0) {
      new ApiResponse(res, 200, 'Following feed retrieved successfully', {
        feed: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          hasMore: false,
        },
      });
      return;
    }
    
    const offset = (page - 1) * limit;
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where: {
        userId: { [Op.in]: followingIds },
        isPublished: true,
        isDeleted: false,
        [Op.or]: [
          { privacy: 'public' },
          { privacy: 'friends' },
        ],
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture'],
        },
        {
          model: Like,
          as: 'likes',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
        {
          model: Bookmark,
          as: 'bookmarks',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    // Enrich posts
    const feed = await Promise.all(
      posts.map(async (post) => {
        const postData = post.toJSON();
        postData.isLiked = post.likes.length > 0;
        postData.isSaved = post.bookmarks.length > 0;
        return postData;
      })
    );
    
    new ApiResponse(res, 200, 'Following feed retrieved successfully', {
      feed,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get video feed
  getVideoFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where: {
        type: 'video',
        isPublished: true,
        isDeleted: false,
        privacy: 'public',
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture'],
        },
        {
          model: Like,
          as: 'likes',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
        {
          model: Bookmark,
          as: 'bookmarks',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
      ],
      order: [
        ['viewsCount', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });
    
    const feed = posts.map(post => {
      const postData = post.toJSON();
      postData.isLiked = post.likes.length > 0;
      postData.isSaved = post.bookmarks.length > 0;
      return postData;
    });
    
    new ApiResponse(res, 200, 'Video feed retrieved successfully', {
      feed,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get photo feed
  getPhotoFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where: {
        type: 'image',
        isPublished: true,
        isDeleted: false,
        privacy: 'public',
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture'],
        },
        {
          model: Like,
          as: 'likes',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
        {
          model: Bookmark,
          as: 'bookmarks',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
      ],
      order: [
        ['likesCount', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });
    
    const feed = posts.map(post => {
      const postData = post.toJSON();
      postData.isLiked = post.likes.length > 0;
      postData.isSaved = post.bookmarks.length > 0;
      return postData;
    });
    
    new ApiResponse(res, 200, 'Photo feed retrieved successfully', {
      feed,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get saved posts feed
  getSavedFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;
    
    const { count, rows: bookmarks } = await Bookmark.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Post,
          as: 'post',
          where: {
            isPublished: true,
            isDeleted: false,
          },
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'fullName', 'profilePicture'],
          }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    const feed = bookmarks
      .filter(b => b.post)
      .map(bookmark => {
        const postData = bookmark.post.toJSON();
        postData.isLiked = false; // Would need to check separately
        postData.isSaved = true;
        postData.savedAt = bookmark.createdAt;
        return postData;
      });
    
    new ApiResponse(res, 200, 'Saved posts retrieved successfully', {
      feed,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get explore feed (discover new content)
  getExploreFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20, interests } = req.query;
    
    const interestArray = interests ? interests.split(',') : [];
    
    const feed = await feedService.getExploreFeed(
      userId,
      interestArray,
      parseInt(page),
      parseInt(limit)
    );
    
    new ApiResponse(res, 200, 'Explore feed retrieved successfully', {
      feed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feed.length === parseInt(limit),
      },
    });
  });

  // Get trending feed
  getTrendingFeed = asyncHandler(async (req, res) => {
    const { limit = 20, timeRange = 'day' } = req.query;
    
    const feed = await feedService.getTrendingPosts(parseInt(limit), timeRange);
    
    new ApiResponse(res, 200, 'Trending feed retrieved successfully', {
      feed,
    });
  });

  // Get recommended feed (based on interests)
  getRecommendedFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    // Get user interests from their activity
    const interests = await this.getUserInterests(userId);
    
    const feed = await feedService.getInterestBasedFeed(
      userId,
      interests,
      parseInt(page),
      parseInt(limit)
    );
    
    new ApiResponse(res, 200, 'Recommended feed retrieved successfully', {
      feed,
      interests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feed.length === parseInt(limit),
      },
    });
  });

  // Get interest-based feed
  getInterestBasedFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { interests, page = 1, limit = 20 } = req.query;
    
    if (!interests) {
      throw new ApiError(400, 'Interests are required');
    }
    
    const interestArray = Array.isArray(interests) ? interests : [interests];
    
    const feed = await feedService.getInterestBasedFeed(
      userId,
      interestArray,
      parseInt(page),
      parseInt(limit)
    );
    
    new ApiResponse(res, 200, 'Interest-based feed retrieved successfully', {
      feed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feed.length === parseInt(limit),
      },
    });
  });

  // Get hashtag feed
  getHashtagFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { hashtag } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    if (!hashtag) {
      throw new ApiError(400, 'Hashtag is required');
    }
    
    const offset = (page - 1) * limit;
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where: {
        isPublished: true,
        isDeleted: false,
        privacy: 'public',
        hashtags: {
          [Op.contains]: [hashtag.toLowerCase()],
        },
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture'],
        },
        {
          model: Like,
          as: 'likes',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
        {
          model: Bookmark,
          as: 'bookmarks',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    const feed = posts.map(post => {
      const postData = post.toJSON();
      postData.isLiked = post.likes.length > 0;
      postData.isSaved = post.bookmarks.length > 0;
      return postData;
    });
    
    new ApiResponse(res, 200, 'Hashtag feed retrieved successfully', {
      hashtag,
      feed,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get location-based feed
  getLocationFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { latitude, longitude, radius = 10, page = 1, limit = 20 } = req.query;
    
    if (!latitude || !longitude) {
      throw new ApiError(400, 'Latitude and longitude are required');
    }
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseFloat(radius);
    
    // Simple radius search (for production, use PostGIS or similar)
    const offset = (page - 1) * limit;
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where: {
        isPublished: true,
        isDeleted: false,
        privacy: 'public',
        latitude: { [Op.ne]: null },
        longitude: { [Op.ne]: null },
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture'],
        },
        {
          model: Like,
          as: 'likes',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
        {
          model: Bookmark,
          as: 'bookmarks',
          where: { userId },
          required: false,
          attributes: ['id'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    // Filter by distance (simplified)
    const feed = posts
      .filter(post => {
        if (!post.latitude || !post.longitude) return false;
        
        const distance = this.calculateDistance(
          lat, lng,
          post.latitude, post.longitude
        );
        
        return distance <= rad;
      })
      .map(post => {
        const postData = post.toJSON();
        postData.isLiked = post.likes.length > 0;
        postData.isSaved = post.bookmarks.length > 0;
        postData.distance = this.calculateDistance(
          lat, lng,
          post.latitude, post.longitude
        );
        return postData;
      });
    
    new ApiResponse(res, 200, 'Location-based feed retrieved successfully', {
      location: { latitude: lat, longitude: lng, radius: rad },
      feed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: feed.length === parseInt(limit),
      },
    });
  });

  // Helper methods

  // Calculate distance between two coordinates (in km)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  // Get user interests based on activity
  async getUserInterests(userId) {
    // Get user's liked posts hashtags
    const likedPosts = await Post.findAll({
      include: [{
        model: Like,
        as: 'likes',
        where: { userId },
        attributes: [],
      }],
      attributes: ['hashtags'],
      limit: 50,
    });
    
    // Extract hashtags
    const hashtags = likedPosts.reduce((acc, post) => {
      if (post.hashtags && Array.isArray(post.hashtags)) {
        return [...acc, ...post.hashtags];
      }
      return acc;
    }, []);
    
    // Count frequency
    const frequency = {};
    hashtags.forEach(tag => {
      frequency[tag] = (frequency[tag] || 0) + 1;
    });
    
    // Sort by frequency and return top 10
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }

  // Refresh feed (invalidate cache)
  refreshFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    await cacheService.invalidateUserFeed(userId);
    
    logger.info(`Feed refreshed for user: ${userId}`);
    
    new ApiResponse(res, 200, 'Feed refreshed successfully');
  });
}

module.exports = new FeedController();