const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const View = sequelize.define('View', {
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
    references: {
      model: 'Posts',
      key: 'id',
    },
  },
  storyId: {
    type: DataTypes.UUID,
    references: {
      model: 'Stories',
      key: 'id',
    },
  },
  duration: {
    type: DataTypes.INTEGER, // milliseconds
    defaultValue: 0,
  },
  percentage: {
    type: DataTypes.FLOAT, // percentage viewed
    defaultValue: 0,
  },
  deviceType: {
    type: DataTypes.STRING(50),
  },
  userAgent: {
    type: DataTypes.TEXT,
  },
  ipAddress: {
    type: DataTypes.STRING(45),
  },
  location: {
    type: DataTypes.STRING(100),
  },
  referrer: {
    type: DataTypes.STRING(500),
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
      fields: ['storyId'],
    },
    {
      fields: ['createdAt'],
    },
    {
      unique: true,
      fields: ['userId', 'postId'],
      where: {
        postId: {
          [DataTypes.Op.ne]: null,
        },
      },
    },
    {
      unique: true,
      fields: ['userId', 'storyId'],
      where: {
        storyId: {
          [DataTypes.Op.ne]: null,
        },
      },
    },
  ],
});

module.exports = View;