const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Report = sequelize.define('Report', {
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
  userReportedId: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  groupId: {
    type: DataTypes.UUID,
    references: {
      model: 'Groups',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM(
      'spam',
      'harassment',
      'hate_speech',
      'violence',
      'nudity',
      'false_information',
      'intellectual_property',
      'other'
    ),
    allowNull: false,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  evidence: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('evidence');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('evidence', JSON.stringify(value || []));
    },
  },
  status: {
    type: DataTypes.ENUM('pending', 'under_review', 'resolved', 'dismissed'),
    defaultValue: 'pending',
  },
  resolution: {
    type: DataTypes.TEXT,
  },
  resolvedBy: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  resolvedAt: {
    type: DataTypes.DATE,
  },
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
  },
  isAnonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
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
      fields: ['userReportedId'],
    },
    {
      fields: ['status'],
    },
    {
      fields: ['type'],
    },
    {
      fields: ['createdAt'],
    },
  ],
});

module.exports = Report;