const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Like = sequelize.define('Like', {
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
  commentId: {
    type: DataTypes.UUID,
    references: {
      model: 'Comments',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('like', 'love', 'haha', 'wow', 'sad', 'angry'),
    defaultValue: 'like',
  },
}, {
  timestamps: true,
  indexes: [
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
      fields: ['userId', 'commentId'],
      where: {
        commentId: {
          [DataTypes.Op.ne]: null,
        },
      },
    },
    {
      fields: ['postId'],
    },
    {
      fields: ['commentId'],
    },
    {
      fields: ['userId'],
    },
  ],
});

// Class method to check if user liked something
Like.hasLiked = async function (userId, targetId, targetType) {
  const where = { userId };
  where[targetType] = targetId;
  
  const like = await this.findOne({ where });
  return !!like;
};

module.exports = Like;