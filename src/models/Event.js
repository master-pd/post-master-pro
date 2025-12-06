const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Event = sequelize.define('Event', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
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
    type: DataTypes.ENUM('online', 'offline', 'hybrid'),
    defaultValue: 'offline',
  },
  coverPhoto: {
    type: DataTypes.STRING,
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'UTC',
  },
  location: {
    type: DataTypes.STRING,
  },
  address: {
    type: DataTypes.TEXT,
  },
  latitude: {
    type: DataTypes.FLOAT,
  },
  longitude: {
    type: DataTypes.FLOAT,
  },
  onlineLink: {
    type: DataTypes.STRING,
  },
  onlinePlatform: {
    type: DataTypes.STRING(50),
  },
  category: {
    type: DataTypes.STRING(50),
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
  privacy: {
    type: DataTypes.ENUM('public', 'private', 'group_only'),
    defaultValue: 'public',
  },
  maxAttendees: {
    type: DataTypes.INTEGER,
  },
  attendeesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  goingCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  interestedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  maybeCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  notGoingCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  ticketsEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ticketPrice: {
    type: DataTypes.DECIMAL(10, 2),
  },
  ticketCurrency: {
    type: DataTypes.STRING(3),
    defaultValue: 'USD',
  },
  ticketLink: {
    type: DataTypes.STRING,
  },
  rsvpDeadline: {
    type: DataTypes.DATE,
  },
  isRecurring: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  recurrencePattern: {
    type: DataTypes.JSON,
  },
  reminders: {
    type: DataTypes.JSON,
  },
  isFeatured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  isCancelled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  cancelledAt: {
    type: DataTypes.DATE,
  },
  cancelledReason: {
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
      fields: ['createdBy'],
    },
    {
      fields: ['groupId'],
    },
    {
      fields: ['startDate'],
    },
    {
      fields: ['privacy'],
    },
    {
      fields: ['category'],
    },
    {
      fields: ['isFeatured'],
    },
    {
      fields: ['isCancelled'],
    },
  ],
});

// Instance methods
Event.prototype.incrementGoing = async function () {
  this.goingCount += 1;
  this.attendeesCount += 1;
  await this.save();
};

Event.prototype.incrementInterested = async function () {
  this.interestedCount += 1;
  await this.save();
};

Event.prototype.isFull = function () {
  return this.maxAttendees && this.attendeesCount >= this.maxAttendees;
};

Event.prototype.isPast = function () {
  return new Date() > this.endDate;
};

Event.prototype.isUpcoming = function () {
  return new Date() < this.startDate;
};

Event.prototype.isOngoing = function () {
  const now = new Date();
  return now >= this.startDate && now <= this.endDate;
};

Event.prototype.getStatus = function () {
  if (this.isCancelled) return 'cancelled';
  if (this.isPast()) return 'past';
  if (this.isOngoing()) return 'ongoing';
  if (this.isUpcoming()) return 'upcoming';
  return 'scheduled';
};

module.exports = Event;