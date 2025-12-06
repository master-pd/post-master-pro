const express = require('express');
const router = express.Router();
const eventController = require('../../controllers/event.controller');
const validate = require('../../middleware/validate');
const auth = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const rateLimiter = require('../../middleware/rateLimiter');
const {
  createEventSchema,
  updateEventSchema,
  eventQuerySchema,
  userEventsQuerySchema
} = require('../../schemas/event.schema');

// Public routes
/**
 * @route   GET /api/v1/events
 * @desc    Get all events (public events for non-authenticated users)
 * @access  Public/Private
 */
router.get(
  '/',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 60 }),
  validate(eventQuerySchema, 'query'),
  eventController.getEvents
);

/**
 * @route   GET /api/v1/events/:id
 * @desc    Get single event
 * @access  Public/Private
 */
router.get(
  '/:id',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getEvent
);

/**
 * @route   GET /api/v1/events/:id/attendees
 * @desc    Get event attendees
 * @access  Public/Private
 */
router.get(
  '/:id/attendees',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getEventAttendees
);

/**
 * @route   GET /api/v1/events/user/:userId
 * @desc    Get user's events
 * @access  Public/Private
 */
router.get(
  '/user/:userId',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  validate(userEventsQuerySchema, 'query'),
  eventController.getUserEvents
);

// Protected routes (require authentication)
router.use(auth.authenticate);

/**
 * @route   POST /api/v1/events
 * @desc    Create a new event
 * @access  Private
 */
router.post(
  '/',
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }), // 10 events per hour
  upload.single('coverImage'),
  validate(createEventSchema),
  eventController.createEvent
);

/**
 * @route   PUT /api/v1/events/:id
 * @desc    Update event
 * @access  Private (Organizer only)
 */
router.put(
  '/:id',
  upload.single('coverImage'),
  validate(updateEventSchema),
  eventController.updateEvent
);

/**
 * @route   DELETE /api/v1/events/:id
 * @desc    Delete event
 * @access  Private (Organizer/Admin only)
 */
router.delete(
  '/:id',
  eventController.deleteEvent
);

/**
 * @route   POST /api/v1/events/:id/join
 * @desc    Join event
 * @access  Private
 */
router.post(
  '/:id/join',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }),
  eventController.joinEvent
);

/**
 * @route   POST /api/v1/events/:id/leave
 * @desc    Leave event
 * @access  Private
 */
router.post(
  '/:id/leave',
  eventController.leaveEvent
);

/**
 * @route   POST /api/v1/events/:id/invite
 * @desc    Invite users to event
 * @access  Private (Organizer only)
 */
router.post(
  '/:id/invite',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }),
  eventController.inviteUsers
);

/**
 * @route   POST /api/v1/events/:id/accept-invite
 * @desc    Accept event invitation
 * @access  Private
 */
router.post(
  '/:id/accept-invite',
  eventController.acceptInvitation
);

/**
 * @route   POST /api/v1/events/:id/decline-invite
 * @desc    Decline event invitation
 * @access  Private
 */
router.post(
  '/:id/decline-invite',
  eventController.declineInvitation
);

/**
 * @route   GET /api/v1/events/:id/invitations
 * @desc    Get event invitations (sent)
 * @access  Private (Organizer only)
 */
router.get(
  '/:id/invitations',
  eventController.getEventInvitations
);

/**
 * @route   GET /api/v1/events/:id/pending-invitations
 * @desc    Get pending invitations (for private events)
 * @access  Private (Organizer only)
 */
router.get(
  '/:id/pending-invitations',
  eventController.getPendingInvitations
);

/**
 * @route   POST /api/v1/events/:id/pending-invitations/:userId/approve
 * @desc    Approve pending invitation
 * @access  Private (Organizer only)
 */
router.post(
  '/:id/pending-invitations/:userId/approve',
  eventController.approveInvitation
);

/**
 * @route   POST /api/v1/events/:id/pending-invitations/:userId/reject
 * @desc    Reject pending invitation
 * @access  Private (Organizer only)
 */
router.post(
  '/:id/pending-invitations/:userId/reject',
  eventController.rejectInvitation
);

/**
 * @route   POST /api/v1/events/:id/check-in
 * @desc    Check-in to event (for organizers)
 * @access  Private (Organizer only)
 */
router.post(
  '/:id/check-in/:userId',
  eventController.checkInAttendee
);

/**
 * @route   GET /api/v1/events/:id/check-ins
 * @desc    Get event check-ins
 * @access  Private (Organizer only)
 */
router.get(
  '/:id/check-ins',
  eventController.getEventCheckIns
);

/**
 * @route   POST /api/v1/events/:id/share
 * @desc    Share event
 * @access  Private
 */
router.post(
  '/:id/share',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  eventController.shareEvent
);

/**
 * @route   POST /api/v1/events/:id/report
 * @desc    Report event
 * @access  Private
 */
router.post(
  '/:id/report',
  eventController.reportEvent
);

/**
 * @route   GET /api/v1/events/:id/analytics
 * @desc    Get event analytics
 * @access  Private (Organizer only)
 */
router.get(
  '/:id/analytics',
  eventController.getEventAnalytics
);

/**
 * @route   POST /api/v1/events/:id/reminder
 * @desc    Set event reminder
 * @access  Private
 */
router.post(
  '/:id/reminder',
  eventController.setEventReminder
);

/**
 * @route   DELETE /api/v1/events/:id/reminder
 * @desc    Remove event reminder
 * @access  Private
 */
router.delete(
  '/:id/reminder',
  eventController.removeEventReminder
);

/**
 * @route   GET /api/v1/events/:id/comments
 * @desc    Get event comments
 * @access  Public/Private
 */
router.get(
  '/:id/comments',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getEventComments
);

/**
 * @route   POST /api/v1/events/:id/comments
 * @desc    Add comment to event
 * @access  Private
 */
router.post(
  '/:id/comments',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }),
  eventController.addEventComment
);

/**
 * @route   GET /api/v1/events/categories
 * @desc    Get event categories
 * @access  Public
 */
router.get(
  '/categories',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getEventCategories
);

/**
 * @route   GET /api/v1/events/trending
 * @desc    Get trending events
 * @access  Public
 */
router.get(
  '/trending',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getTrendingEvents
);

/**
 * @route   GET /api/v1/events/nearby
 * @desc    Get nearby events
 * @access  Public/Private
 */
router.get(
  '/nearby',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getNearbyEvents
);

/**
 * @route   GET /api/v1/events/upcoming
 * @desc    Get upcoming events
 * @access  Public/Private
 */
router.get(
  '/upcoming',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getUpcomingEvents
);

/**
 * @route   GET /api/v1/events/past
 * @desc    Get past events
 * @access  Public/Private
 */
router.get(
  '/past',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getPastEvents
);

/**
 * @route   GET /api/v1/events/calendar
 * @desc    Get events for calendar view
 * @access  Private
 */
router.get(
  '/calendar',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getCalendarEvents
);

/**
 * @route   POST /api/v1/events/:id/rsvp
 * @desc    RSVP to event (Yes/No/Maybe)
 * @access  Private
 */
router.post(
  '/:id/rsvp',
  eventController.rsvpToEvent
);

/**
 * @route   GET /api/v1/events/:id/rsvps
 * @desc    Get event RSVPs
 * @access  Public/Private
 */
router.get(
  '/:id/rsvps',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  eventController.getEventRSVPs
);

module.exports = router;