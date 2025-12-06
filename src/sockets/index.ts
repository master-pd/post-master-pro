import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import User from '../models/User.model';
import { logger } from '../utils/logger';

// Socket.IO event names
export const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  
  // Authentication
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  
  // Video events
  VIDEO_UPLOAD_PROGRESS: 'video_upload_progress',
  VIDEO_PROCESSING_PROGRESS: 'video_processing_progress',
  VIDEO_READY: 'video_ready',
  VIDEO_LIKE: 'video_like',
  VIDEO_COMMENT: 'video_comment',
  VIDEO_VIEW: 'video_view',
  
  // Comment events
  COMMENT_CREATE: 'comment_create',
  COMMENT_UPDATE: 'comment_update',
  COMMENT_DELETE: 'comment_delete',
  COMMENT_LIKE: 'comment_like',
  
  // Notification events
  NOTIFICATION_NEW: 'notification_new',
  NOTIFICATION_READ: 'notification_read',
  NOTIFICATION_DELETE: 'notification_delete',
  
  // User events
  USER_FOLLOW: 'user_follow',
  USER_UNFOLLOW: 'user_unfollow',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  
  // Chat events (future feature)
  MESSAGE_SEND: 'message_send',
  MESSAGE_RECEIVE: 'message_receive',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
} as const;

interface SocketUser {
  userId: string;
  socketId: string;
  username: string;
}

interface RoomUsers {
  [roomId: string]: SocketUser[];
}

class SocketManager {
  private io: Server;
  private users: Map<string, SocketUser> = new Map(); // socketId -> user
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds[]
  private roomUsers: RoomUsers = {};

  constructor(server: HttpServer) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('✅ Socket.IO server initialized');
  }

  // Setup middleware for authentication
  private setupMiddleware(): void {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
        const user = await User.findById(decoded.id).select('username isActive');

        if (!user || !user.isActive) {
          return next(new Error('Invalid or inactive user'));
        }

        // Attach user to socket
        socket.data.user = {
          id: user._id.toString(),
          username: user.username,
        };

        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  // Setup event handlers
  private setupEventHandlers(): void {
    this.io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
      const user = socket.data.user;
      
      if (!user) {
        socket.disconnect();
        return;
      }

      // Store user connection
      this.addUser(user.id, socket.id, user.username);

      logger.info(`User connected: ${user.username} (${socket.id})`);

      // Emit user online status to followers
      this.emitToUserFollowers(user.id, SOCKET_EVENTS.USER_ONLINE, {
        userId: user.id,
        username: user.username,
      });

      // Send welcome message
      socket.emit(SOCKET_EVENTS.AUTHENTICATED, {
        message: 'Socket connection authenticated',
        userId: user.id,
      });

      // Handle video upload progress
      socket.on(SOCKET_EVENTS.VIDEO_UPLOAD_PROGRESS, (data) => {
        this.handleVideoUploadProgress(socket, data);
      });

      // Handle video like
      socket.on(SOCKET_EVENTS.VIDEO_LIKE, (data) => {
        this.handleVideoLike(socket, data);
      });

      // Handle video comment
      socket.on(SOCKET_EVENTS.VIDEO_COMMENT, (data) => {
        this.handleVideoComment(socket, data);
      });

      // Handle user follow
      socket.on(SOCKET_EVENTS.USER_FOLLOW, (data) => {
        this.handleUserFollow(socket, data);
      });

      // Handle join room
      socket.on('join_room', (roomId) => {
        this.joinRoom(socket, roomId);
      });

      // Handle leave room
      socket.on('leave_room', (roomId) => {
        this.leaveRoom(socket, roomId);
      });

      // Handle typing events
      socket.on(SOCKET_EVENTS.TYPING_START, (data) => {
        this.handleTypingStart(socket, data);
      });

      socket.on(SOCKET_EVENTS.TYPING_STOP, (data) => {
        this.handleTypingStop(socket, data);
      });

      // Handle disconnect
      socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        this.handleDisconnect(socket);
      });

      // Handle errors
      socket.on(SOCKET_EVENTS.ERROR, (error) => {
        logger.error('Socket error:', error);
      });
    });
  }

  // Add user to connected users
  private addUser(userId: string, socketId: string, username: string): void {
    const user: SocketUser = { userId, socketId, username };
    
    // Store user by socket ID
    this.users.set(socketId, user);
    
    // Store socket IDs by user ID
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, []);
    }
    this.userSockets.get(userId)!.push(socketId);
  }

  // Remove user from connected users
  private removeUser(socketId: string): void {
    const user = this.users.get(socketId);
    
    if (user) {
      // Remove socket ID from user's sockets
      const userSockets = this.userSockets.get(user.userId);
      if (userSockets) {
        const index = userSockets.indexOf(socketId);
        if (index > -1) {
          userSockets.splice(index, 1);
        }
        
        if (userSockets.length === 0) {
          this.userSockets.delete(user.userId);
          
          // Emit user offline status to followers
          this.emitToUserFollowers(user.userId, SOCKET_EVENTS.USER_OFFLINE, {
            userId: user.userId,
            username: user.username,
          });
        }
      }
      
      // Remove user from users map
      this.users.delete(socketId);
      
      // Remove user from all rooms
      Object.keys(this.roomUsers).forEach(roomId => {
        this.roomUsers[roomId] = this.roomUsers[roomId].filter(
          user => user.socketId !== socketId
        );
        
        if (this.roomUsers[roomId].length === 0) {
          delete this.roomUsers[roomId];
        }
      });
    }
  }

  // Join a room
  private joinRoom(socket: any, roomId: string): void {
    const user = this.users.get(socket.id);
    
    if (!user) return;
    
    socket.join(roomId);
    
    // Add user to room users list
    if (!this.roomUsers[roomId]) {
      this.roomUsers[roomId] = [];
    }
    
    if (!this.roomUsers[roomId].some(u => u.userId === user.userId)) {
      this.roomUsers[roomId].push(user);
    }
    
    logger.info(`User ${user.username} joined room: ${roomId}`);
  }

  // Leave a room
  private leaveRoom(socket: any, roomId: string): void {
    const user = this.users.get(socket.id);
    
    if (!user) return;
    
    socket.leave(roomId);
    
    // Remove user from room users list
    if (this.roomUsers[roomId]) {
      this.roomUsers[roomId] = this.roomUsers[roomId].filter(
        u => u.userId !== user.userId
      );
      
      if (this.roomUsers[roomId].length === 0) {
        delete this.roomUsers[roomId];
      }
    }
    
    logger.info(`User ${user.username} left room: ${roomId}`);
  }

  // Handle video upload progress
  private handleVideoUploadProgress(socket: any, data: any): void {
    const { videoId, progress } = data;
    const user = socket.data.user;
    
    // Emit progress to the specific user
    socket.emit(SOCKET_EVENTS.VIDEO_UPLOAD_PROGRESS, {
      videoId,
      progress,
      userId: user.id,
    });
  }

  // Handle video like
  private handleVideoLike(socket: any, data: any): void {
    const { videoId, userId: targetUserId, liked } = data;
    const user = socket.data.user;
    
    // Emit to video owner if different from liker
    if (targetUserId !== user.id) {
      this.emitToUser(targetUserId, SOCKET_EVENTS.VIDEO_LIKE, {
        videoId,
        userId: user.id,
        username: user.username,
        liked,
      });
    }
  }

  // Handle video comment
  private handleVideoComment(socket: any, data: any): void {
    const { videoId, commentId, userId: targetUserId, isReply, parentCommentId } = data;
    const user = socket.data.user;
    
    // Emit to video owner if different from commenter
    if (targetUserId !== user.id) {
      this.emitToUser(targetUserId, SOCKET_EVENTS.VIDEO_COMMENT, {
        videoId,
        commentId,
        userId: user.id,
        username: user.username,
        isReply,
        parentCommentId,
      });
    }
    
    // If it's a reply, also notify the parent comment's author
    if (isReply && parentCommentId) {
      // You would need to fetch the parent comment's author from database
      // For now, we'll emit to a room for the parent comment
      this.io.to(`comment:${parentCommentId}`).emit(SOCKET_EVENTS.COMMENT_CREATE, {
        videoId,
        commentId,
        userId: user.id,
        username: user.username,
        isReply: true,
      });
    }
  }

  // Handle user follow
  private handleUserFollow(socket: any, data: any): void {
    const { targetUserId, followed } = data;
    const user = socket.data.user;
    
    // Emit to the user being followed/unfollowed
    this.emitToUser(targetUserId, followed ? SOCKET_EVENTS.USER_FOLLOW : SOCKET_EVENTS.USER_UNFOLLOW, {
      userId: user.id,
      username: user.username,
      followed,
    });
  }

  // Handle typing start
  private handleTypingStart(socket: any, data: any): void {
    const { roomId } = data;
    const user = socket.data.user;
    
    // Emit to room except sender
    socket.to(roomId).emit(SOCKET_EVENTS.TYPING_START, {
      userId: user.id,
      username: user.username,
      roomId,
    });
  }

  // Handle typing stop
  private handleTypingStop(socket: any, data: any): void {
    const { roomId } = data;
    const user = socket.data.user;
    
    // Emit to room except sender
    socket.to(roomId).emit(SOCKET_EVENTS.TYPING_STOP, {
      userId: user.id,
      username: user.username,
      roomId,
    });
  }

  // Handle disconnect
  private handleDisconnect(socket: any): void {
    const user = this.users.get(socket.id);
    
    if (user) {
      logger.info(`User disconnected: ${user.username} (${socket.id})`);
      this.removeUser(socket.id);
    }
  }

  // Emit event to specific user
  public emitToUser(userId: string, event: string, data: any): void {
    const socketIds = this.userSockets.get(userId);
    
    if (socketIds) {
      socketIds.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  // Emit event to user's followers
  public async emitToUserFollowers(userId: string, event: string, data: any): Promise<void> {
    try {
      const user = await User.findById(userId).select('followers');
      
      if (user && user.followers.length > 0) {
        user.followers.forEach(followerId => {
          this.emitToUser(followerId.toString(), event, data);
        });
      }
    } catch (error) {
      logger.error('Error emitting to user followers:', error);
    }
  }

  // Emit event to all connected users
  public emitToAll(event: string, data: any): void {
    this.io.emit(event, data);
  }

  // Emit event to room
  public emitToRoom(roomId: string, event: string, data: any): void {
    this.io.to(roomId).emit(event, data);
  }

  // Get connected users count
  public getConnectedUsersCount(): number {
    return this.users.size;
  }

  // Get user's sockets
  public getUserSockets(userId: string): string[] {
    return this.userSockets.get(userId) || [];
  }

  // Get room users
  public getRoomUsers(roomId: string): SocketUser[] {
    return this.roomUsers[roomId] || [];
  }
}

let socketManager: SocketManager | null = null;

export const initSocket = (server: HttpServer): SocketManager => {
  if (!socketManager) {
    socketManager = new SocketManager(server);
  }
  return socketManager;
};

export const getSocketManager = (): SocketManager => {
  if (!socketManager) {
    throw new Error('Socket manager not initialized. Call initSocket first.');
  }
  return socketManager;
};

export { SOCKET_EVENTS };