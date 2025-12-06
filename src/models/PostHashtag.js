const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PostHashtag = sequelize.define('PostHashtag', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  postId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Posts',
      key: 'id',
    },
  },
  hashtagId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Hashtags',
      key: 'id',
    },
  },
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['postId', 'hashtagId'],
    },
    {
      fields: ['postId'],
    },
    {
      fields: ['hashtagId'],
    },
  ],
});

module.exports = PostHashtag;