const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  avatar: {
    type: DataTypes.STRING,
  },
  coverPhoto: {
    type: DataTypes.STRING,
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  type: {
    type: DataTypes.ENUM('public', 'private', 'secret'),
    defaultValue: 'public',
  },
  category: {
    type: DataTypes.STRING(50),
  },
  rules: {
    type: DataTypes.TEXT,
  },
  location: {
    type: DataTypes.STRING,
  },
  website: {
    type: DataTypes.STRING,
  },
  email: {
    type: DataTypes.STRING,
    validate: {
      isEmail: true,
    },
  },
  phone: {
    type: DataTypes.STRING(20),
  },
  membersCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  postsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  eventsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  mediaCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  verificationStatus: {
    type: DataTypes.ENUM('pending', 'verified', 'rejected'),
    defaultValue: 'pending',
  },
  verificationData: {
    type: DataTypes.JSON,
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {},
    get() {
      const rawValue = this.getDataValue('settings');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('settings', JSON.stringify(value || {}));
    },
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
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
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
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['slug'],
      unique: true,
    },
    {
      fields: ['createdBy'],
    },
    {
      fields: ['type'],
    },
    {
      fields: ['category'],
    },
    {
      fields: ['membersCount'],
    },
    {
      fields: ['isVerified'],
    },
    {
      fields: ['isActive'],
    },
  ],
});

// Instance methods
Group.prototype.incrementMembers = async function () {
  this.membersCount += 1;
  await this.save();
};

Group.prototype.decrementMembers = async function () {
  this.membersCount = Math.max(0, this.membersCount - 1);
  await this.save();
};

Group.prototype.incrementPosts = async function () {
  this.postsCount += 1;
  await this.save();
};

Group.prototype.canJoin = function (userId) {
  if (this.isBanned) return false;
  
  switch (this.type) {
    case 'public':
      return true;
    case 'private':
      // Requires approval
      return false;
    case 'secret':
      // Requires invitation
      return false;
    default:
      return false;
  }
};

Group.prototype.getPrivacyLabel = function () {
  switch (this.type) {
    case 'public':
      return 'Public - Anyone can join and see posts';
    case 'private':
      return 'Private - Anyone can request to join';
    case 'secret':
      return 'Secret - Only members can see the group';
    default:
      return 'Unknown';
  }
};

module.exports = Group;