const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Story = sequelize.define('Story', {
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
  type: {
    type: DataTypes.ENUM('image', 'video', 'text'),
    defaultValue: 'image',
  },
  mediaUrl: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  thumbnailUrl: {
    type: DataTypes.STRING,
  },
  content: {
    type: DataTypes.TEXT,
  },
  backgroundColor: {
    type: DataTypes.STRING(7), // HEX color
    defaultValue: '#000000',
  },
  textColor: {
    type: DataTypes.STRING(7), // HEX color
    defaultValue: '#FFFFFF',
  },
  fontSize: {
    type: DataTypes.INTEGER,
    defaultValue: 24,
  },
  duration: {
    type: DataTypes.INTEGER, // seconds
    defaultValue: 5,
  },
  viewsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  repliesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  sharesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  reactionsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  location: {
    type: DataTypes.STRING,
  },
  latitude: {
    type: DataTypes.FLOAT,
  },
  longitude: {
    type: DataTypes.FLOAT,
  },
  mentions: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('mentions');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('mentions', JSON.stringify(value || []));
    },
  },
  hashtags: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('hashtags');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('hashtags', JSON.stringify(value || []));
    },
  },
  link: {
    type: DataTypes.STRING,
  },
  linkPreview: {
    type: DataTypes.JSON,
  },
  music: {
    type: DataTypes.JSON,
  },
  filters: {
    type: DataTypes.JSON,
  },
  stickers: {
    type: DataTypes.JSON,
  },
  textOverlays: {
    type: DataTypes.JSON,
  },
  privacy: {
    type: DataTypes.ENUM('public', 'friends', 'private', 'close_friends'),
    defaultValue: 'public',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  archivedAt: {
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
      fields: ['userId'],
    },
    {
      fields: ['expiresAt'],
    },
    {
      fields: ['isActive'],
    },
    {
      fields: ['createdAt'],
    },
    {
      fields: ['privacy'],
    },
  ],
});

// Class methods
Story.getActiveStories = async function (userId, viewerId = null) {
  const { Op } = require('sequelize');
  const { Follow } = require('./index');
  
  const now = new Date();
  
  // Get users that the viewer follows or public stories
  let whereClause = {
    isActive: true,
    expiresAt: { [Op.gt]: now },
  };
  
  if (viewerId !== userId) {
    // For other viewers, only show public or friends' stories
    const followedUsers = await Follow.findAll({
      where: { followerId: viewerId, status: 'accepted' },
      attributes: ['followingId'],
    });
    
    const followingIds = followedUsers.map(f => f.followingId);
    
    whereClause[Op.or] = [
      { privacy: 'public' },
      {
        [Op.and]: [
          { privacy: 'friends' },
          { userId: { [Op.in]: followingIds } },
        ],
      },
      {
        [Op.and]: [
          { privacy: 'close_friends' },
          // Add close friends check if implemented
        ],
      },
    ];
  }
  
  if (userId) {
    whereClause.userId = userId;
  }
  
  return await this.findAll({
    where: whereClause,
    include: [{
      model: require('./User'),
      as: 'author',
      attributes: ['id', 'username', 'fullName', 'profilePicture'],
    }],
    order: [['createdAt', 'DESC']],
  });
};

// Instance methods
Story.prototype.incrementViews = async function () {
  this.viewsCount += 1;
  await this.save();
};

Story.prototype.archive = async function () {
  this.isActive = false;
  this.isArchived = true;
  this.archivedAt = new Date();
  await this.save();
};

Story.prototype.isExpired = function () {
  return new Date() > this.expiresAt;
};

module.exports = Story;