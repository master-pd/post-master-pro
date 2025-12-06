const express = require('express');
const router = express.Router();
const chatController = require('../../controllers/chat.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }));

// All chat routes require authentication
router.use(auth);

// Conversations
router.get('/conversations', chatController.getConversations);
router.post('/conversations', chatController.createConversation);
router.get('/conversations/:conversationId', chatController.getConversation);
router.put('/conversations/:conversationId', chatController.updateConversation);
router.delete('/conversations/:conversationId', chatController.deleteConversation);

// Messages
router.get('/conversations/:conversationId/messages', chatController.getMessages);
router.post('/messages', upload.array('attachments', 10), chatController.sendMessage);
router.put('/messages/:messageId', chatController.updateMessage);
router.delete('/messages/:messageId', chatController.deleteMessage);

// Typing indicators
router.post('/typing', chatController.sendTypingIndicator);

// Unread count
router.get('/unread-count', chatController.getUnreadCount);

// Group chat
router.post('/groups', chatController.createGroup);
router.put('/groups/:groupId', chatController.updateGroup);
router.post('/groups/:groupId/members', chatController.addGroupMembers);
router.delete('/groups/:groupId/members/:memberId', chatController.removeGroupMember);

// Message reactions
router.post('/messages/:messageId/reactions', chatController.addReaction);
router.delete('/messages/:messageId/reactions', chatController.removeReaction);

module.exports = router;