const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('./logger');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Message = require('../models/Message');

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.rooms = new Map(); // roomId -> Set of userIds
  }

  initialize(server) {
    this.io = socketIO(server, {
      cors: {
        origin: config.CORS_ORIGINS ? config.CORS_ORIGINS.split(',') : '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));

    logger.info('Socket.io server initialized');
  }

  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token.replace('Bearer ', ''), config.JWT_SECRET);
      const user = await User.findByPk(decoded.userId, {
        attributes: ['id', 'username', 'email', 'fullName', 'profilePicture'],
      });

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  }

  async handleConnection(socket) {
    const user = socket.user;
    
    logger.info(`Socket connected: ${socket.id} - User: ${user.username} (${user.id})`);

    // Store socket connection
    if (!this.userSockets.has(user.id)) {
      this.userSockets.set(user.id, new Set());
    }
    this.userSockets.get(user.id).add(socket.id);
    this.connectedUsers.set(socket.id, user.id);

    // Join user to personal room
    socket.join(`user:${user.id}`);

    // Notify user about connection
    socket.emit('connected', {
      message: 'Connected to socket server',
      userId: user.id,
    });

    // Notify friends about online status
    this.notifyUserStatus(user.id, true);

    // Handle events
    this.setupEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', async () => {
      await this.handleDisconnection(socket);
    });

    socket.on('error', (error) => {
      logger.error(`Socket error for user ${user.username}:`, error);
    });
  }

  async handleDisconnection(socket) {
    const userId = this.connectedUsers.get(socket.id);
    
    if (userId) {
      const userSockets = this.userSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        
        if (userSockets.size === 0) {
          this.userSockets.delete(userId);
          
          // Notify friends about offline status after delay
          setTimeout(() => {
            if (!this.userSockets.has(userId)) {
              this.notifyUserStatus(userId, false);
            }
          }, 5000);
        }
      }
      
      this.connectedUsers.delete(socket.id);
    }

    logger.info(`Socket disconnected: ${socket.id}`);
  }

  setupEventHandlers(socket) {
    const user = socket.user;

    // Private messaging
    socket.on('send-message', async (data) => {
      try {
        const { receiverId, content, type = 'text', mediaUrl } = data;

        if (!receiverId || !content) {
          socket.emit('error', { message: 'Receiver ID and content are required' });
          return;
        }

        // Create message in database
        const message = await Message.create({
          senderId: user.id,
          receiverId,
          content,
          type,
          mediaUrl,
        });

        // Emit to sender
        socket.emit('message-sent', {
          message: message.toJSON(),
        });

        // Emit to receiver if online
        this.emitToUser(receiverId, 'new-message', {
          message: message.toJSON(),
          sender: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            profilePicture: user.profilePicture,
          },
        });

      } catch (error) {
        logger.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const { receiverId, isTyping } = data;
      if (receiverId) {
        this.emitToUser(receiverId, 'typing', {
          senderId: user.id,
          isTyping,
        });
      }
    });

    // Join chat room
    socket.on('join-chat', (chatId) => {
      socket.join(`chat:${chatId}`);
      logger.info(`User ${user.username} joined chat: ${chatId}`);
    });

    // Leave chat room
    socket.on('leave-chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
      logger.info(`User ${user.username} left chat: ${chatId}`);
    });

    // Join group
    socket.on('join-group', (groupId) => {
      socket.join(`group:${groupId}`);
      logger.info(`User ${user.username} joined group: ${groupId}`);
    });

    // Leave group
    socket.on('leave-group', (groupId) => {
      socket.leave(`group:${groupId}`);
      logger.info(`User ${user.username} left group: ${groupId}`);
    });

    // Mark message as read
    socket.on('mark-read', async (data) => {
      try {
        const { messageId } = data;
        await Message.update(
          { isRead: true, readAt: new Date() },
          { where: { id: messageId, receiverId: user.id } }
        );

        socket.emit('message-read', { messageId });
      } catch (error) {
        logger.error('Error marking message as read:', error);
      }
    });

    // Subscribe to notifications
    socket.on('subscribe-notifications', () => {
      socket.join(`notifications:${user.id}`);
    });

    // Unsubscribe from notifications
    socket.on('unsubscribe-notifications', () => {
      socket.leave(`notifications:${user.id}`);
    });
  }

  // Utility methods
  emitToUser(userId, event, data) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.forEach((socketId) => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  emitToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
  }

  async notifyUserStatus(userId, isOnline) {
    // Get user's friends/followers
    // This would query your database for connections
    // For now, we'll emit to a status room
    this.emitToRoom(`status:${userId}`, 'user-status', {
      userId,
      isOnline,
      lastSeen: isOnline ? null : new Date(),
    });
  }

  async sendNotification(userId, notificationData) {
    try {
      // Create notification in database
      const notification = await Notification.create({
        userId,
        ...notificationData,
      });

      // Emit to user if online
      this.emitToUser(userId, 'new-notification', {
        notification: notification.toJSON(),
      });

      return notification;
    } catch (error) {
      logger.error('Error sending notification:', error);
    }
  }

  // Send message to multiple users
  broadcastToUsers(userIds, event, data) {
    userIds.forEach((userId) => {
      this.emitToUser(userId, event, data);
    });
  }

  // Get online users
  getOnlineUsers() {
    return Array.from(this.userSockets.keys());
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.userSockets.has(userId);
  }

  // Get user's socket connections
  getUserSockets(userId) {
    return this.userSockets.get(userId) || new Set();
  }

  // Clean up
  async cleanup() {
    this.connectedUsers.clear();
    this.userSockets.clear();
    this.rooms.clear();
    
    if (this.io) {
      this.io.close();
    }
  }
}

module.exports = new SocketManager();