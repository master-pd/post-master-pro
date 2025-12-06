const express = require('express');
const router = express.Router();
const groupController = require('../../controllers/group.controller');
const validate = require('../../middleware/validate');
const auth = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const rateLimiter = require('../../middleware/rateLimiter');
const {
  createGroupSchema,
  updateGroupSchema,
  inviteMembersSchema,
  updateMemberRoleSchema,
  groupPostSchema,
  groupEventSchema
} = require('../../schemas/group.schema');

// All routes require authentication
router.use(auth.authenticate);

/**
 * @route   GET /api/v1/groups
 * @desc    Get all groups (user's groups + public groups)
 * @access  Private
 */
router.get(
  '/',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 60 }),
  groupController.getGroups
);

/**
 * @route   POST /api/v1/groups
 * @desc    Create a new group
 * @access  Private
 */
router.post(
  '/',
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }), // 5 groups per hour
  upload.single('coverImage'),
  validate(createGroupSchema),
  groupController.createGroup
);

/**
 * @route   GET /api/v1/groups/:id
 * @desc    Get group by ID
 * @access  Private (members + public groups)
 */
router.get(
  '/:id',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  groupController.getGroup
);

/**
 * @route   PUT /api/v1/groups/:id
 * @desc    Update group
 * @access  Private (admin/moderator only)
 */
router.put(
  '/:id',
  upload.single('coverImage'),
  validate(updateGroupSchema),
  groupController.updateGroup
);

/**
 * @route   DELETE /api/v1/groups/:id
 * @desc    Delete group
 * @access  Private (admin only)
 */
router.delete(
  '/:id',
  groupController.deleteGroup
);

/**
 * @route   POST /api/v1/groups/:id/join
 * @desc    Join a group
 * @access  Private
 */
router.post(
  '/:id/join',
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),
  groupController.joinGroup
);

/**
 * @route   POST /api/v1/groups/:id/leave
 * @desc    Leave a group
 * @access  Private
 */
router.post(
  '/:id/leave',
  groupController.leaveGroup
);

/**
 * @route   POST /api/v1/groups/:id/invite
 * @desc    Invite users to group
 * @access  Private (admin/moderator only)
 */
router.post(
  '/:id/invite',
  validate(inviteMembersSchema),
  groupController.inviteMembers
);

/**
 * @route   POST /api/v1/groups/:id/accept-invite
 * @desc    Accept group invitation
 * @access  Private
 */
router.post(
  '/:id/accept-invite',
  groupController.acceptInvitation
);

/**
 * @route   POST /api/v1/groups/:id/decline-invite
 * @desc    Decline group invitation
 * @access  Private
 */
router.post(
  '/:id/decline-invite',
  groupController.declineInvitation
);

/**
 * @route   GET /api/v1/groups/:id/members
 * @desc    Get group members
 * @access  Private (members only)
 */
router.get(
  '/:id/members',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  groupController.getGroupMembers
);

/**
 * @route   PUT /api/v1/groups/:id/members/:userId/role
 * @desc    Update member role
 * @access  Private (admin only)
 */
router.put(
  '/:id/members/:userId/role',
  validate(updateMemberRoleSchema),
  groupController.updateMemberRole
);

/**
 * @route   DELETE /api/v1/groups/:id/members/:userId
 * @desc    Remove member from group
 * @access  Private (admin/moderator only)
 */
router.delete(
  '/:id/members/:userId',
  groupController.removeMember
);

/**
 * @route   GET /api/v1/groups/:id/posts
 * @desc    Get group posts
 * @access  Private (members only)
 */
router.get(
  '/:id/posts',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  groupController.getGroupPosts
);

/**
 * @route   POST /api/v1/groups/:id/posts
 * @desc    Create post in group
 * @access  Private (members only)
 */
router.post(
  '/:id/posts',
  upload.array('media', 10),
  validate(groupPostSchema),
  groupController.createGroupPost
);

/**
 * @route   GET /api/v1/groups/:id/events
 * @desc    Get group events
 * @access  Private (members only)
 */
router.get(
  '/:id/events',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  groupController.getGroupEvents
);

/**
 * @route   POST /api/v1/groups/:id/events
 * @desc    Create event in group
 * @access  Private (members only)
 */
router.post(
  '/:id/events',
  validate(groupEventSchema),
  groupController.createGroupEvent
);

/**
 * @route   GET /api/v1/groups/:id/analytics
 * @desc    Get group analytics
 * @access  Private (admin/moderator only)
 */
router.get(
  '/:id/analytics',
  groupController.getGroupAnalytics
);

/**
 * @route   PUT /api/v1/groups/:id/settings
 * @desc    Update group settings
 * @access  Private (admin only)
 */
router.put(
  '/:id/settings',
  groupController.updateGroupSettings
);

/**
 * @route   GET /api/v1/groups/:id/requests
 * @desc    Get join requests (for private groups)
 * @access  Private (admin/moderator only)
 */
router.get(
  '/:id/requests',
  groupController.getJoinRequests
);

/**
 * @route   POST /api/v1/groups/:id/requests/:requestId/approve
 * @desc    Approve join request
 * @access  Private (admin/moderator only)
 */
router.post(
  '/:id/requests/:requestId/approve',
  groupController.approveJoinRequest
);

/**
 * @route   POST /api/v1/groups/:id/requests/:requestId/reject
 * @desc    Reject join request
 * @access  Private (admin/moderator only)
 */
router.post(
  '/:id/requests/:requestId/reject',
  groupController.rejectJoinRequest
);

/**
 * @route   GET /api/v1/groups/user/:userId
 * @desc    Get user's groups
 * @access  Private
 */
router.get(
  '/user/:userId',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  groupController.getUserGroups
);

/**
 * @route   POST /api/v1/groups/:id/report
 * @desc    Report a group
 * @access  Private
 */
router.post(
  '/:id/report',
  groupController.reportGroup
);

/**
 * @route   GET /api/v1/groups/:id/notifications
 * @desc    Get group notifications
 * @access  Private (members only)
 */
router.get(
  '/:id/notifications',
  groupController.getGroupNotifications
);

/**
 * @route   POST /api/v1/groups/:id/mute
 * @desc    Mute group notifications
 * @access  Private (members only)
 */
router.post(
  '/:id/mute',
  groupController.muteGroup
);

/**
 * @route   POST /api/v1/groups/:id/unmute
 * @desc    Unmute group notifications
 * @access  Private (members only)
 */
router.post(
  '/:id/unmute',
  groupController.unmuteGroup
);

/**
 * @route   GET /api/v1/groups/search
 * @desc    Search groups
 * @access  Private
 */
router.get(
  '/search',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  groupController.searchGroups
);

/**
 * @route   GET /api/v1/groups/suggested
 * @desc    Get suggested groups
 * @access  Private
 */
router.get(
  '/suggested',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
  groupController.getSuggestedGroups
);

module.exports = router;