const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Hashtag = sequelize.define('Hashtag', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tag: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
  },
  postsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  storiesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  followersCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
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
      fields: ['tag'],
      unique: true,
    },
    {
      fields: ['postsCount'],
    },
    {
      fields: ['isFeatured'],
    },
    {
      fields: ['isBanned'],
    },
  ],
});

module.exports = Hashtag;