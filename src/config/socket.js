const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./index');
const logger = require('../utils/logger');
const chatService = require('../services/chat.service');
const notificationService = require('../services/notification.service');

let io;

const initSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: config.CORS_ORIGINS ? config.CORS_ORIGINS.split(',') : '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = jwt.verify(token, config.JWT_SECRET);
      socket.userId = decoded.id;
      socket.user = decoded;
      
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}, User: ${socket.userId}`);

    // Register user as online
    chatService.userConnected(socket.userId, socket.id);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Join conversation rooms
    socket.on('join:conversations', async (conversationIds) => {
      if (Array.isArray(conversationIds)) {
        conversationIds.forEach(conversationId => {
          socket.join(`conversation:${conversationId}`);
        });
      }
    });

    // Join conversation
    socket.on('join:conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      logger.debug(`User ${socket.userId} joined conversation ${conversationId}`);
    });

    // Leave conversation
    socket.on('leave:conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      logger.debug(`User ${socket.userId} left conversation ${conversationId}`);
    });

    // Typing indicator
    socket.on('typing:start', async (data) => {
      const { conversationId } = data;
      
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        userId: socket.userId,
        conversationId,
        timestamp: new Date(),
      });

      // Update in service
      await chatService.sendTypingIndicator(conversationId, socket.userId, true);
    });

    socket.on('typing:stop', async (data) => {
      const { conversationId } = data;
      
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        userId: socket.userId,
        conversationId,
        timestamp: new Date(),
      });

      // Update in service
      await chatService.sendTypingIndicator(conversationId, socket.userId, false);
    });

    // Message events
    socket.on('message:send', async (data) => {
      try {
        const { conversationId, content, type, attachments } = data;
        
        const result = await chatService.sendMessage(
          socket.userId,
          conversationId,
          content,
          type,
          attachments
        );

        // Emit to conversation room
        io.to(`conversation:${conversationId}`).emit('message:new', {
          message: result.message,
          senderId: socket.userId,
        });

        // Send notifications to offline users
        result.recipients.forEach(recipientId => {
          if (!chatService.isUserOnline(recipientId)) {
            notificationService.createNotification({
              userId: recipientId,
              fromUserId: socket.userId,
              type: 'message',
              title: 'New Message',
              body: content?.substring(0, 100) || 'Sent an attachment',
              data: {
                conversationId,
                messageId: result.message.id,
              },
            });
          }
        });
      } catch (error) {
        logger.error('Message send error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Message reactions
    socket.on('message:react', async (data) => {
      const { messageId, reaction } = data;
      
      try {
        const message = await chatService.addReaction(messageId, socket.userId, reaction);
        
        // Emit to conversation room
        if (message.conversationId) {
          io.to(`conversation:${message.conversationId}`).emit('message:reaction', {
            messageId,
            userId: socket.userId,
            reaction,
            message,
          });
        }
      } catch (error) {
        logger.error('Message reaction error:', error);
      }
    });

    // Message delete
    socket.on('message:delete', async (data) => {
      const { messageId } = data;
      
      try {
        const result = await chatService.deleteMessage(messageId, socket.userId);
        
        // Emit to conversation room
        io.to(`conversation:${result.message.conversationId}`).emit('message:deleted', {
          messageId,
          deletedBy: socket.userId,
        });

        // Notify other members
        result.recipients.forEach(recipientId => {
          io.to(`user:${recipientId}`).emit('message:deleted', {
            messageId,
            deletedBy: socket.userId,
          });
        });
      } catch (error) {
        logger.error('Message delete error:', error);
      }
    });

    // Post events
    socket.on('post:like', (data) => {
      const { postId } = data;
      socket.to(`post:${postId}`).emit('post:liked', {
        postId,
        userId: socket.userId,
        timestamp: new Date(),
      });
    });

    socket.on('post:comment', (data) => {
      const { postId, commentId } = data;
      socket.to(`post:${postId}`).emit('post:commented', {
        postId,
        commentId,
        userId: socket.userId,
        timestamp: new Date(),
      });
    });

    // Notification events
    socket.on('notification:read', async (data) => {
      const { notificationId } = data;
      await notificationService.markAsRead(notificationId);
    });

    socket.on('notification:seen', async (data) => {
      const { notificationId } = data;
      await notificationService.markAsSeen(notificationId);
    });

    // Call events (for future video/audio calls)
    socket.on('call:start', (data) => {
      const { callId, targetUserId, type } = data;
      
      io.to(`user:${targetUserId}`).emit('call:incoming', {
        callId,
        callerId: socket.userId,
        type,
        timestamp: new Date(),
      });
    });

    socket.on('call:accept', (data) => {
      const { callId } = data;
      io.to(`call:${callId}`).emit('call:accepted', {
        callId,
        userId: socket.userId,
      });
    });

    socket.on('call:reject', (data) => {
      const { callId } = data;
      io.to(`call:${callId}`).emit('call:rejected', {
        callId,
        userId: socket.userId,
      });
    });

    socket.on('call:end', (data) => {
      const { callId } = data;
      io.to(`call:${callId}`).emit('call:ended', {
        callId,
        endedBy: socket.userId,
        timestamp: new Date(),
      });
    });

    // Presence events
    socket.on('presence:update', (data) => {
      const { status, customStatus } = data;
      
      // Broadcast to user's connections
      socket.broadcast.emit('presence:changed', {
        userId: socket.userId,
        status,
        customStatus,
        lastSeen: new Date(),
      });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}, User: ${socket.userId}`);
      
      // Mark user as offline
      chatService.userDisconnected(socket.id);
      
      // Broadcast offline status
      socket.broadcast.emit('presence:changed', {
        userId: socket.userId,
        status: 'offline',
        lastSeen: new Date(),
      });
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initSocket first.');
  }
  return io;
};

// Helper to emit to specific user
const emitToUser = (userId, event, data) => {
  const io = getIO();
  io.to(`user:${userId}`).emit(event, data);
};

// Helper to emit to multiple users
const emitToUsers = (userIds, event, data) => {
  const io = getIO();
  userIds.forEach(userId => {
    io.to(`user:${userId}`).emit(event, data);
  });
};

// Helper to emit to conversation
const emitToConversation = (conversationId, event, data) => {
  const io = getIO();
  io.to(`conversation:${conversationId}`).emit(event, data);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToUsers,
  emitToConversation,
};