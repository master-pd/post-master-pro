const { Op } = require('sequelize');
const User = require('../models/User');
const Post = require('../models/Post');
const Group = require('../models/Group');
const Hashtag = require('../models/Hashtag');
const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const searchService = require('../services/search.service');
const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');

class SearchController {
  // Global search
  globalSearch = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;
    const userId = req.user?.id;
    
    if (!q || q.trim().length < 2) {
      throw new ApiError(400, 'Search query must be at least 2 characters');
    }
    
    const query = q.trim().toLowerCase();
    const offset = (page - 1) * limit;
    
    // Search in parallel
    const [users, posts, groups, hashtags, events] = await Promise.all([
      // Search users
      User.findAll({
        where: {
          [Op.or]: [
            { username: { [Op.iLike]: `%${query}%` } },
            { fullName: { [Op.iLike]: `%${query}%` } },
          ],
          isActive: true,
          isEmailVerified: true,
        },
        attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio'],
        limit: 5,
      }),
      
      // Search posts
      Post.findAll({
        where: {
          [Op.or]: [
            { content: { [Op.iLike]: `%${query}%` } },
            sequelize.where(
              sequelize.fn('jsonb_exists', sequelize.col('hashtags'), query),
              true
            ),
          ],
          isPublished: true,
          isDeleted: false,
          privacy: 'public',
        },
        include: [{
          model: require('../models/User'),
          as: 'author',
          attributes: ['id', 'username', 'profilePicture'],
        }],
        limit: 5,
      }),
      
      // Search groups
      Group.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: `%${query}%` } },
            { description: { [Op.iLike]: `%${query}%` } },
          ],
          isActive: true,
          isBanned: false,
        },
        attributes: ['id', 'name', 'slug', 'avatar', 'description', 'membersCount'],
        limit: 5,
      }),
      
      // Search hashtags
      Hashtag.findAll({
        where: {
          tag: { [Op.iLike]: `%${query}%` },
          isBanned: false,
        },
        attributes: ['id', 'tag', 'postsCount'],
        limit: 5,
      }),
      
      // Search events
      Event.findAll({
        where: {
          [Op.or]: [
            { title: { [Op.iLike]: `%${query}%` } },
            { description: { [Op.iLike]: `%${query}%` } },
          ],
          isCancelled: false,
        },
        attributes: ['id', 'title', 'description', 'coverPhoto', 'startDate', 'location'],
        limit: 5,
      }),
    ]);
    
    new ApiResponse(res, 200, 'Search results retrieved successfully', {
      query,
      results: {
        users: await this.enrichUsers(users, userId),
        posts: await this.enrichPosts(posts, userId),
        groups: await this.enrichGroups(groups, userId),
        hashtags,
        events,
      },
    });
  });

  // Search users
  searchUsers = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;
    const userId = req.user.id;
    
    if (!q || q.trim().length < 2) {
      throw new ApiError(400, 'Search query must be at least 2 characters');
    }
    
    const query = q.trim().toLowerCase();
    const offset = (page - 1) * limit;
    
    const { count, rows: users } = await User.findAndCountAll({
      where: {
        [Op.or]: [
          { username: { [Op.iLike]: `%${query}%` } },
          { fullName: { [Op.iLike]: `%${query}%` } },
          { email: { [Op.iLike]: `%${query}%` } },
        ],
        isActive: true,
        isEmailVerified: true,
      },
      attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio'],
      order: [
        [sequelize.literal(`CASE WHEN username ILIKE '${query}' THEN 1 ELSE 2 END`), 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Users found successfully', {
      query,
      users: await this.enrichUsers(users, userId),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Search posts
  searchPosts = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20, type, sort = 'recent' } = req.query;
    const userId = req.user.id;
    
    if (!q || q.trim().length < 2) {
      throw new ApiError(400, 'Search query must be at least 2 characters');
    }
    
    const query = q.trim().toLowerCase();
    const offset = (page - 1) * limit;
    
    const where = {
      [Op.or]: [
        { content: { [Op.iLike]: `%${query}%` } },
        sequelize.where(
          sequelize.fn('jsonb_exists', sequelize.col('hashtags'), query),
          true
        ),
      ],
      isPublished: true,
      isDeleted: false,
      privacy: 'public',
    };
    
    if (type) {
      where.type = type;
    }
    
    let order;
    switch (sort) {
      case 'popular':
        order = [['likesCount', 'DESC']];
        break;
      case 'trending':
        order = [
          [sequelize.literal('("likesCount" * 1 + "commentsCount" * 2 + "sharesCount" * 3) / NULLIF("viewsCount", 0)'), 'DESC'],
          ['createdAt', 'DESC'],
        ];
        break;
      default:
        order = [['createdAt', 'DESC']];
    }
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where,
      include: [{
        model: require('../models/User'),
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order,
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Posts found successfully', {
      query,
      posts: await this.enrichPosts(posts, userId),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Search groups
  searchGroups = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20, category, type } = req.query;
    const userId = req.user.id;
    
    if (!q || q.trim().length < 2) {
      throw new ApiError(400, 'Search query must be at least 2 characters');
    }
    
    const query = q.trim().toLowerCase();
    const offset = (page - 1) * limit;
    
    const where = {
      [Op.or]: [
        { name: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
        { slug: { [Op.iLike]: `%${query}%` } },
      ],
      isActive: true,
      isBanned: false,
    };
    
    if (category) {
      where.category = category;
    }
    
    if (type) {
      where.type = type;
    }
    
    const { count, rows: groups } = await Group.findAndCountAll({
      where,
      attributes: [
        'id',
        'name',
        'slug',
        'avatar',
        'description',
        'type',
        'category',
        'membersCount',
        'postsCount',
        'isVerified',
      ],
      order: [
        ['membersCount', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });
    
    // Check if user is member
    const enrichedGroups = await Promise.all(
      groups.map(async (group) => {
        const groupData = group.toJSON();
        
        const membership = await require('../models/GroupMember').findOne({
          where: { groupId: group.id, userId },
        });
        
        groupData.isMember = !!membership;
        groupData.memberRole = membership?.role;
        
        return groupData;
      })
    );
    
    new ApiResponse(res, 200, 'Groups found successfully', {
      query,
      groups: enrichedGroups,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Search hashtags
  searchHashtags = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      throw new ApiError(400, 'Search query must be at least 2 characters');
    }
    
    const query = q.trim().toLowerCase();
    const offset = (page - 1) * limit;
    
    const { count, rows: hashtags } = await Hashtag.findAndCountAll({
      where: {
        tag: { [Op.iLike]: `%${query}%` },
        isBanned: false,
      },
      attributes: ['id', 'tag', 'description', 'postsCount', 'storiesCount', 'followersCount'],
      order: [
        ['postsCount', 'DESC'],
        ['tag', 'ASC'],
      ],
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Hashtags found successfully', {
      query,
      hashtags,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Search events
  searchEvents = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20, category, date } = req.query;
    const userId = req.user.id;
    
    if (!q || q.trim().length < 2) {
      throw new ApiError(400, 'Search query must be at least 2 characters');
    }
    
    const query = q.trim().toLowerCase();
    const offset = (page - 1) * limit;
    
    const where = {
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
      ],
      isCancelled: false,
    };
    
    if (category) {
      where.category = category;
    }
    
    if (date) {
      if (date === 'upcoming') {
        where.startDate = { [Op.gte]: new Date() };
      } else if (date === 'past') {
        where.startDate = { [Op.lt]: new Date() };
      }
    }
    
    const { count, rows: events } = await Event.findAndCountAll({
      where,
      include: [{
        model: require('../models/User'),
        as: 'creator',
        attributes: ['id', 'username', 'profilePicture'],
      }],
      order: [['startDate', 'ASC']],
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Events found successfully', {
      query,
      events: events.map(event => event.toJSON()),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Advanced search
  advancedSearch = asyncHandler(async (req, res) => {
    const {
      q,
      type = 'all',
      userId,
      hashtag,
      location,
      dateFrom,
      dateTo,
      minLikes,
      minComments,
      sort = 'relevance',
      page = 1,
      limit = 20,
    } = req.query;
    
    const currentUserId = req.user.id;
    const offset = (page - 1) * limit;
    
    // Build search query based on type
    let results = [];
    let total = 0;
    
    switch (type) {
      case 'posts':
        // Advanced post search logic
        break;
      case 'users':
        // Advanced user search logic
        break;
      case 'groups':
        // Advanced group search logic
        break;
      default:
        // Combined search
        break;
    }
    
    new ApiResponse(res, 200, 'Advanced search completed', {
      query: q,
      type,
      results,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  });

  // Get recent searches
  getRecentSearches = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    // This would query a SearchHistory model
    // For now, return empty array
    
    new ApiResponse(res, 200, 'Recent searches retrieved', {
      searches: [],
    });
  });

  // Clear recent searches
  clearRecentSearches = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    // Clear from cache or database
    await cacheService.del(`search:recent:${userId}`);
    
    new ApiResponse(res, 200, 'Recent searches cleared');
  });

  // Delete recent search
  deleteRecentSearch = asyncHandler(async (req, res) => {
    const { searchId } = req.params;
    const userId = req.user.id;
    
    // Delete specific search
    // Implementation depends on SearchHistory model
    
    new ApiResponse(res, 200, 'Search deleted from history');
  });

  // Get trending searches
  getTrendingSearches = asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    
    // This would query search analytics
    // For now, return sample data
    
    const trending = [
      { query: 'technology', count: 1250 },
      { query: 'travel', count: 980 },
      { query: 'food', count: 850 },
      { query: 'fitness', count: 720 },
      { query: 'music', count: 650 },
    ];
    
    new ApiResponse(res, 200, 'Trending searches retrieved', {
      trending,
    });
  });

  // Helper methods
  async enrichUsers(users, currentUserId) {
    const Follow = require('../models/Follow');
    
    return await Promise.all(
      users.map(async (user) => {
        const userData = user.toJSON();
        
        if (currentUserId && currentUserId !== userData.id) {
          const follow = await Follow.findOne({
            where: {
              followerId: currentUserId,
              followingId: userData.id,
            },
          });
          
          userData.followStatus = follow?.status || null;
          userData.isFollowing = follow?.status === 'accepted';
        }
        
        return userData;
      })
    );
  }

  async enrichPosts(posts, userId) {
    const Like = require('../models/Like');
    const Bookmark = require('../models/Bookmark');
    
    return await Promise.all(
      posts.map(async (post) => {
        const postData = post.toJSON();
        
        if (userId) {
          const [isLiked, isSaved] = await Promise.all([
            Like.findOne({ where: { userId, postId: post.id } }),
            Bookmark.findOne({ where: { userId, postId: post.id } }),
          ]);
          
          postData.isLiked = !!isLiked;
          postData.isSaved = !!isSaved;
        }
        
        return postData;
      })
    );
  }

  async enrichGroups(groups, userId) {
    const GroupMember = require('../models/GroupMember');
    
    return await Promise.all(
      groups.map(async (group) => {
        const groupData = group.toJSON();
        
        if (userId) {
          const membership = await GroupMember.findOne({
            where: { groupId: group.id, userId },
          });
          
          groupData.isMember = !!membership;
          groupData.memberRole = membership?.role;
        }
        
        return groupData;
      })
    );
  }
}

module.exports = new SearchController();