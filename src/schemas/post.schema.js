const Joi = require('joi');
const { customValidators } = require('../utils/validate');

/**
 * Post validation schemas for Joi
 */
const postSchemas = {
  // Create post
  createPost: Joi.object({
    content: Joi.string()
      .max(10000)
      .when('type', {
        is: 'text',
        then: Joi.required(),
        otherwise: Joi.optional(),
      })
      .messages({
        'string.max': 'Content cannot exceed 10000 characters',
        'any.required': 'Content is required for text posts',
      }),
    
    type: Joi.string()
      .valid('text', 'image', 'video', 'poll', 'link', 'shared')
      .default('text')
      .messages({
        'any.only': 'Invalid post type',
      }),
    
    mediaUrls: Joi.array()
      .items(Joi.string().uri())
      .max(10)
      .when('type', {
        is: Joi.valid('image', 'video'),
        then: Joi.required().messages({
          'any.required': 'Media URLs are required for image/video posts',
        }),
      })
      .messages({
        'array.max': 'Maximum 10 media files allowed',
      }),
    
    pollQuestion: Joi.string()
      .max(500)
      .when('type', {
        is: 'poll',
        then: Joi.required().messages({
          'any.required': 'Poll question is required',
        }),
      })
      .messages({
        'string.max': 'Poll question cannot exceed 500 characters',
      }),
    
    pollOptions: Joi.array()
      .items(Joi.string().max(200))
      .min(2)
      .max(10)
      .when('type', {
        is: 'poll',
        then: Joi.required().messages({
          'any.required': 'Poll options are required',
        }),
      })
      .messages({
        'array.min': 'At least 2 poll options required',
        'array.max': 'Maximum 10 poll options allowed',
        'string.max': 'Poll option cannot exceed 200 characters',
      }),
    
    pollEndsAt: Joi.date()
      .greater('now')
      .when('type', {
        is: 'poll',
        then: Joi.required().messages({
          'any.required': 'Poll end date is required',
        }),
      })
      .messages({
        'date.greater': 'Poll end date must be in the future',
      }),
    
    linkPreview: Joi.object({
      url: Joi.string().uri().required()
        .messages({
          'string.uri': 'Invalid URL format',
          'any.required': 'URL is required for link preview',
        }),
      
      title: Joi.string().max(200),
      
      description: Joi.string().max(500),
      
      image: Joi.string().uri(),
      
      domain: Joi.string(),
    })
    .when('type', {
      is: 'link',
      then: Joi.required().messages({
        'any.required': 'Link preview is required for link posts',
      }),
    }),
    
    sharedPostId: Joi.string()
      .guid({ version: 'uuidv4' })
      .when('type', {
        is: 'shared',
        then: Joi.required().messages({
          'any.required': 'Shared post ID is required',
        }),
      })
      .messages({
        'string.guid': 'Invalid post ID format',
      }),
    
    privacy: Joi.string()
      .valid('public', 'friends', 'private', 'group')
      .default('public')
      .messages({
        'any.only': 'Invalid privacy setting',
      }),
    
    location: Joi.string().max(200),
    
    latitude: Joi.number().min(-90).max(90),
    
    longitude: Joi.number().min(-180).max(180),
    
    tags: Joi.array().items(Joi.string().max(50))
      .messages({
        'string.max': 'Tag cannot exceed 50 characters',
      }),
    
    mentions: Joi.array().items(Joi.string().guid({ version: 'uuidv4' }))
      .messages({
        'string.guid': 'Invalid user ID format in mentions',
      }),
    
    hashtags: Joi.array().items(Joi.string().max(50))
      .messages({
        'string.max': 'Hashtag cannot exceed 50 characters',
      }),
    
    scheduledAt: Joi.date().greater('now')
      .messages({
        'date.greater': 'Scheduled time must be in the future',
      }),
    
    groupId: Joi.string().guid({ version: 'uuidv4' }),
    
    eventId: Joi.string().guid({ version: 'uuidv4' }),
    
    metadata: Joi.object(),
  }),

  // Update post
  updatePost: Joi.object({
    content: Joi.string().max(10000)
      .messages({
        'string.max': 'Content cannot exceed 10000 characters',
      }),
    
    privacy: Joi.string().valid('public', 'friends', 'private', 'group'),
    
    tags: Joi.array().items(Joi.string().max(50)),
    
    mentions: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })),
    
    hashtags: Joi.array().items(Joi.string().max(50)),
    
    location: Joi.string().max(200),
    
    latitude: Joi.number().min(-90).max(90),
    
    longitude: Joi.number().min(-180).max(180),
    
    mediaUrls: Joi.array().items(Joi.string().uri()).max(10),
    
    pollQuestion: Joi.string().max(500),
    
    pollOptions: Joi.array().items(Joi.string().max(200)).min(2).max(10),
    
    pollEndsAt: Joi.date().greater('now'),
    
    isPublished: Joi.boolean(),
    
    isArchived: Joi.boolean(),
  }),

  // Get posts
  getPosts: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(10),
    
    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt', 'likesCount', 'commentsCount', 'viewsCount')
      .default('createdAt'),
    
    sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC'),
    
    type: Joi.string()
      .valid('text', 'image', 'video', 'poll', 'link', 'shared', 'all')
      .default('all'),
    
    privacy: Joi.string().valid('public', 'friends', 'private', 'group', 'all'),
    
    userId: Joi.string().guid({ version: 'uuidv4' }),
    
    groupId: Joi.string().guid({ version: 'uuidv4' }),
    
    eventId: Joi.string().guid({ version: 'uuidv4' }),
    
    hashtag: Joi.string(),
    
    search: Joi.string().max(100),
    
    dateFrom: Joi.date(),
    
    dateTo: Joi.date(),
    
    includeDeleted: Joi.boolean().default(false),
    
    includeArchived: Joi.boolean().default(false),
  }),

  // Get post by ID
  getPostById: Joi.object({
    id: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
  }),

  // Like post
  likePost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
  }),

  // Unlike post
  unlikePost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
  }),

  // Share post
  sharePost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
    
    content: Joi.string().max(5000),
    
    privacy: Joi.string()
      .valid('public', 'friends', 'private', 'group')
      .default('public'),
    
    groupId: Joi.string().guid({ version: 'uuidv4' }),
    
    eventId: Joi.string().guid({ version: 'uuidv4' }),
  }),

  // Save post (bookmark)
  savePost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
    
    folder: Joi.string().max(50),
  }),

  // Unsave post
  unsavePost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
  }),

  // Report post
  reportPost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
    
    reason: Joi.string()
      .valid('spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'false_info', 'other')
      .required()
      .messages({
        'any.required': 'Report reason is required',
      }),
    
    description: Joi.string().max(1000),
    
    evidence: Joi.array().items(Joi.string().uri()).max(5),
  }),

  // Get post likes
  getPostLikes: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('createdAt', 'username')
      .default('createdAt'),
  }),

  // Get post shares
  getPostShares: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('createdAt', 'sharesCount')
      .default('createdAt'),
  }),

  // Get post saves
  getPostSaves: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('createdAt', 'username')
      .default('createdAt'),
  }),

  // Get post analytics
  getPostAnalytics: Joi.object({
    dateRange: Joi.string()
      .valid('day', 'week', 'month', 'quarter', 'year', 'all')
      .default('week'),
    
    metrics: Joi.array()
      .items(Joi.string().valid('views', 'likes', 'comments', 'shares', 'reach', 'engagement'))
      .default(['views', 'likes', 'comments', 'shares']),
  }),

  // Vote on poll
  voteOnPoll: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
    
    optionId: Joi.number().integer().min(0).required()
      .messages({
        'any.required': 'Option ID is required',
      }),
  }),

  // Get poll results
  getPollResults: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
    
    includeVoters: Joi.boolean().default(false),
  }),

  // Pin post
  pinPost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
    
    position: Joi.number().integer().min(1).max(5).default(1),
  }),

  // Unpin post
  unpinPost: Joi.object({
    postId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid post ID format',
        'any.required': 'Post ID is required',
      }),
  }),

  // Get trending posts
  getTrendingPosts: Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(10),
    
    timeRange: Joi.string()
      .valid('hour', 'day', 'week', 'month')
      .default('day'),
    
    type: Joi.string()
      .valid('all', 'text', 'image', 'video', 'poll', 'link')
      .default('all'),
    
    category: Joi.string(),
  }),

  // Search posts
  searchPosts: Joi.object({
    q: Joi.string().min(1).max(100).required()
      .messages({
        'any.required': 'Search query is required',
      }),
    
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(10),
    
    sortBy: Joi.string()
      .valid('relevance', 'date', 'popularity')
      .default('relevance'),
    
    filters: Joi.object({
      userId: Joi.string().guid({ version: 'uuidv4' }),
      
      type: Joi.string().valid('text', 'image', 'video', 'poll', 'link', 'shared'),
      
      dateFrom: Joi.date(),
      
      dateTo: Joi.date(),
      
      hashtag: Joi.string(),
      
      location: Joi.string(),
      
      minLikes: Joi.number().integer().min(0),
      
      minComments: Joi.number().integer().min(0),
    }),
  }),

  // Get user feed
  getUserFeed: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(10),
    
    sortBy: Joi.string()
      .valid('recent', 'popular', 'trending')
      .default('recent'),
    
    filters: Joi.object({
      type: Joi.string().valid('all', 'text', 'image', 'video', 'poll', 'link'),
      
      dateFrom: Joi.date(),
      
      dateTo: Joi.date(),
      
      excludeGroups: Joi.boolean().default(false),
      
      excludeEvents: Joi.boolean().default(false),
    }),
  }),

  // Get hashtag posts
  getHashtagPosts: Joi.object({
    hashtag: Joi.string().required()
      .messages({
        'any.required': 'Hashtag is required',
      }),
    
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(10),
    
    sortBy: Joi.string()
      .valid('recent', 'popular', 'trending')
      .default('recent'),
    
    dateFrom: Joi.date(),
    
    dateTo: Joi.date(),
  }),

  // Get location posts
  getLocationPosts: Joi.object({
    latitude: Joi.number().min(-90).max(90).required()
      .messages({
        'any.required': 'Latitude is required',
      }),
    
    longitude: Joi.number().min(-180).max(180).required()
      .messages({
        'any.required': 'Longitude is required',
      }),
    
    radius: Joi.number().min(1).max(1000).default(10), // in kilometers
    
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(10),
    
    sortBy: Joi.string()
      .valid('distance', 'recent', 'popular')
      .default('distance'),
  }),
};

/**
 * Export all post schemas
 */
module.exports = postSchemas;