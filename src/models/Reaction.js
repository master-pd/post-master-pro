const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Reaction = sequelize.define('Reaction', {
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
  storyId: {
    type: DataTypes.UUID,
    references: {
      model: 'Stories',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('like', 'love', 'haha', 'wow', 'sad', 'angry', 'care'),
    defaultValue: 'like',
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
      unique: true,
      fields: ['userId', 'storyId'],
      where: {
        storyId: {
          [DataTypes.Op.ne]: null,
        },
      },
    },
    {
      fields: ['userId'],
    },
    {
      fields: ['postId'],
    },
    {
      fields: ['type'],
    },
  ],
});

module.exports = Reaction;