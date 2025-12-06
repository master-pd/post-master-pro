const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Event = require('../models/Event');
const User = require('../models/User');
const Group = require('../models/Group');
const { Op } = require('sequelize');

/**
 * @desc    Create a new event
 * @route   POST /api/v1/events
 * @access  Private
 */
const createEvent = asyncHandler(async (req, res, next) => {
  const {
    title,
    description,
    startDate,
    endDate,
    location,
    latitude,
    longitude,
    isOnline,
    onlineLink,
    maxAttendees,
    category,
    tags,
    coverImage,
    privacy
  } = req.body;

  const event = await Event.create({
    title,
    description,
    organizerId: req.user.userId,
    startDate,
    endDate,
    location,
    latitude,
    longitude,
    isOnline,
    onlineLink,
    maxAttendees,
    category,
    tags: tags || [],
    coverImage,
    privacy: privacy || 'public'
  });

  // Auto join the organizer
  await event.addAttendee(req.user.userId);

  const response = new ApiResponse(
    201,
    { event },
    'Event created successfully'
  );

  res.status(201).json(response);
});

/**
 * @desc    Get all events
 * @route   GET /api/v1/events
 * @access  Public/Private
 */
const getEvents = asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    category,
    location,
    dateFrom,
    dateTo,
    isOnline,
    search,
    sortBy = 'startDate',
    sortOrder = 'ASC'
  } = req.query;

  const where = {};
  const include = [
    {
      model: User,
      as: 'organizer',
      attributes: ['id', 'username', 'fullName', 'profilePicture']
    }
  ];

  // Apply filters
  if (category) where.category = category;
  if (location) where.location = { [Op.iLike]: `%${location}%` };
  if (isOnline !== undefined) where.isOnline = isOnline === 'true';

  // Date range filter
  if (dateFrom || dateTo) {
    where.startDate = {};
    if (dateFrom) where.startDate[Op.gte] = new Date(dateFrom);
    if (dateTo) where.startDate[Op.lte] = new Date(dateTo);
  }

  // Search filter
  if (search) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } },
      { tags: { [Op.contains]: [search] } }
    ];
  }

  // Privacy filter (show public events for non-authenticated users)
  if (!req.user) {
    where.privacy = 'public';
  } else {
    // Show public events and events user is invited to
    where[Op.or] = [
      { privacy: 'public' },
      { '$attendees.id$': req.user.userId },
      { organizerId: req.user.userId }
    ];
  }

  const offset = (page - 1) * limit;
  const order = [[sortBy, sortOrder]];

  const { count, rows: events } = await Event.findAndCountAll({
    where,
    include,
    distinct: true,
    offset,
    limit: parseInt(limit),
    order
  });

  // Check if user is attending each event
  if (req.user) {
    for (const event of events) {
      const isAttending = await event.hasAttendee(req.user.userId);
      event.dataValues.isAttending = isAttending;
    }
  }

  const response = new ApiResponse(
    200,
    {
      events,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    },
    'Events retrieved successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Get single event
 * @route   GET /api/v1/events/:id
 * @access  Public/Private
 */
const getEvent = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const event = await Event.findByPk(id, {
    include: [
      {
        model: User,
        as: 'organizer',
        attributes: ['id', 'username', 'fullName', 'profilePicture']
      },
      {
        model: User,
        as: 'attendees',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
        through: { attributes: [] }
      }
    ]
  });

  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  // Check access permission
  if (event.privacy !== 'public' && (!req.user || 
      (req.user.userId !== event.organizerId && 
       !event.attendees.some(a => a.id === req.user.userId)))) {
    throw new ApiError(403, 'You do not have permission to view this event');
  }

  if (req.user) {
    const isAttending = await event.hasAttendee(req.user.userId);
    event.dataValues.isAttending = isAttending;
  }

  // Increment views
  await event.increment('viewsCount');

  const response = new ApiResponse(
    200,
    { event },
    'Event retrieved successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Update event
 * @route   PUT /api/v1/events/:id
 * @access  Private (Organizer only)
 */
const updateEvent = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  const event = await Event.findByPk(id);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  // Check if user is the organizer
  if (event.organizerId !== req.user.userId && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only the organizer can update this event');
  }

  // Prevent updating certain fields
  delete updateData.organizerId;
  delete updateData.attendeesCount;
  delete updateData.viewsCount;

  // Update event
  Object.assign(event, updateData);
  await event.save();

  const response = new ApiResponse(
    200,
    { event },
    'Event updated successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Delete event
 * @route   DELETE /api/v1/events/:id
 * @access  Private (Organizer/Admin only)
 */
const deleteEvent = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const event = await Event.findByPk(id);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  // Check if user is the organizer or admin
  if (event.organizerId !== req.user.userId && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only the organizer or admin can delete this event');
  }

  await event.destroy();

  const response = new ApiResponse(
    200,
    null,
    'Event deleted successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Join event
 * @route   POST /api/v1/events/:id/join
 * @access  Private
 */
const joinEvent = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const event = await Event.findByPk(id);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  // Check if event is full
  if (event.maxAttendees && event.attendeesCount >= event.maxAttendees) {
    throw new ApiError(400, 'Event is full');
  }

  // Check if user is already attending
  const isAttending = await event.hasAttendee(req.user.userId);
  if (isAttending) {
    throw new ApiError(400, 'You are already attending this event');
  }

  // Check if event requires approval
  if (event.privacy === 'private') {
    // Add to pending list (implement later)
    throw new ApiError(400, 'This event requires organizer approval');
  }

  // Add attendee
  await event.addAttendee(req.user.userId);

  // Increment attendees count
  await event.increment('attendeesCount');

  const response = new ApiResponse(
    200,
    null,
    'Successfully joined the event'
  );

  res.status(200).json(response);
});

/**
 * @desc    Leave event
 * @route   POST /api/v1/events/:id/leave
 * @access  Private
 */
const leaveEvent = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const event = await Event.findByPk(id);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  // Check if user is attending
  const isAttending = await event.hasAttendee(req.user.userId);
  if (!isAttending) {
    throw new ApiError(400, 'You are not attending this event');
  }

  // Check if user is the organizer
  if (event.organizerId === req.user.userId) {
    throw new ApiError(400, 'Organizer cannot leave the event');
  }

  // Remove attendee
  await event.removeAttendee(req.user.userId);

  // Decrement attendees count
  await event.decrement('attendeesCount');

  const response = new ApiResponse(
    200,
    null,
    'Successfully left the event'
  );

  res.status(200).json(response);
});

/**
 * @desc    Get event attendees
 * @route   GET /api/v1/events/:id/attendees
 * @access  Public/Private
 */
const getEventAttendees = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const event = await Event.findByPk(id);
  if (!event) {
    throw new ApiError(404, 'Event not found');
  }

  const offset = (page - 1) * limit;

  const { count, rows: attendees } = await event.getAttendees({
    attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio'],
    limit: parseInt(limit),
    offset
  });

  const response = new ApiResponse(
    200,
    {
      attendees,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    },
    'Event attendees retrieved successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Get user's events
 * @route   GET /api/v1/events/user/:userId
 * @access  Public/Private
 */
const getUserEvents = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { type = 'upcoming', page = 1, limit = 10 } = req.query;

  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const where = {};
  const include = [];

  if (type === 'upcoming') {
    where.startDate = { [Op.gte]: new Date() };
  } else if (type === 'past') {
    where.startDate = { [Op.lt]: new Date() };
  } else if (type === 'organized') {
    where.organizerId = userId;
  } else if (type === 'attending') {
    include.push({
      model: User,
      as: 'attendees',
      where: { id: userId },
      attributes: []
    });
  }

  const offset = (page - 1) * limit;

  const { count, rows: events } = await Event.findAndCountAll({
    where,
    include,
    distinct: true,
    offset,
    limit: parseInt(limit),
    order: [['startDate', 'ASC']]
  });

  const response = new ApiResponse(
    200,
    {
      events,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    },
    'User events retrieved successfully'
  );

  res.status(200).json(response);
});

module.exports = {
  createEvent,
  getEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  joinEvent,
  leaveEvent,
  getEventAttendees,
  getUserEvents
};