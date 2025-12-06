const Joi = require('joi');
const { customValidators } = require('./validate');

/**
 * User validation schemas
 */
const userValidators = {
  // Register schema
  register: Joi.object({
    username: Joi.string()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_.]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Username can only contain letters, numbers, underscores, and dots',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot be longer than 50 characters',
      }),
    
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
      }),
    
    password: customValidators.password.required(),
    
    fullName: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s]+$/)
      .messages({
        'string.pattern.base': 'Full name can only contain letters and spaces',
      }),
    
    profilePicture: Joi.string().uri(),
    
    bio: Joi.string().max(500),
  }),

  // Login schema
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    rememberMe: Joi.boolean().default(false),
  }),

  // Update profile schema
  updateProfile: Joi.object({
    fullName: Joi.string().min(2).max(100),
    bio: Joi.string().max(500),
    profilePicture: Joi.string().uri(),
    website: Joi.string().uri(),
    location: Joi.string().max(100),
  }),

  // Change password schema
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: customValidators.password.required(),
    confirmPassword: Joi.string()
      .valid(Joi.ref('newPassword'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
      }),
  }),

  // Forgot password schema
  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  // Reset password schema
  resetPassword: Joi.object({
    password: customValidators.password.required(),
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
      }),
  }),
};

/**
 * Post validation schemas
 */
const postValidators = {
  // Create post schema
  createPost: Joi.object({
    content: Joi.string()
      .max(10000)
      .when('type', {
        is: 'text',
        then: Joi.required(),
        otherwise: Joi.optional(),
      }),
    
    type: Joi.string()
      .valid('text', 'image', 'video', 'poll', 'link', 'shared')
      .default('text'),
    
    mediaUrls: Joi.array()
      .items(Joi.string().uri())
      .max(10)
      .when('type', {
        is: Joi.valid('image', 'video'),
        then: Joi.required(),
      }),
    
    pollQuestion: Joi.string()
      .max(500)
      .when('type', {
        is: 'poll',
        then: Joi.required(),
      }),
    
    pollOptions: Joi.array()
      .items(Joi.string().max(200))
      .min(2)
      .max(10)
      .when('type', {
        is: 'poll',
        then: Joi.required(),
      }),
    
    pollEndsAt: Joi.date()
      .greater('now')
      .when('type', {
        is: 'poll',
        then: Joi.required(),
      }),
    
    linkPreview: Joi.object({
      url: Joi.string().uri().required(),
      title: Joi.string().max(200),
      description: Joi.string().max(500),
      image: Joi.string().uri(),
    }).when('type', {
      is: 'link',
      then: Joi.required(),
    }),
    
    sharedPostId: Joi.string()
      .guid({ version: 'uuidv4' })
      .when('type', {
        is: 'shared',
        then: Joi.required(),
      }),
    
    privacy: Joi.string()
      .valid('public', 'friends', 'private', 'group')
      .default('public'),
    
    location: Joi.string().max(200),
    
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    
    tags: Joi.array().items(Joi.string().max(50)),
    mentions: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })),
    
    scheduledAt: Joi.date().greater('now'),
  }),

  // Update post schema
  updatePost: Joi.object({
    content: Joi.string().max(10000),
    privacy: Joi.string().valid('public', 'friends', 'private', 'group'),
    tags: Joi.array().items(Joi.string().max(50)),
    mentions: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })),
  }),

  // Comment schema
  comment: Joi.object({
    content: Joi.string().min(1).max(5000).required(),
    parentId: Joi.string().guid({ version: 'uuidv4' }),
    mentions: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })),
  }),

  // Search posts schema
  searchPosts: Joi.object({
    q: Joi.string().min(1).max(100).required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sortBy: Joi.string().valid('recent', 'popular', 'trending').default('recent'),
    filters: Joi.object({
      userId: Joi.string().guid({ version: 'uuidv4' }),
      type: Joi.string().valid('text', 'image', 'video', 'poll', 'link', 'shared'),
      dateFrom: Joi.date(),
      dateTo: Joi.date(),
    }),
  }),
};

/**
 * Group validation schemas
 */
const groupValidators = {
  // Create group schema
  createGroup: Joi.object({
    name: Joi.string().min(3).max(100).required(),
    description: Joi.string().max(1000),
    privacy: Joi.string().valid('public', 'private', 'secret').default('public'),
    coverImage: Joi.string().uri(),
    category: Joi.string().max(50),
    tags: Joi.array().items(Joi.string().max(50)),
    rules: Joi.string().max(2000),
    location: Joi.string().max(200),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
  }),

  // Update group schema
  updateGroup: Joi.object({
    name: Joi.string().min(3).max(100),
    description: Joi.string().max(1000),
    privacy: Joi.string().valid('public', 'private', 'secret'),
    coverImage: Joi.string().uri(),
    category: Joi.string().max(50),
    tags: Joi.array().items(Joi.string().max(50)),
    rules: Joi.string().max(2000),
    location: Joi.string().max(200),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
  }),

  // Invite members schema
  inviteMembers: Joi.object({
    userIds: Joi.array()
      .items(Joi.string().guid({ version: 'uuidv4' }))
      .min(1)
      .max(50)
      .required(),
    message: Joi.string().max(500),
  }),

  // Update member role schema
  updateMemberRole: Joi.object({
    role: Joi.string()
      .valid('member', 'moderator', 'admin')
      .required(),
  }),

  // Group post schema
  groupPost: Joi.object({
    content: Joi.string().max(10000).required(),
    type: Joi.string()
      .valid('text', 'image', 'video', 'poll', 'link')
      .default('text'),
    mediaUrls: Joi.array().items(Joi.string().uri()).max(10),
    tags: Joi.array().items(Joi.string().max(50)),
    mentions: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })),
  }),

  // Group event schema
  groupEvent: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(2000),
    startDate: Joi.date().greater('now').required(),
    endDate: Joi.date().greater(Joi.ref('startDate')).required(),
    location: Joi.string().max(200),
    isOnline: Joi.boolean().default(false),
    onlineLink: Joi.string().uri().when('isOnline', {
      is: true,
      then: Joi.required(),
    }),
    maxAttendees: Joi.number().integer().min(1),
  }),
};

/**
 * Event validation schemas
 */
const eventValidators = {
  // Create event schema
  createEvent: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(2000),
    startDate: Joi.date().greater('now').required(),
    endDate: Joi.date().greater(Joi.ref('startDate')).required(),
    location: Joi.string().max(200),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    isOnline: Joi.boolean().default(false),
    onlineLink: Joi.string().uri().when('isOnline', {
      is: true,
      then: Joi.required(),
    }),
    maxAttendees: Joi.number().integer().min(1),
    category: Joi.string().max(50),
    tags: Joi.array().items(Joi.string().max(50)),
    coverImage: Joi.string().uri(),
    privacy: Joi.string().valid('public', 'private').default('public'),
  }),

  // Update event schema
  updateEvent: Joi.object({
    title: Joi.string().min(3).max(200),
    description: Joi.string().max(2000),
    startDate: Joi.date().greater('now'),
    endDate: Joi.date().greater(Joi.ref('startDate')),
    location: Joi.string().max(200),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    isOnline: Joi.boolean(),
    onlineLink: Joi.string().uri(),
    maxAttendees: Joi.number().integer().min(1),
    category: Joi.string().max(50),
    tags: Joi.array().items(Joi.string().max(50)),
    coverImage: Joi.string().uri(),
    privacy: Joi.string().valid('public', 'private'),
  }),

  // Event query schema
  eventQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    category: Joi.string().max(50),
    location: Joi.string().max(200),
    dateFrom: Joi.date(),
    dateTo: Joi.date(),
    isOnline: Joi.boolean(),
    search: Joi.string().max(100),
    sortBy: Joi.string()
      .valid('startDate', 'createdAt', 'attendeesCount', 'viewsCount')
      .default('startDate'),
    sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('ASC'),
  }),

  // User events query schema
  userEventsQuery: Joi.object({
    type: Joi.string()
      .valid('upcoming', 'past', 'organized', 'attending')
      .default('upcoming'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
  }),
};

/**
 * Message validation schemas
 */
const messageValidators = {
  // Send message schema
  sendMessage: Joi.object({
    content: Joi.string().max(5000).required(),
    type: Joi.string()
      .valid('text', 'image', 'video', 'audio', 'file', 'location')
      .default('text'),
    mediaUrl: Joi.string().uri(),
    fileName: Joi.string().max(255),
    fileSize: Joi.number().integer().min(0),
    mimeType: Joi.string().max(100),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    replyTo: Joi.string().guid({ version: 'uuidv4' }),
  }),

  // Create conversation schema
  createConversation: Joi.object({
    userIds: Joi.array()
      .items(Joi.string().guid({ version: 'uuidv4' }))
      .min(1)
      .max(50)
      .required(),
    name: Joi.string().max(100),
    isGroup: Joi.boolean().default(false),
    avatar: Joi.string().uri(),
  }),

  // Update conversation schema
  updateConversation: Joi.object({
    name: Joi.string().max(100),
    avatar: Joi.string().uri(),
    description: Joi.string().max(500),
  }),
};

/**
 * File upload validation schemas
 */
const fileUploadValidators = {
  // Single file upload
  singleFile: Joi.object({
    fieldname: Joi.string().required(),
    originalname: Joi.string().required(),
    encoding: Joi.string().required(),
    mimetype: Joi.string().required(),
    size: Joi.number().integer().min(1).required(),
    destination: Joi.string(),
    filename: Joi.string(),
    path: Joi.string(),
  }),

  // Multiple files upload
  multipleFiles: Joi.array().items(
    Joi.object({
      fieldname: Joi.string().required(),
      originalname: Joi.string().required(),
      encoding: Joi.string().required(),
      mimetype: Joi.string().required(),
      size: Joi.number().integer().min(1).required(),
      destination: Joi.string(),
      filename: Joi.string(),
      path: Joi.string(),
    })
  ),
};

/**
 * Search validation schemas
 */
const searchValidators = {
  // Global search
  globalSearch: Joi.object({
    q: Joi.string().min(1).max(100).required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    types: Joi.array()
      .items(Joi.string().valid('users', 'posts', 'groups', 'events'))
      .default(['users', 'posts', 'groups', 'events']),
  }),

  // User search
  userSearch: Joi.object({
    q: Joi.string().min(1).max(100).required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20),
    excludeId: Joi.string().guid({ version: 'uuidv4' }),
  }),

  // Post search
  postSearch: Joi.object({
    q: Joi.string().min(1).max(100).required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    filters: Joi.object({
      userId: Joi.string().guid({ version: 'uuidv4' }),
      type: Joi.string().valid('text', 'image', 'video', 'poll', 'link', 'shared'),
      dateFrom: Joi.date(),
      dateTo: Joi.date(),
    }),
  }),
};

/**
 * Notification validation schemas
 */
const notificationValidators = {
  // Update notification settings
  updateSettings: Joi.object({
    emailNotifications: Joi.boolean().default(true),
    pushNotifications: Joi.boolean().default(true),
    inAppNotifications: Joi.boolean().default(true),
    notificationTypes: Joi.object({
      likes: Joi.boolean().default(true),
      comments: Joi.boolean().default(true),
      follows: Joi.boolean().default(true),
      mentions: Joi.boolean().default(true),
      shares: Joi.boolean().default(true),
      messages: Joi.boolean().default(true),
      events: Joi.boolean().default(true),
      groups: Joi.boolean().default(true),
    }),
  }),
};

/**
 * Admin validation schemas
 */
const adminValidators = {
  // Update user role
  updateUserRole: Joi.object({
    role: Joi.string()
      .valid('user', 'admin', 'moderator')
      .required(),
  }),

  // Ban user
  banUser: Joi.object({
    reason: Joi.string().max(500).required(),
    duration: Joi.number().integer().min(1), // in days
    permanent: Joi.boolean().default(false),
  }),

  // Take action on content
  contentAction: Joi.object({
    action: Joi.string()
      .valid('remove', 'warn', 'suspend')
      .required(),
    reason: Joi.string().max(500).required(),
    notifyUser: Joi.boolean().default(true),
  }),
};

/**
 * Export all validators
 */
module.exports = {
  userValidators,
  postValidators,
  groupValidators,
  eventValidators,
  messageValidators,
  fileUploadValidators,
  searchValidators,
  notificationValidators,
  adminValidators,
};