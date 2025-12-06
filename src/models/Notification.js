const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  fromUserId: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM(
      'like_post',
      'like_comment',
      'comment',
      'reply',
      'follow',
      'mention',
      'share',
      'message',
      'group_invite',
      'event_invite',
      'post_approved',
      'post_rejected',
      'report_resolved',
      'system'
    ),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
  },
  data: {
    type: DataTypes.JSON,
    defaultValue: {},
    get() {
      const rawValue = this.getDataValue('data');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('data', JSON.stringify(value || {}));
    },
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  readAt: {
    type: DataTypes.DATE,
  },
  isSeen: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  seenAt: {
    type: DataTypes.DATE,
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium',
  },
  expiresAt: {
    type: DataTypes.DATE,
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['userId'],
    },
    {
      fields: ['type'],
    },
    {
      fields: ['isRead'],
    },
    {
      fields: ['isSeen'],
    },
    {
      fields: ['createdAt'],
    },
    {
      fields: ['priority'],
    },
  ],
});

// Class methods
Notification.createNotification = async function (notificationData) {
  const notification = await this.create(notificationData);
  
  // Emit real-time notification via Socket.io
  const { socketManager } = require('../../utils/socketManager');
  socketManager.emitToUser(notification.userId, 'notification:new', notification);
  
  // Send push notification if configured
  if (notification.priority === 'high' || notification.priority === 'urgent') {
    const { pushService } = require('../../services/push.service');
    await pushService.sendPushNotification(notification);
  }
  
  return notification;
};

// Instance methods
Notification.prototype.markAsRead = async function () {
  this.isRead = true;
  this.readAt = new Date();
  await this.save();
};

Notification.prototype.markAsSeen = async function () {
  this.isSeen = true;
  this.seenAt = new Date();
  await this.save();
};

module.exports = Notification;