const express = require('express');
const router = express.Router();
const feedController = require('../../controllers/feed.controller');
const auth = require('../../middleware/auth');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

// All feed routes require authentication
router.use(auth);

// Main feeds
router.get('/home', feedController.getHomeFeed);
router.get('/for-you', feedController.getForYouFeed);
router.get('/following', feedController.getFollowingFeed);

// Content type feeds
router.get('/videos', feedController.getVideoFeed);
router.get('/photos', feedController.getPhotoFeed);
router.get('/saved', feedController.getSavedFeed);

// Explore
router.get('/explore', feedController.getExploreFeed);
router.get('/trending', feedController.getTrendingFeed);

// Personalized
router.get('/recommended', feedController.getRecommendedFeed);
router.get('/interests', feedController.getInterestBasedFeed);

module.exports = router;