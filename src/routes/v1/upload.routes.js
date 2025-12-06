const express = require('express');
const router = express.Router();
const uploadController = require('../../controllers/upload.controller');
const auth = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const rateLimiter = require('../../middleware/rateLimiter');

// Apply rate limiting for uploads
router.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 20 }));

// All upload routes require authentication
router.use(auth);

// Single file uploads
router.post('/image', upload.single('file'), uploadController.uploadImage);
router.post('/video', upload.single('file'), uploadController.uploadVideo);
router.post('/audio', upload.single('file'), uploadController.uploadAudio);
router.post('/document', upload.single('file'), uploadController.uploadDocument);
router.post('/avatar', upload.single('file'), uploadController.uploadAvatar);
router.post('/cover', upload.single('file'), uploadController.uploadCover);

// Multiple file uploads
router.post('/images', upload.array('files', 10), uploadController.uploadImages);
router.post('/videos', upload.array('files', 5), uploadController.uploadVideos);

// Chunked upload (for large files)
router.post('/chunk', upload.single('chunk'), uploadController.uploadChunk);
router.post('/chunk/complete', uploadController.completeChunkedUpload);

// File management
router.delete('/:fileId', uploadController.deleteFile);
router.get('/:fileId', uploadController.getFileInfo);
router.get('/', uploadController.getUserFiles);

// Presigned URLs (for direct upload to S3/Cloudinary)
router.post('/presigned-url', uploadController.generatePresignedUrl);

module.exports = router;