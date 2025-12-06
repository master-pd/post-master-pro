const { Op } = require('sequelize');
const { Message, Conversation, User, ConversationMember } = require('../models');
const ApiError = require('../utils/ApiError');
const redis = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');

class ChatService {
  constructor() {
    this.onlineUsers = new Map();
    this.userSockets = new Map();
  }

  // Get or create conversation between users
  async getOrCreateConversation(user1Id, user2Id) {
    // Check existing conversation
    let conversation = await Conversation.findOne({
      include: [{
        model: ConversationMember,
        as: 'members',
        where: {
          userId: { [Op.in]: [user1Id, user2Id] },
        },
      }],
      group: ['Conversation.id'],
      having: sequelize.literal('COUNT(DISTINCT members.userId) = 2'),
    });

    // Create new conversation if doesn't exist
    if (!conversation) {
      conversation = await Conversation.create({
        type: 'direct',
        lastMessageAt: new Date(),
      });

      // Add members
      await ConversationMember.bulkCreate([
        { conversationId: conversation.id, userId: user1Id },
        { conversationId: conversation.id, userId: user2Id },
      ]);
    }

    return conversation;
  }

  // Send message
  async sendMessage(senderId, conversationId, content, type = 'text', attachments = []) {
    const conversation = await Conversation.findByPk(conversationId, {
      include: [{
        model: ConversationMember,
        as: 'members',
        where: { userId: senderId },
      }],
    });

    if (!conversation) {
      throw new ApiError(404, 'Conversation not found or access denied');
    }

    // Process attachments if any
    let processedAttachments = [];
    if (attachments.length > 0) {
      // Upload attachments to storage
      processedAttachments = await this.processAttachments(attachments);
    }

    // Create message
    const message = await Message.create({
      conversationId,
      senderId,
      content: content?.trim(),
      type,
      attachments: processedAttachments,
      status: 'sent',
    });

    // Update conversation
    await conversation.update({
      lastMessageId: message.id,
      lastMessageAt: new Date(),
      lastMessageText: content?.substring(0, 100),
    });

    // Mark as read for sender
    await this.markAsRead(conversationId, senderId);

    // Get other members for notification
    const otherMembers = await ConversationMember.findAll({
      where: {
        conversationId,
        userId: { [Op.ne]: senderId },
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username'],
      }],
    });

    // Prepare message for real-time delivery
    const messageData = await this.enrichMessageData(message);

    return {
      message: messageData,
      recipients: otherMembers.map(m => m.user.id),
    };
  }

  // Get conversation messages
  async getConversationMessages(conversationId, userId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    // Check if user is a member
    const isMember = await ConversationMember.findOne({
      where: { conversationId, userId },
    });

    if (!isMember) {
      throw new ApiError(403, 'Access denied to this conversation');
    }

    const { count, rows: messages } = await Message.findAndCountAll({
      where: { conversationId },
      include: [{
        model: User,
        as: 'sender',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    // Mark messages as read
    await this.markConversationAsRead(conversationId, userId);

    // Enrich messages
    const enrichedMessages = await Promise.all(
      messages.map(msg => this.enrichMessageData(msg))
    );

    return {
      messages: enrichedMessages.reverse(), // Return in chronological order
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    };
  }

  // Get user conversations
  async getUserConversations(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const { count, rows: conversations } = await Conversation.findAndCountAll({
      include: [
        {
          model: ConversationMember,
          as: 'members',
          where: { userId },
          required: true,
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
        {
          model: ConversationMember,
          as: 'otherMembers',
          where: { userId: { [Op.ne]: userId } },
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'fullName', 'profilePicture', 'isOnline'],
          }],
        },
      ],
      order: [['lastMessageAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    // Enrich conversations with unread count
    const enrichedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.getUnreadCount(conv.id, userId);
        
        const convData = conv.toJSON();
        convData.unreadCount = unreadCount;
        convData.otherUser = conv.otherMembers[0]?.user;
        
        return convData;
      })
    );

    return {
      conversations: enrichedConversations,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    };
  }

  // Mark messages as read
  async markAsRead(conversationId, userId) {
    await Message.update(
      { status: 'read' },
      {
        where: {
          conversationId,
          senderId: { [Op.ne]: userId },
          status: 'sent',
        },
      }
    );
  }

  async markConversationAsRead(conversationId, userId) {
    return this.markAsRead(conversationId, userId);
  }

  // Get unread message count
  async getUnreadCount(conversationId, userId) {
    return await Message.count({
      where: {
        conversationId,
        senderId: { [Op.ne]: userId },
        status: 'sent',
      },
    });
  }

  // Get total unread count for user
  async getTotalUnreadCount(userId) {
    const conversations = await ConversationMember.findAll({
      where: { userId },
      attributes: ['conversationId'],
    });

    const conversationIds = conversations.map(c => c.conversationId);

    if (conversationIds.length === 0) return 0;

    return await Message.count({
      where: {
        conversationId: { [Op.in]: conversationIds },
        senderId: { [Op.ne]: userId },
        status: 'sent',
      },
    });
  }

  // Process message attachments
  async processAttachments(attachments) {
    // This would upload files to storage (Cloudinary, S3, etc.)
    // Return array of attachment objects with URLs
    return attachments.map(attachment => ({
      url: attachment.url,
      type: attachment.type,
      name: attachment.name,
      size: attachment.size,
    }));
  }

  // Enrich message data
  async enrichMessageData(message) {
    const enriched = message.toJSON();
    
    // Add sender info if not already included
    if (!enriched.sender && message.sender) {
      enriched.sender = message.sender.toJSON();
    }

    return enriched;
  }

  // Handle user online status
  async userConnected(userId, socketId) {
    this.onlineUsers.set(userId, {
      socketId,
      connectedAt: new Date(),
      status: 'online',
    });
    
    this.userSockets.set(socketId, userId);

    // Update user status in database
    await User.update(
      { isOnline: true, lastSeen: new Date() },
      { where: { id: userId } }
    );

    // Notify user's contacts
    await this.notifyContactsStatusChange(userId, 'online');
  }

  async userDisconnected(socketId) {
    const userId = this.userSockets.get(socketId);
    
    if (userId) {
      this.onlineUsers.delete(userId);
      this.userSockets.delete(socketId);

      // Update user status in database
      await User.update(
        { isOnline: false, lastSeen: new Date() },
        { where: { id: userId } }
      );

      // Notify user's contacts
      await this.notifyContactsStatusChange(userId, 'offline');
    }
  }

  async notifyContactsStatusChange(userId, status) {
    // Get user's contacts (friends/followers)
    // This would query your Follow/Relationship model
    // For now, we'll emit to all connected users
    // In production, emit only to relevant contacts
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.onlineUsers.has(userId);
  }

  // Get user's socket ID
  getUserSocketId(userId) {
    const user = this.onlineUsers.get(userId);
    return user?.socketId;
  }

  // Send typing indicator
  async sendTypingIndicator(conversationId, userId, isTyping) {
    const conversation = await Conversation.findByPk(conversationId, {
      include: [{
        model: ConversationMember,
        as: 'members',
        where: { userId: { [Op.ne]: userId } },
        attributes: ['userId'],
      }],
    });

    if (!conversation) return;

    const recipients = conversation.members.map(m => m.userId);
    
    return {
      event: 'typing',
      data: {
        conversationId,
        userId,
        isTyping,
        timestamp: new Date(),
      },
      recipients,
    };
  }

  // Delete message (soft delete)
  async deleteMessage(messageId, userId) {
    const message = await Message.findByPk(messageId);
    
    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    // Check ownership
    if (message.senderId !== userId) {
      throw new ApiError(403, 'You can only delete your own messages');
    }

    // Soft delete
    await message.update({
      isDeleted: true,
      deletedAt: new Date(),
      content: 'This message was deleted',
      attachments: [],
    });

    return {
      message: await this.enrichMessageData(message),
      recipients: await this.getConversationMembers(message.conversationId, userId),
    };
  }

  // Get conversation members (excluding sender)
  async getConversationMembers(conversationId, excludeUserId) {
    const members = await ConversationMember.findAll({
      where: {
        conversationId,
        userId: { [Op.ne]: excludeUserId },
      },
      attributes: ['userId'],
    });

    return members.map(m => m.userId);
  }

  // Create group conversation
  async createGroupConversation(creatorId, name, memberIds, avatar = null) {
    // Add creator to members
    const allMemberIds = [...new Set([creatorId, ...memberIds])];

    // Check if group already exists with same members
    const existingGroup = await this.findExistingGroup(allMemberIds);
    if (existingGroup) {
      throw new ApiError(400, 'Group already exists with these members');
    }

    // Create group conversation
    const conversation = await Conversation.create({
      type: 'group',
      name,
      avatar,
      createdBy: creatorId,
      lastMessageAt: new Date(),
    });

    // Add members
    const memberRecords = allMemberIds.map(userId => ({
      conversationId: conversation.id,
      userId,
      role: userId === creatorId ? 'admin' : 'member',
      joinedAt: new Date(),
    }));

    await ConversationMember.bulkCreate(memberRecords);

    return conversation;
  }

  async findExistingGroup(memberIds) {
    // Complex query to find exact match of members
    // Implementation depends on your database
    return null;
  }

  // Update group info
  async updateGroupInfo(conversationId, userId, updates) {
    const conversation = await Conversation.findByPk(conversationId);
    
    if (!conversation || conversation.type !== 'group') {
      throw new ApiError(404, 'Group not found');
    }

    // Check if user is admin
    const membership = await ConversationMember.findOne({
      where: { conversationId, userId, role: 'admin' },
    });

    if (!membership) {
      throw new ApiError(403, 'Only admins can update group info');
    }

    await conversation.update(updates);

    return conversation;
  }

  // Add members to group
  async addGroupMembers(conversationId, adminId, newMemberIds) {
    const conversation = await Conversation.findByPk(conversationId);
    
    if (!conversation || conversation.type !== 'group') {
      throw new ApiError(404, 'Group not found');
    }

    // Check if user is admin
    const membership = await ConversationMember.findOne({
      where: { conversationId, userId: adminId, role: 'admin' },
    });

    if (!membership) {
      throw new ApiError(403, 'Only admins can add members');
    }

    // Get existing members
    const existingMembers = await ConversationMember.findAll({
      where: { conversationId },
      attributes: ['userId'],
    });

    const existingMemberIds = existingMembers.map(m => m.userId);
    const uniqueNewMembers = newMemberIds.filter(id => !existingMemberIds.includes(id));

    if (uniqueNewMembers.length === 0) {
      throw new ApiError(400, 'All users are already members');
    }

    // Add new members
    const memberRecords = uniqueNewMembers.map(userId => ({
      conversationId,
      userId,
      role: 'member',
      joinedAt: new Date(),
    }));

    await ConversationMember.bulkCreate(memberRecords);

    return {
      addedCount: uniqueNewMembers.length,
      addedMembers: uniqueNewMembers,
    };
  }

  // Remove member from group
  async removeGroupMember(conversationId, adminId, memberId) {
    // Check permissions and remove member
    // Similar implementation to addGroupMembers
  }
}

module.exports = new ChatService();