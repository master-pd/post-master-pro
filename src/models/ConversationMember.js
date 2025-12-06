const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConversationMember = sequelize.define('ConversationMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversationId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Conversations',
      key: 'id',
    },
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  role: {
    type: DataTypes.ENUM('admin', 'moderator', 'member'),
    defaultValue: 'member',
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  leftAt: {
    type: DataTypes.DATE,
  },
  isMuted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  mutedUntil: {
    type: DataTypes.DATE,
  },
  isBlocked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  notificationSettings: {
    type: DataTypes.JSON,
    defaultValue: {},
    get() {
      const rawValue = this.getDataValue('notificationSettings');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('notificationSettings', JSON.stringify(value || {}));
    },
  },
  lastSeenMessageId: {
    type: DataTypes.UUID,
    references: {
      model: 'Messages',
      key: 'id',
    },
  },
  lastSeenAt: {
    type: DataTypes.DATE,
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {},
    get() {
      const rawValue = this.getDataValue('metadata');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('metadata', JSON.stringify(value || {}));
    },
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['conversationId', 'userId'],
    },
    {
      fields: ['conversationId'],
    },
    {
      fields: ['userId'],
    },
    {
      fields: ['role'],
    },
    {
      fields: ['isMuted'],
    },
  ],
});

module.exports = ConversationMember;