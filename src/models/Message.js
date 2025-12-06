const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
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
  senderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  content: {
    type: DataTypes.TEXT,
  },
  type: {
    type: DataTypes.ENUM('text', 'image', 'video', 'audio', 'file', 'sticker', 'gif'),
    defaultValue: 'text',
  },
  attachments: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('attachments');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('attachments', JSON.stringify(value || []));
    },
  },
  status: {
    type: DataTypes.ENUM('sent', 'delivered', 'read'),
    defaultValue: 'sent',
  },
  isEdited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  editedAt: {
    type: DataTypes.DATE,
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  deletedAt: {
    type: DataTypes.DATE,
  },
  deletedFor: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('deletedFor');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('deletedFor', JSON.stringify(value || []));
    },
  },
  replyTo: {
    type: DataTypes.UUID,
    references: {
      model: 'Messages',
      key: 'id',
    },
  },
  reactions: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('reactions');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('reactions', JSON.stringify(value || []));
    },
  },
}, {
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      fields: ['conversationId'],
    },
    {
      fields: ['senderId'],
    },
    {
      fields: ['createdAt'],
    },
    {
      fields: ['status'],
    },
  ],
});

// Instance methods
Message.prototype.markAsDelivered = async function () {
  this.status = 'delivered';
  await this.save();
};

Message.prototype.markAsRead = async function () {
  this.status = 'read';
  await this.save();
};

Message.prototype.addReaction = async function (userId, reaction) {
  const reactions = this.reactions || [];
  const existingIndex = reactions.findIndex(r => r.userId === userId);
  
  if (existingIndex >= 0) {
    reactions[existingIndex].reaction = reaction;
  } else {
    reactions.push({ userId, reaction, createdAt: new Date() });
  }
  
  this.reactions = reactions;
  await this.save();
};

Message.prototype.removeReaction = async function (userId) {
  const reactions = this.reactions || [];
  const filtered = reactions.filter(r => r.userId !== userId);
  
  this.reactions = filtered;
  await this.save();
};

module.exports = Message;