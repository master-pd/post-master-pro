const { Op } = require('sequelize');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const ConversationMember = require('../models/ConversationMember');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const chatService = require('../services/chat.service');
const notificationService = require('../services/notification.service');
const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');

class ChatController {
  // Get user conversations
  getConversations = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;
    
    const result = await chatService.getUserConversations(
      userId,
      parseInt(page),
      parseInt(limit),
      type
    );
    
    new ApiResponse(res, 200, 'Conversations retrieved successfully', {
      conversations: result.conversations,
      pagination: result.pagination,
    });
  });

  // Get single conversation
  getConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    const conversation = await Conversation.findByPk(conversationId, {
      include: [
        {
          model: ConversationMember,
          as: 'members',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'fullName', 'profilePicture', 'isOnline'],
          }],
        },
        {
          model: Message,
          as: 'lastMessage',
          include: [{
            model: User,
            as: 'sender',
            attributes: ['id', 'username', 'profilePicture'],
          }],
        },
      ],
    });
    
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found');
    }
    
    // Check if user is a member
    const isMember = await ConversationMember.findOne({
      where: { conversationId, userId },
    });
    
    if (!isMember) {
      throw new ApiError(403, 'Access denied to this conversation');
    }
    
    // Get unread count
    const unreadCount = await chatService.getUnreadCount(conversationId, userId);
    
    const conversationData = conversation.toJSON();
    conversationData.unreadCount = unreadCount;
    
    new ApiResponse(res, 200, 'Conversation retrieved successfully', {
      conversation: conversationData,
    });
  });

  // Create conversation
  createConversation = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { userIds, type = 'direct', name, avatar } = req.body;
    
    if (type === 'direct' && (!userIds || userIds.length !== 1)) {
      throw new ApiError(400, 'Direct conversation requires exactly one other user');
    }
    
    if (type === 'group' && (!userIds || userIds.length === 0)) {
      throw new ApiError(400, 'Group conversation requires at least one other user');
    }
    
    if (type === 'direct') {
      const otherUserId = userIds[0];
      
      // Check if conversation already exists
      const existingConversation = await chatService.getOrCreateConversation(
        userId,
        otherUserId
      );
      
      new ApiResponse(res, 200, 'Conversation retrieved successfully', {
        conversation: await this.enrichConversation(existingConversation, userId),
      });
      return;
    }
    
    // Create group conversation
    const conversation = await chatService.createGroupConversation(
      userId,
      name,
      userIds,
      avatar
    );
    
    // Notify invited users
    await notificationService.createBulkNotifications(
      userIds,
      {
        fromUserId: userId,
        type: 'group_invite',
        title: 'Group Invitation',
        body: `${req.user.username} added you to a group`,
        data: {
          groupId: conversation.id,
          conversationId: conversation.id,
        },
        priority: 'medium',
      }
    );
    
    new ApiResponse(res, 201, 'Group conversation created successfully', {
      conversation: await this.enrichConversation(conversation, userId),
    });
  });

  // Update conversation
  updateConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const updates = req.body;
    
    const conversation = await Conversation.findByPk(conversationId);
    
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found');
    }
    
    // Check permissions
    const membership = await ConversationMember.findOne({
      where: {
        conversationId,
        userId,
        role: { [Op.in]: ['admin', 'moderator'] },
      },
    });
    
    if (!membership && conversation.createdBy !== userId) {
      throw new ApiError(403, 'Insufficient permissions to update conversation');
    }
    
    await conversation.update(updates);
    
    // Notify members about update
    const members = await conversation.getOtherMembers(userId);
    members.forEach(member => {
      req.io?.to(`user:${member.userId}`).emit('conversation:updated', {
        conversationId,
        updates,
        updatedBy: userId,
      });
    });
    
    new ApiResponse(res, 200, 'Conversation updated successfully', {
      conversation: await this.enrichConversation(conversation, userId),
    });
  });

  // Delete conversation
  deleteConversation = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    const conversation = await Conversation.findByPk(conversationId);
    
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found');
    }
    
    // Check permissions
    if (conversation.type === 'direct') {
      // For direct conversations, user can only leave
      await ConversationMember.destroy({
        where: { conversationId, userId },
      });
      
      // If no members left, delete conversation
      const remainingMembers = await ConversationMember.count({
        where: { conversationId },
      });
      
      if (remainingMembers === 0) {
        await conversation.destroy();
      }
    } else {
      // For group conversations, only admins can delete
      const membership = await ConversationMember.findOne({
        where: {
          conversationId,
          userId,
          role: 'admin',
        },
      });
      
      if (!membership && conversation.createdBy !== userId) {
        throw new ApiError(403, 'Only admins can delete group conversations');
      }
      
      // Notify members
      const members = await conversation.getOtherMembers(userId);
      members.forEach(member => {
        req.io?.to(`user:${member.userId}`).emit('conversation:deleted', {
          conversationId,
          deletedBy: userId,
        });
      });
      
      await conversation.destroy();
    }
    
    new ApiResponse(res, 200, 'Conversation deleted successfully');
  });

  // Get conversation messages
  getMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50, before } = req.query;
    
    const result = await chatService.getConversationMessages(
      conversationId,
      userId,
      parseInt(page),
      parseInt(limit),
      before
    );
    
    new ApiResponse(res, 200, 'Messages retrieved successfully', {
      messages: result.messages,
      pagination: result.pagination,
    });
  });

  // Send message
  sendMessage = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { conversationId, content, type = 'text', replyTo } = req.body;
    
    const result = await chatService.sendMessage(
      userId,
      conversationId,
      content,
      type,
      req.files || [],
      replyTo
    );
    
    new ApiResponse(res, 201, 'Message sent successfully', {
      message: result.message,
    });
  });

  // Update message
  updateMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;
    
    const message = await Message.findByPk(messageId);
    
    if (!message) {
      throw new ApiError(404, 'Message not found');
    }
    
    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only edit your own messages');
    }
    
    // Message can only be edited within 15 minutes
    const editWindow = 15 * 60 * 1000; // 15 minutes
    const timeSinceSent = new Date() - message.createdAt;
    
    if (timeSinceSent > editWindow) {
      throw new ApiError(400, 'Message can only be edited within 15 minutes of sending');
    }
    
    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();
    
    // Notify conversation members
    req.io?.to(`conversation:${message.conversationId}`).emit('message:updated', {
      messageId,
      content,
      editedAt: message.editedAt,
      editedBy: userId,
    });
    
    new ApiResponse(res, 200, 'Message updated successfully', {
      message: await chatService.enrichMessageData(message),
    });
  });

  // Delete message
  deleteMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;
    
    const result = await chatService.deleteMessage(messageId, userId);
    
    new ApiResponse(res, 200, 'Message deleted successfully');
  });

  // Send typing indicator
  sendTypingIndicator = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { conversationId, isTyping } = req.body;
    
    const result = await chatService.sendTypingIndicator(
      conversationId,
      userId,
      isTyping
    );
    
    if (result) {
      result.recipients.forEach(recipientId => {
        req.io?.to(`user:${recipientId}`).emit('typing', result.data);
      });
    }
    
    new ApiResponse(res, 200, 'Typing indicator sent');
  });

  // Get unread count
  getUnreadCount = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    const totalUnread = await chatService.getTotalUnreadCount(userId);
    
    new ApiResponse(res, 200, 'Unread count retrieved successfully', {
      unreadCount: totalUnread,
    });
  });

  // Mark messages as read
  markAsRead = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    await chatService.markConversationAsRead(conversationId, userId);
    
    // Emit real-time update
    req.io?.to(`conversation:${conversationId}`).emit('messages:read', {
      conversationId,
      readBy: userId,
      timestamp: new Date(),
    });
    
    new ApiResponse(res, 200, 'Messages marked as read');
  });

  // Add reaction to message
  addReaction = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;
    const { reaction } = req.body;
    
    const message = await Message.findByPk(messageId);
    
    if (!message) {
      throw new ApiError(404, 'Message not found');
    }
    
    await message.addReaction(userId, reaction);
    
    // Emit real-time update
    req.io?.to(`conversation:${message.conversationId}`).emit('message:reaction_added', {
      messageId,
      userId,
      reaction,
      timestamp: new Date(),
    });
    
    new ApiResponse(res, 200, 'Reaction added successfully');
  });

  // Remove reaction
  removeReaction = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;
    
    const message = await Message.findByPk(messageId);
    
    if (!message) {
      throw new ApiError(404, 'Message not found');
    }
    
    await message.removeReaction(userId);
    
    // Emit real-time update
    req.io?.to(`conversation:${message.conversationId}`).emit('message:reaction_removed', {
      messageId,
      userId,
      timestamp: new Date(),
    });
    
    new ApiResponse(res, 200, 'Reaction removed successfully');
  });

  // Helper methods
  async enrichConversation(conversation, userId) {
    const conversationData = conversation.toJSON();
    
    // Add unread count
    conversationData.unreadCount = await chatService.getUnreadCount(
      conversation.id,
      userId
    );
    
    // Add other members for direct conversations
    if (conversation.type === 'direct') {
      const otherMembers = await conversation.getOtherMembers(userId);
      conversationData.otherUser = otherMembers[0]?.user || null;
    }
    
    return conversationData;
  }
}

module.exports = new ChatController();