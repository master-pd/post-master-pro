const express = require('express');
const router = express.Router();
const userController = require('../../controllers/user.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

// Public routes
router.get('/:userId', userController.getUserProfile);
router.get('/:userId/followers', userController.getFollowers);
router.get('/:userId/following', userController.getFollowing);
router.get('/search', userController.searchUsers);

// Protected routes
router.use(auth);

// Profile management
router.put('/me', upload.fields([
  { name: 'profilePicture', maxCount: 1 },
  { name: 'coverPhoto', maxCount: 1 },
]), userController.updateProfile);

router.put('/me/password', userController.changePassword);
router.post('/me/deactivate', userController.deactivateAccount);
router.post('/me/delete', userController.deleteAccount);
router.post('/reactivate', userController.reactivateAccount);

// Follow/unfollow
router.post('/:userId/follow', userController.toggleFollow);
router.put('/follow-requests/:followId', userController.handleFollowRequest);

// Block/unblock
router.post('/:userId/block', userController.toggleBlock);
router.get('/blocks', userController.getBlockedUsers);

// Suggestions
router.get('/suggestions', userController.getSuggestedUsers);

// Settings
router.get('/me/settings', userController.getSettings);
router.put('/me/settings', userController.updateSettings);

module.exports = router;