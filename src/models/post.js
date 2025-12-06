const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Post = sequelize.define('Post', {
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
    type: DataTypes.ENUM('text', 'image', 'video', 'poll', 'link', 'shared'),
    defaultValue: 'text',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  mediaUrls: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('mediaUrls');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('mediaUrls', JSON.stringify(value || []));
    },
  },
  thumbnailUrl: {
    type: DataTypes.STRING,
  },
  videoDuration: {
    type: DataTypes.INTEGER, // in seconds
  },
  aspectRatio: {
    type: DataTypes.FLOAT,
  },
  pollQuestion: {
    type: DataTypes.STRING,
  },
  pollOptions: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('pollOptions');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('pollOptions', JSON.stringify(value || []));
    },
  },
  pollEndsAt: {
    type: DataTypes.DATE,
  },
  linkPreview: {
    type: DataTypes.JSON,
  },
  sharedPostId: {
    type: DataTypes.UUID,
    references: {
      model: 'Posts',
      key: 'id',
    },
  },
  privacy: {
    type: DataTypes.ENUM('public', 'friends', 'private', 'group'),
    defaultValue: 'public',
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
  tags: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('tags');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('tags', JSON.stringify(value || []));
    },
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
  viewsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  likesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  commentsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  sharesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  savesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  reachCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  isSponsored: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  sponsorId: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  scheduledAt: {
    type: DataTypes.DATE,
  },
  isPublished: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isEdited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  editedAt: {
    type: DataTypes.DATE,
  },
  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  archivedAt: {
    type: DataTypes.DATE,
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  deletedAt: {
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
  paranoid: true, // Soft deletes
  indexes: [
    {
      fields: ['userId'],
    },
    {
      fields: ['type'],
    },
    {
      fields: ['privacy'],
    },
    {
      fields: ['createdAt'],
    },
    {
      fields: ['likesCount'],
    },
    {
      fields: ['isPublished'],
    },
    {
      fields: ['hashtags'],
      using: 'GIN',
    },
  ],
});

// Class methods
Post.associate = (models) => {
  Post.belongsTo(models.User, { foreignKey: 'userId', as: 'author' });
  Post.hasMany(models.Comment, { foreignKey: 'postId', as: 'comments' });
  Post.hasMany(models.Like, { foreignKey: 'postId', as: 'likes' });
  Post.hasMany(models.Share, { foreignKey: 'postId', as: 'shares' });
  Post.hasMany(models.Bookmark, { foreignKey: 'postId', as: 'bookmarks' });
  Post.hasMany(models.Report, { foreignKey: 'postId', as: 'reports' });
  Post.belongsTo(models.Post, { foreignKey: 'sharedPostId', as: 'originalPost' });
  Post.belongsTo(models.User, { foreignKey: 'sponsorId', as: 'sponsor' });
  Post.belongsToMany(models.User, {
    through: 'PostMentions',
    as: 'mentionedUsers',
    foreignKey: 'postId',
  });
  Post.belongsToMany(models.Hashtag, {
    through: 'PostHashtags',
    as: 'hashtagList',
    foreignKey: 'postId',
  });
};

// Instance methods
Post.prototype.incrementViews = async function () {
  this.viewsCount += 1;
  await this.save();
};

Post.prototype.getEngagementRate = function () {
  const totalEngagement = this.likesCount + this.commentsCount + this.sharesCount;
  return this.viewsCount > 0 ? (totalEngagement / this.viewsCount) * 100 : 0;
};

Post.prototype.toJSON = function () {
  const values = Object.assign({}, this.get());
  
  // Calculate engagement
  values.engagementRate = this.getEngagementRate();
  
  // Add computed fields
  values.isLiked = false; // Will be set by middleware
  values.isSaved = false; // Will be set by middleware
  values.isShared = false; // Will be set by middleware
  
  return values;
};

module.exports = Post;