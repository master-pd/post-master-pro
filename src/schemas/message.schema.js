const Joi = require('joi');
const { customValidators } = require('../utils/validate');

/**
 * Message validation schemas for Joi
 */
const messageSchemas = {
  // Send message
  sendMessage: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' })
      .messages({
        'string.guid': 'Invalid conversation ID format',
      }),
    
    recipientId: Joi.string().guid({ version: 'uuidv4' })
      .when('conversationId', {
        is: Joi.exist(),
        then: Joi.forbidden(),
        otherwise: Joi.required(),
      })
      .messages({
        'string.guid': 'Invalid recipient ID format',
        'any.required': 'Recipient ID is required for new conversations',
      }),
    
    content: Joi.string()
      .max(5000)
      .when('type', {
        is: 'text',
        then: Joi.required(),
        otherwise: Joi.optional(),
      })
      .messages({
        'string.max': 'Message cannot exceed 5000 characters',
        'any.required': 'Content is required for text messages',
      }),
    
    type: Joi.string()
      .valid('text', 'image', 'video', 'audio', 'file', 'location', 'system')
      .default('text')
      .messages({
        'any.only': 'Invalid message type',
      }),
    
    mediaUrl: Joi.string().uri()
      .when('type', {
        is: Joi.valid('image', 'video', 'audio', 'file'),
        then: Joi.required().messages({
          'any.required': 'Media URL is required for media messages',
        }),
      })
      .messages({
        'string.uri': 'Invalid media URL format',
      }),
    
    fileName: Joi.string().max(255),
    
    fileSize: Joi.number().integer().min(0),
    
    mimeType: Joi.string().max(100),
    
    latitude: Joi.number().min(-90).max(90)
      .when('type', {
        is: 'location',
        then: Joi.required().messages({
          'any.required': 'Latitude is required for location messages',
        }),
      }),
    
    longitude: Joi.number().min(-180).max(180)
      .when('type', {
        is: 'location',
        then: Joi.required().messages({
          'any.required': 'Longitude is required for location messages',
        }),
      }),
    
    replyTo: Joi.string().guid({ version: 'uuidv4' }),
    
    metadata: Joi.object(),
  }),

  // Create conversation
  createConversation: Joi.object({
    userIds: Joi.array()
      .items(Joi.string().guid({ version: 'uuidv4' }))
      .min(1)
      .max(50)
      .required()
      .messages({
        'string.guid': 'Invalid user ID format',
        'array.min': 'At least one user ID is required',
        'array.max': 'Maximum 50 users allowed',
        'any.required': 'User IDs are required',
      }),
    
    name: Joi.string().max(100)
      .when('isGroup', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
    
    isGroup: Joi.boolean().default(false),
    
    avatar: Joi.string().uri(),
    
    description: Joi.string().max(500)
      .when('isGroup', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
    
    privacy: Joi.string()
      .valid('public', 'private', 'secret')
      .default('private')
      .when('isGroup', {
        is: true,
        then: Joi.optional(),
        otherwise: Joi.forbidden(),
      }),
  }),

  // Update conversation
  updateConversation: Joi.object({
    name: Joi.string().max(100),
    
    avatar: Joi.string().uri(),
    
    description: Joi.string().max(500),
    
    privacy: Joi.string().valid('public', 'private', 'secret'),
  }),

  // Get conversations
  getConversations: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(20),
    
    sortBy: Joi.string()
      .valid('lastMessageAt', 'createdAt', 'unreadCount')
      .default('lastMessageAt'),
    
    sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC'),
    
    type: Joi.string()
      .valid('all', 'individual', 'group')
      .default('all'),
    
    search: Joi.string().max(100),
    
    unreadOnly: Joi.boolean().default(false),
    
    archived: Joi.boolean().default(false),
  }),

  // Get conversation by ID
  getConversationById: Joi.object({
    id: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
  }),

  // Get conversation messages
  getConversationMessages: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt')
      .default('createdAt'),
    
    sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC'),
    
    dateFrom: Joi.date(),
    
    dateTo: Joi.date(),
    
    type: Joi.string()
      .valid('all', 'text', 'image', 'video', 'audio', 'file', 'location')
      .default('all'),
    
    search: Joi.string().max(100),
    
    unreadOnly: Joi.boolean().default(false),
  }),

  // Mark messages as read
  markMessagesAsRead: Joi.object({
    messageIds: Joi.array()
      .items(Joi.string().guid({ version: 'uuidv4' }))
      .min(1)
      .max(100)
      .messages({
        'string.guid': 'Invalid message ID format',
        'array.min': 'At least one message ID is required',
        'array.max': 'Maximum 100 messages at once',
      }),
    
    conversationId: Joi.string().guid({ version: 'uuidv4' })
      .when('messageIds', {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.required(),
      })
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required when no message IDs provided',
      }),
    
    readAll: Joi.boolean().default(false),
  }),

  // Delete message
  deleteMessage: Joi.object({
    messageId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid message ID format',
        'any.required': 'Message ID is required',
      }),
    
    deleteForEveryone: Joi.boolean().default(false),
  }),

  // Edit message
  editMessage: Joi.object({
    messageId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid message ID format',
        'any.required': 'Message ID is required',
      }),
    
    content: Joi.string().max(5000).required()
      .messages({
        'string.max': 'Message cannot exceed 5000 characters',
        'any.required': 'Content is required',
      }),
  }),

  // React to message
  reactToMessage: Joi.object({
    messageId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid message ID format',
        'any.required': 'Message ID is required',
      }),
    
    reaction: Joi.string()
      .valid('like', 'love', 'haha', 'wow', 'sad', 'angry', 'thumbs_up', 'thumbs_down')
      .required()
      .messages({
        'any.only': 'Invalid reaction type',
        'any.required': 'Reaction is required',
      }),
  }),

  // Remove reaction
  removeReaction: Joi.object({
    messageId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid message ID format',
        'any.required': 'Message ID is required',
      }),
    
    reaction: Joi.string()
      .valid('like', 'love', 'haha', 'wow', 'sad', 'angry', 'thumbs_up', 'thumbs_down'),
  }),

  // Get message reactions
  getMessageReactions: Joi.object({
    messageId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid message ID format',
        'any.required': 'Message ID is required',
      }),
    
    reaction: Joi.string()
      .valid('like', 'love', 'haha', 'wow', 'sad', 'angry', 'thumbs_up', 'thumbs_down', 'all')
      .default('all'),
    
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),

  // Forward message
  forwardMessage: Joi.object({
    messageId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid message ID format',
        'any.required': 'Message ID is required',
      }),
    
    conversationIds: Joi.array()
      .items(Joi.string().guid({ version: 'uuidv4' }))
      .min(1)
      .max(10)
      .required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'array.min': 'At least one conversation ID is required',
        'array.max': 'Maximum 10 conversations at once',
        'any.required': 'Conversation IDs are required',
      }),
    
    addNote: Joi.string().max(500),
  }),

  // Search messages
  searchMessages: Joi.object({
    q: Joi.string().min(1).max(100).required()
      .messages({
        'any.required': 'Search query is required',
      }),
    
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(50).default(20),
    
    conversationId: Joi.string().guid({ version: 'uuidv4' }),
    
    userId: Joi.string().guid({ version: 'uuidv4' }),
    
    type: Joi.string()
      .valid('all', 'text', 'image', 'video', 'audio', 'file', 'location')
      .default('all'),
    
    dateFrom: Joi.date(),
    
    dateTo: Joi.date(),
    
    hasAttachments: Joi.boolean(),
    
    unreadOnly: Joi.boolean().default(false),
  }),

  // Archive conversation
  archiveConversation: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
    
    archive: Joi.boolean().default(true),
  }),

  // Mute conversation
  muteConversation: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
    
    mute: Joi.boolean().default(true),
    
    duration: Joi.number().integer().min(1), // in hours
  }),

  // Leave conversation
  leaveConversation: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
    
    deleteMessages: Joi.boolean().default(false),
  }),

  // Add participants to conversation
  addParticipants: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
    
    userIds: Joi.array()
      .items(Joi.string().guid({ version: 'uuidv4' }))
      .min(1)
      .max(50)
      .required()
      .messages({
        'string.guid': 'Invalid user ID format',
        'array.min': 'At least one user ID is required',
        'array.max': 'Maximum 50 users allowed',
        'any.required': 'User IDs are required',
      }),
    
    sendNotification: Joi.boolean().default(true),
  }),

  // Remove participants from conversation
  removeParticipants: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
    
    userIds: Joi.array()
      .items(Joi.string().guid({ version: 'uuidv4' }))
      .min(1)
      .max(50)
      .required()
      .messages({
        'string.guid': 'Invalid user ID format',
        'array.min': 'At least one user ID is required',
        'array.max': 'Maximum 50 users allowed',
        'any.required': 'User IDs are required',
      }),
  }),

  // Update participant role
  updateParticipantRole: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
    
    userId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid user ID format',
        'any.required': 'User ID is required',
      }),
    
    role: Joi.string()
      .valid('member', 'admin', 'moderator')
      .required()
      .messages({
        'any.only': 'Invalid role',
        'any.required': 'Role is required',
      }),
  }),

  // Get conversation participants
  getConversationParticipants: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    
    limit: Joi.number().integer().min(1).max(100).default(20),
    
    sortBy: Joi.string()
      .valid('joinedAt', 'username', 'role')
      .default('joinedAt'),
    
    search: Joi.string().max(100),
    
    role: Joi.string().valid('all', 'member', 'admin', 'moderator').default('all'),
  }),

  // Typing indicator
  typingIndicator: Joi.object({
    conversationId: Joi.string().guid({ version: 'uuidv4' }).required()
      .messages({
        'string.guid': 'Invalid conversation ID format',
        'any.required': 'Conversation ID is required',
      }),
    
    isTyping: Joi.boolean().default(true),
  }),
};

/**
 * Export all message schemas
 */
module.exports = messageSchemas;