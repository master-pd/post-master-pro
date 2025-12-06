const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GroupMember = sequelize.define('GroupMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  groupId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Groups',
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
  invitedBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  invitationStatus: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'left'),
    defaultValue: 'accepted',
  },
  isMuted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  mutedUntil: {
    type: DataTypes.DATE,
  },
  isBanned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  bannedAt: {
    type: DataTypes.DATE,
  },
  bannedReason: {
    type: DataTypes.TEXT,
  },
  bannedBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  permissions: {
    type: DataTypes.JSON,
    defaultValue: {},
    get() {
      const rawValue = this.getDataValue('permissions');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('permissions', JSON.stringify(value || {}));
    },
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
      fields: ['groupId', 'userId'],
    },
    {
      fields: ['groupId'],
    },
    {
      fields: ['userId'],
    },
    {
      fields: ['role'],
    },
    {
      fields: ['invitationStatus'],
    },
  ],
});

module.exports = GroupMember;