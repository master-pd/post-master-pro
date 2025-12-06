const Joi = require('joi');
const { customValidators } = require('../utils/validate');

/**
 * User validation schemas for Joi
 */
const userSchemas = {
  // Register user
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
        'any.required': 'Username is required',
      }),
    
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    
    password: customValidators.password.required()
      .messages({
        'any.required': 'Password is required',
      }),
    
    fullName: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s]+$/)
      .messages({
        'string.pattern.base': 'Full name can only contain letters and spaces',
      }),
    
    profilePicture: Joi.string().uri(),
    
    bio: Joi.string().max(500),
    
    website: Joi.string().uri(),
    
    location: Joi.string().max(100),
    
    dateOfBirth: Joi.date().max('now'),
  }),

  // Login
  login: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    
    password: Joi.string().required()
      .messages({
        'any.required': 'Password is required',
      }),
    
    rememberMe: Joi.boolean().default(false),
  }),

  // Update profile
  updateProfile: Joi.object({
    fullName: Joi.string().min(2).max(100),
    
    bio: Joi.string().max(500),
    
    profilePicture: Joi.string().uri(),
    
    website: Joi.string().uri(),
    
    location: Joi.string().max(100),
    
    dateOfBirth: Joi.date().max('now'),
    
    gender: Joi.string().valid('male', 'female', 'other', 'prefer-not-to-say'),
    
    language: Joi.string().length(2).default('en'),
    
    timezone: Joi.string(),
  }),

  // Change password
  changePassword: Joi.object({
    currentPassword: Joi.string().required()
      .messages({
        'any.required': 'Current password is required',
      }),
    
    newPassword: customValidators.password.required()
      .messages({
        'any.required': 'New password is required',
      }),
    
    confirmPassword: Joi.string()
      .valid(Joi.ref('newPassword'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Please confirm your password',
      }),
  }),

  // Forgot password
  forgotPassword: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
  }),

  // Reset password
  resetPassword: Joi.object({
    password: customValidators.password.required()
      .messages({
        'any.required': 'Password is required',
      }),
    
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Please confirm your password',
      }),
  }),

  // Refresh token
  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
      .messages({
        'any.required': 'Refresh token is required',
      }),
  }),

  // Verify email
  verifyEmail: Joi.object({
    token: Joi.string().required()
      .messages({
        'any.required': 'Verification token is required',
      }),
  }),

  // Update email
  updateEmail: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    
    password: Joi.string().required()
      .messages({
        'any.required': 'Password is required for email change',
      }),
  }),

  // Deactivate account
  deactivateAccount: Joi.object({
    password: Joi.string().required()
      .messages({
        'any.required': 'Password is required to deactivate account',
      }),
    
    reason: Joi.string().max(500),
    
    feedback: Joi.string().max(1000),
  }),

  // Search users
  searchUsers: Joi.object({
    q: Joi.string().min(1).max(100).required()
      .messages({
        'any.required': 'Search query is required',
      }),
    
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('relevance', 'username', 'createdAt', 'followersCount')
      .default('relevance'),
    
    sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC'),
  }),

  // Get user by ID
  getUserById: Joi.object({
    id: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Invalid user ID format',
        'any.required': 'User ID is required',
      }),
  }),

  // Follow user
  followUser: Joi.object({
    userId: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Invalid user ID format',
        'any.required': 'User ID is required',
      }),
  }),

  // Get user followers
  getUserFollowers: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('createdAt', 'username')
      .default('createdAt'),
  }),

  // Get user following
  getUserFollowing: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('createdAt', 'username')
      .default('createdAt'),
  }),

  // Update notification settings
  updateNotificationSettings: Joi.object({
    emailNotifications: Joi.object({
      enabled: Joi.boolean().default(true),
      
      likes: Joi.boolean().default(true),
      
      comments: Joi.boolean().default(true),
      
      follows: Joi.boolean().default(true),
      
      mentions: Joi.boolean().default(true),
      
      shares: Joi.boolean().default(true),
      
      messages: Joi.boolean().default(true),
      
      events: Joi.boolean().default(true),
      
      groups: Joi.boolean().default(true),
    }),
    
    pushNotifications: Joi.object({
      enabled: Joi.boolean().default(true),
      
      likes: Joi.boolean().default(true),
      
      comments: Joi.boolean().default(true),
      
      follows: Joi.boolean().default(true),
      
      mentions: Joi.boolean().default(true),
      
      messages: Joi.boolean().default(true),
    }),
    
    inAppNotifications: Joi.object({
      enabled: Joi.boolean().default(true),
      
      all: Joi.boolean().default(true),
    }),
  }),

  // Update privacy settings
  updatePrivacySettings: Joi.object({
    profileVisibility: Joi.string()
      .valid('public', 'friends', 'private')
      .default('public'),
    
    showOnlineStatus: Joi.boolean().default(true),
    
    showLastSeen: Joi.boolean().default(true),
    
    allowTagging: Joi.boolean().default(true),
    
    allowSharing: Joi.boolean().default(true),
    
    searchEngineIndexing: Joi.boolean().default(true),
    
    dataSharing: Joi.boolean().default(false),
  }),

  // Update security settings
  updateSecuritySettings: Joi.object({
    twoFactorAuth: Joi.boolean().default(false),
    
    loginAlerts: Joi.boolean().default(true),
    
    sessionManagement: Joi.object({
      maxSessions: Joi.number().integer().min(1).max(10).default(5),
      
      autoLogout: Joi.number().integer().min(5).max(1440).default(60), // minutes
    }),
    
    trustedDevices: Joi.array().items(Joi.string()),
  }),

  // Get user activity
  getUserActivity: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(20),
    
    type: Joi.string()
      .valid('all', 'posts', 'likes', 'comments', 'follows', 'shares')
      .default('all'),
    
    dateFrom: Joi.date(),
    
    dateTo: Joi.date(),
  }),

  // Report user
  reportUser: Joi.object({
    reason: Joi.string()
      .valid('spam', 'harassment', 'hate_speech', 'violence', 'fake_account', 'other')
      .required()
      .messages({
        'any.required': 'Report reason is required',
      }),
    
    description: Joi.string().max(1000),
    
    evidence: Joi.array().items(Joi.string().uri()).max(5),
  }),

  // Block user
  blockUser: Joi.object({
    userId: Joi.string().uuid().required()
      .messages({
        'string.guid': 'Invalid user ID format',
        'any.required': 'User ID is required',
      }),
    
    reason: Joi.string().max(500),
  }),

  // Get blocked users
  getBlockedUsers: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(20),
  }),

  // Export user data
  exportUserData: Joi.object({
    format: Joi.string()
      .valid('json', 'csv', 'pdf')
      .default('json'),
    
    include: Joi.array()
      .items(Joi.string().valid('profile', 'posts', 'messages', 'activity', 'connections'))
      .default(['profile', 'posts', 'activity']),
  }),

  // Validate username
  validateUsername: Joi.object({
    username: Joi.string()
      .min(3)
      .max(50)
      .pattern(/^[a-zA-Z0-9_.]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Username can only contain letters, numbers, underscores, and dots',
        'any.required': 'Username is required',
      }),
  }),

  // Validate email
  validateEmail: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
  }),
};

/**
 * Export all user schemas
 */
module.exports = userSchemas;