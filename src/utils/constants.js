/**
 * Application constants
 */
module.exports = {
  // Application info
  APP_NAME: 'Post Master Pro',
  APP_VERSION: '1.0.0',
  
  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
  },
  
  // User roles
  USER_ROLES: {
    USER: 'user',
    ADMIN: 'admin',
    MODERATOR: 'moderator',
  },
  
  // User status
  USER_STATUS: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    BANNED: 'banned',
  },
  
  // Post types
  POST_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    POLL: 'poll',
    LINK: 'link',
    SHARED: 'shared',
  },
  
  // Post privacy
  POST_PRIVACY: {
    PUBLIC: 'public',
    FRIENDS: 'friends',
    PRIVATE: 'private',
    GROUP: 'group',
  },
  
  // Group privacy
  GROUP_PRIVACY: {
    PUBLIC: 'public',
    PRIVATE: 'private',
    SECRET: 'secret',
  },
  
  // Group member roles
  GROUP_ROLES: {
    MEMBER: 'member',
    MODERATOR: 'moderator',
    ADMIN: 'admin',
  },
  
  // Event privacy
  EVENT_PRIVACY: {
    PUBLIC: 'public',
    PRIVATE: 'private',
  },
  
  // Event categories
  EVENT_CATEGORIES: [
    'Social',
    'Networking',
    'Education',
    'Entertainment',
    'Sports',
    'Business',
    'Technology',
    'Arts',
    'Music',
    'Food',
    'Health',
    'Fitness',
    'Travel',
    'Charity',
    'Other',
  ],
  
  // Message types
  MESSAGE_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    AUDIO: 'audio',
    FILE: 'file',
    LOCATION: 'location',
  },
  
  // Notification types
  NOTIFICATION_TYPES: {
    LIKE: 'like',
    COMMENT: 'comment',
    FOLLOW: 'follow',
    MENTION: 'mention',
    SHARE: 'share',
    MESSAGE: 'message',
    EVENT: 'event',
    GROUP: 'group',
    FRIEND_REQUEST: 'friend_request',
    INVITATION: 'invitation',
    SYSTEM: 'system',
  },
  
  // File upload limits (in bytes)
  FILE_LIMITS: {
    MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_VIDEO_SIZE: 100 * 1024 * 1024, // 100MB
    MAX_AUDIO_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_DOCUMENT_SIZE: 25 * 1024 * 1024, // 25MB
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  },
  
  // Allowed file types
  ALLOWED_FILE_TYPES: {
    IMAGES: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ],
    VIDEOS: [
      'video/mp4',
      'video/mpeg',
      'video/ogg',
      'video/webm',
      'video/quicktime',
    ],
    AUDIO: [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
    ],
    DOCUMENTS: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
    ],
  },
  
  // Cache TTLs (in seconds)
  CACHE_TTL: {
    SHORT: 60, // 1 minute
    MEDIUM: 300, // 5 minutes
    LONG: 3600, // 1 hour
    VERY_LONG: 86400, // 1 day
    USER_DATA: 1800, // 30 minutes
    FEED_DATA: 300, // 5 minutes
    POST_DATA: 600, // 10 minutes
    SEARCH_DATA: 300, // 5 minutes
  },
  
  // Rate limiting
  RATE_LIMITS: {
    AUTH: {
      WINDOW_MS: 15 * 60 * 1000, // 15 minutes
      MAX: 10, // 10 attempts
    },
    API: {
      WINDOW_MS: 15 * 60 * 1000, // 15 minutes
      MAX: 100, // 100 requests
    },
    UPLOAD: {
      WINDOW_MS: 60 * 60 * 1000, // 1 hour
      MAX: 20, // 20 uploads
    },
    MESSAGES: {
      WINDOW_MS: 60 * 1000, // 1 minute
      MAX: 30, // 30 messages
    },
  },
  
  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
  
  // Validation limits
  VALIDATION_LIMITS: {
    USERNAME: {
      MIN: 3,
      MAX: 50,
    },
    PASSWORD: {
      MIN: 8,
      MAX: 100,
    },
    EMAIL: {
      MAX: 100,
    },
    POST_CONTENT: {
      MAX: 10000,
    },
    COMMENT_CONTENT: {
      MAX: 5000,
    },
    BIO: {
      MAX: 500,
    },
    GROUP_NAME: {
      MIN: 3,
      MAX: 100,
    },
    GROUP_DESCRIPTION: {
      MAX: 1000,
    },
    EVENT_TITLE: {
      MIN: 3,
      MAX: 200,
    },
    EVENT_DESCRIPTION: {
      MAX: 2000,
    },
  },
  
  // Regex patterns
  REGEX_PATTERNS: {
    USERNAME: /^[a-zA-Z0-9_.]+$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE: /^[+]?[\d\s\-()]+$/,
    URL: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
    HASHTAG: /#(\w+)/g,
    MENTION: /@(\w+)/g,
    HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  },
  
  // Error codes
  ERROR_CODES: {
    // Authentication errors
    AUTH_INVALID_CREDENTIALS: 'AUTH_001',
    AUTH_TOKEN_EXPIRED: 'AUTH_002',
    AUTH_TOKEN_INVALID: 'AUTH_003',
    AUTH_UNAUTHORIZED: 'AUTH_004',
    AUTH_FORBIDDEN: 'AUTH_005',
    
    // Validation errors
    VALIDATION_FAILED: 'VAL_001',
    VALIDATION_UNIQUE: 'VAL_002',
    VALIDATION_REQUIRED: 'VAL_003',
    VALIDATION_INVALID: 'VAL_004',
    
    // Resource errors
    RESOURCE_NOT_FOUND: 'RES_001',
    RESOURCE_ALREADY_EXISTS: 'RES_002',
    RESOURCE_CONFLICT: 'RES_003',
    RESOURCE_GONE: 'RES_004',
    
    // User errors
    USER_NOT_FOUND: 'USER_001',
    USER_ALREADY_EXISTS: 'USER_002',
    USER_INACTIVE: 'USER_003',
    USER_SUSPENDED: 'USER_004',
    USER_BANNED: 'USER_005',
    
    // Post errors
    POST_NOT_FOUND: 'POST_001',
    POST_ACCESS_DENIED: 'POST_002',
    POST_ALREADY_LIKED: 'POST_003',
    POST_NOT_LIKED: 'POST_004',
    
    // Group errors
    GROUP_NOT_FOUND: 'GROUP_001',
    GROUP_ACCESS_DENIED: 'GROUP_002',
    GROUP_MEMBER_EXISTS: 'GROUP_003',
    GROUP_NOT_MEMBER: 'GROUP_004',
    GROUP_ROLE_INSUFFICIENT: 'GROUP_005',
    
    // Event errors
    EVENT_NOT_FOUND: 'EVENT_001',
    EVENT_ACCESS_DENIED: 'EVENT_002',
    EVENT_ALREADY_ATTENDING: 'EVENT_003',
    EVENT_NOT_ATTENDING: 'EVENT_004',
    EVENT_FULL: 'EVENT_005',
    
    // File errors
    FILE_TOO_LARGE: 'FILE_001',
    FILE_INVALID_TYPE: 'FILE_002',
    FILE_UPLOAD_FAILED: 'FILE_003',
    FILE_NOT_FOUND: 'FILE_004',
    
    // Rate limit errors
    RATE_LIMIT_EXCEEDED: 'RATE_001',
    
    // Server errors
    SERVER_ERROR: 'SERVER_001',
    DATABASE_ERROR: 'SERVER_002',
    CACHE_ERROR: 'SERVER_003',
    EXTERNAL_SERVICE_ERROR: 'SERVER_004',
  },
  
  // Success messages
  SUCCESS_MESSAGES: {
    // General
    OPERATION_SUCCESSFUL: 'Operation completed successfully',
    CREATED_SUCCESSFULLY: 'Created successfully',
    UPDATED_SUCCESSFULLY: 'Updated successfully',
    DELETED_SUCCESSFULLY: 'Deleted successfully',
    RETRIEVED_SUCCESSFULLY: 'Retrieved successfully',
    
    // Authentication
    LOGIN_SUCCESSFUL: 'Login successful',
    REGISTER_SUCCESSFUL: 'Registration successful',
    LOGOUT_SUCCESSFUL: 'Logged out successfully',
    PASSWORD_CHANGED: 'Password changed successfully',
    EMAIL_VERIFIED: 'Email verified successfully',
    
    // Posts
    POST_CREATED: 'Post created successfully',
    POST_UPDATED: 'Post updated successfully',
    POST_DELETED: 'Post deleted successfully',
    POST_LIKED: 'Post liked successfully',
    POST_UNLIKED: 'Post unliked successfully',
    POST_SHARED: 'Post shared successfully',
    
    // Comments
    COMMENT_CREATED: 'Comment created successfully',
    COMMENT_UPDATED: 'Comment updated successfully',
    COMMENT_DELETED: 'Comment deleted successfully',
    
    // Groups
    GROUP_CREATED: 'Group created successfully',
    GROUP_UPDATED: 'Group updated successfully',
    GROUP_DELETED: 'Group deleted successfully',
    GROUP_JOINED: 'Joined group successfully',
    GROUP_LEFT: 'Left group successfully',
    MEMBER_REMOVED: 'Member removed successfully',
    
    // Events
    EVENT_CREATED: 'Event created successfully',
    EVENT_UPDATED: 'Event updated successfully',
    EVENT_DELETED: 'Event deleted successfully',
    EVENT_JOINED: 'Joined event successfully',
    EVENT_LEFT: 'Left event successfully',
    
    // Messages
    MESSAGE_SENT: 'Message sent successfully',
    CONVERSATION_CREATED: 'Conversation created successfully',
    
    // Files
    FILE_UPLOADED: 'File uploaded successfully',
    FILE_DELETED: 'File deleted successfully',
  },
  
  // Queue names
  QUEUE_NAMES: {
    EMAIL: 'email',
    NOTIFICATION: 'notification',
    VIDEO_PROCESSING: 'video_processing',
    IMAGE_PROCESSING: 'image_processing',
    ANALYTICS: 'analytics',
    BACKUP: 'backup',
  },
  
  // Job priorities
  JOB_PRIORITIES: {
    LOW: 10,
    NORMAL: 0,
    MEDIUM: -5,
    HIGH: -10,
    CRITICAL: -20,
  },
  
  // Socket events
  SOCKET_EVENTS: {
    // Connection events
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
    
    // Message events
    MESSAGE_SENT: 'message:sent',
    MESSAGE_RECEIVED: 'message:received',
    MESSAGE_DELIVERED: 'message:delivered',
    MESSAGE_READ: 'message:read',
    
    // Notification events
    NOTIFICATION: 'notification',
    
    // Post events
    POST_CREATED: 'post:created',
    POST_UPDATED: 'post:updated',
    POST_DELETED: 'post:deleted',
    POST_LIKED: 'post:liked',
    POST_COMMENTED: 'post:commented',
    
    // User events
    USER_ONLINE: 'user:online',
    USER_OFFLINE: 'user:offline',
    USER_TYPING: 'user:typing',
    
    // Group events
    GROUP_JOINED: 'group:joined',
    GROUP_LEFT: 'group:left',
    GROUP_UPDATED: 'group:updated',
    
    // Event events
    EVENT_CREATED: 'event:created',
    EVENT_UPDATED: 'event:updated',
    EVENT_JOINED: 'event:joined',
    
    // System events
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
  },
  
  // Environment
  ENVIRONMENTS: {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test',
    STAGING: 'staging',
  },
};