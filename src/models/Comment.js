const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Comment = sequelize.define('Comment', {
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
  parentId: {
    type: DataTypes.UUID,
    references: {
      model: 'Comments',
      key: 'id',
    },
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 5000],
    },
  },
  mediaUrl: {
    type: DataTypes.STRING,
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
  likesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  repliesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
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
}, {
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      fields: ['postId'],
    },
    {
      fields: ['userId'],
    },
    {
      fields: ['parentId'],
    },
    {
      fields: ['createdAt'],
    },
  ],
});

// Instance methods
Comment.prototype.incrementLikes = async function () {
  this.likesCount += 1;
  await this.save();
};

Comment.prototype.decrementLikes = async function () {
  this.likesCount = Math.max(0, this.likesCount - 1);
  await this.save();
};

Comment.prototype.incrementReplies = async function () {
  this.repliesCount += 1;
  await this.save();
};

Comment.prototype.toJSON = function () {
  const values = Object.assign({}, this.get());
  delete values.isDeleted;
  delete values.deletedAt;
  return values;
};

module.exports = Comment;