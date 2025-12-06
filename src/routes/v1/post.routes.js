const express = require('express');
const router = express.Router();
const postController = require('../../controllers/post.controller');
const commentController = require('../../controllers/comment.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

// Public routes
router.get('/:postId', postController.getPost);
router.get('/:postId/comments', commentController.getPostComments);
router.get('/:postId/likes', postController.getPostLikes);

// Protected routes
router.use(auth);

// Post CRUD
router.post('/', upload.array('media', 10), postController.createPost);
router.put('/:postId', upload.array('media', 10), postController.updatePost);
router.delete('/:postId', postController.deletePost);

// Interactions
router.post('/:postId/like', postController.toggleLike);
router.post('/:postId/save', postController.toggleSave);
router.post('/:postId/share', postController.sharePost);
router.post('/:postId/report', postController.reportPost);

// Analytics
router.get('/:postId/analytics', postController.getPostAnalytics);

// User posts
router.get('/user/:userId', postController.getUserPosts);

// Trending and explore
router.get('/trending', postController.getTrendingPosts);
router.get('/explore', postController.getExplorePosts);

// Comment routes
router.post('/:postId/comments', commentController.createComment);
router.put('/comments/:commentId', commentController.updateComment);
router.delete('/comments/:commentId', commentController.deleteComment);
router.post('/comments/:commentId/like', commentController.toggleLike);
router.post('/comments/:commentId/reply', commentController.createReply);

module.exports = router;