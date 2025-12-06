const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Share = sequelize.define('Share', {
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
  postId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Posts',
      key: 'id',
    },
  },
  sharedPostId: {
    type: DataTypes.UUID,
    references: {
      model: 'Posts',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('post', 'story', 'reel', 'message', 'external'),
    defaultValue: 'post',
  },
  platform: {
    type: DataTypes.STRING(50),
  },
  message: {
    type: DataTypes.TEXT,
  },
  privacy: {
    type: DataTypes.ENUM('public', 'friends', 'private'),
    defaultValue: 'public',
  },
  sharesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  linkClicks: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
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
      fields: ['userId'],
    },
    {
      fields: ['postId'],
    },
    {
      fields: ['sharedPostId'],
    },
    {
      fields: ['type'],
    },
    {
      fields: ['createdAt'],
    },
  ],
});

module.exports = Share;