const express = require('express');
const router = express.Router();
const storyController = require('../../controllers/story.controller');
const auth = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }));

// All story routes require authentication
router.use(auth);

// Story CRUD
router.post('/', upload.single('media'), storyController.createStory);
router.get('/', storyController.getStories);
router.get('/:storyId', storyController.getStory);
router.delete('/:storyId', storyController.deleteStory);

// Interactions
router.post('/:storyId/view', storyController.viewStory);
router.post('/:storyId/reply', storyController.replyToStory);
router.post('/:storyId/share', storyController.shareStory);
router.post('/:storyId/reaction', storyController.addReaction);

// Archive
router.get('/archive', storyController.getArchive);
router.post('/archive/:storyId', storyController.archiveStory);
router.delete('/archive/:storyId', storyController.deleteFromArchive);

// Highlights
router.post('/highlights', storyController.createHighlight);
router.get('/highlights', storyController.getHighlights);
router.get('/highlights/:highlightId', storyController.getHighlight);
router.put('/highlights/:highlightId', storyController.updateHighlight);
router.delete('/highlights/:highlightId', storyController.deleteHighlight);

module.exports = router;