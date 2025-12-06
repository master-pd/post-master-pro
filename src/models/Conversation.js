const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  type: {
    type: DataTypes.ENUM('direct', 'group'),
    defaultValue: 'direct',
  },
  name: {
    type: DataTypes.STRING(100),
  },
  avatar: {
    type: DataTypes.STRING,
  },
  description: {
    type: DataTypes.TEXT,
  },
  createdBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  lastMessageId: {
    type: DataTypes.UUID,
    references: {
      model: 'Messages',
      key: 'id',
    },
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  lastMessageText: {
    type: DataTypes.STRING(500),
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {},
    get() {
      const rawValue = this.getDataValue('settings');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('settings', JSON.stringify(value || {}));
    },
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
      fields: ['lastMessageAt'],
    },
    {
      fields: ['type'],
    },
    {
      fields: ['createdBy'],
    },
    {
      fields: ['isActive'],
    },
  ],
});

// Instance methods
Conversation.prototype.updateLastMessage = async function (message) {
  this.lastMessageId = message.id;
  this.lastMessageAt = new Date();
  this.lastMessageText = message.content?.substring(0, 100) || '';
  await this.save();
};

Conversation.prototype.getOtherMembers = async function (excludeUserId) {
  const { ConversationMember, User } = require('./index');
  
  return await ConversationMember.findAll({
    where: {
      conversationId: this.id,
      userId: { [DataTypes.Op.ne]: excludeUserId },
    },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'username', 'fullName', 'profilePicture'],
    }],
  });
};

module.exports = Conversation;