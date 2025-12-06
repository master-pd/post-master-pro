const express = require('express');
const router = express.Router();
const searchController = require('../../controllers/search.controller');
const auth = require('../../middleware/auth');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

// Public search
router.get('/global', searchController.globalSearch);

// Protected routes
router.use(auth);

// Specific searches
router.get('/users', searchController.searchUsers);
router.get('/posts', searchController.searchPosts);
router.get('/groups', searchController.searchGroups);
router.get('/hashtags', searchController.searchHashtags);
router.get('/events', searchController.searchEvents);

// Advanced search
router.get('/advanced', searchController.advancedSearch);

// Recent searches
router.get('/recent', searchController.getRecentSearches);
router.delete('/recent', searchController.clearRecentSearches);
router.delete('/recent/:searchId', searchController.deleteRecentSearch);

// Trending searches
router.get('/trending', searchController.getTrendingSearches);

module.exports = router;