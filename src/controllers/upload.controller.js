const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const fileService = require('../services/file.service');
const logger = require('../utils/logger');

class UploadController {
  // Upload image
  uploadImage = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'Image file is required');
    }
    
    const result = await fileService.uploadImage(req.file, {
      folder: 'uploads/images',
    });
    
    logger.info(`Image uploaded: ${result.url} by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Image uploaded successfully', {
      file: result,
    });
  });

  // Upload video
  uploadVideo = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'Video file is required');
    }
    
    const result = await fileService.uploadVideo(req.file, {
      folder: 'uploads/videos',
    });
    
    logger.info(`Video uploaded: ${result.url} by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Video uploaded successfully', {
      file: result,
    });
  });

  // Upload audio
  uploadAudio = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'Audio file is required');
    }
    
    const result = await fileService.uploadAudio(req.file, {
      folder: 'uploads/audio',
    });
    
    logger.info(`Audio uploaded: ${result.url} by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Audio uploaded successfully', {
      file: result,
    });
  });

  // Upload document
  uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'Document file is required');
    }
    
    const result = await fileService.uploadDocument(req.file, {
      folder: 'uploads/documents',
    });
    
    logger.info(`Document uploaded: ${result.url} by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Document uploaded successfully', {
      file: result,
    });
  });

  // Upload avatar
  uploadAvatar = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'Avatar image is required');
    }
    
    const result = await fileService.uploadProfilePicture(req.file);
    
    logger.info(`Avatar uploaded: ${result.original} by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Avatar uploaded successfully', {
      avatar: result,
    });
  });

  // Upload cover photo
  uploadCover = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'Cover photo is required');
    }
    
    const result = await fileService.uploadCoverPhoto(req.file);
    
    logger.info(`Cover photo uploaded: ${result.original} by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Cover photo uploaded successfully', {
      cover: result,
    });
  });

  // Upload multiple images
  uploadImages = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      throw new ApiError(400, 'Image files are required');
    }
    
    const results = await fileService.processFiles(req.files, 'image');
    
    logger.info(`${results.length} images uploaded by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Images uploaded successfully', {
      files: results,
    });
  });

  // Upload multiple videos
  uploadVideos = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      throw new ApiError(400, 'Video files are required');
    }
    
    const results = await fileService.processFiles(req.files, 'video');
    
    logger.info(`${results.length} videos uploaded by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'Videos uploaded successfully', {
      files: results,
    });
  });

  // Upload chunk (for large files)
  uploadChunk = asyncHandler(async (req, res) => {
    const { uploadId, chunkIndex, totalChunks, filename } = req.body;
    
    if (!req.file || !uploadId || chunkIndex === undefined || !totalChunks) {
      throw new ApiError(400, 'Missing required parameters');
    }
    
    const result = await fileService.handleChunkedUpload(
      req.file,
      uploadId,
      parseInt(chunkIndex),
      parseInt(totalChunks)
    );
    
    new ApiResponse(res, 200, 'Chunk uploaded successfully', {
      ...result,
      chunkReceived: true,
    });
  });

  // Complete chunked upload
  completeChunkedUpload = asyncHandler(async (req, res) => {
    const { uploadId, filename, type = 'video', options = {} } = req.body;
    
    if (!uploadId || !filename) {
      throw new ApiError(400, 'Missing required parameters');
    }
    
    const result = await fileService.completeChunkedUpload(
      uploadId,
      filename,
      { type, ...options }
    );
    
    logger.info(`Chunked upload completed: ${result.url} by user ${req.user.id}`);
    
    new ApiResponse(res, 201, 'File upload completed successfully', {
      file: result,
    });
  });

  // Delete file
  deleteFile = asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const { url } = req.body;
    
    if (!url) {
      throw new ApiError(400, 'File URL is required');
    }
    
    const success = await fileService.deleteFile(url);
    
    if (success) {
      logger.info(`File deleted: ${url} by user ${req.user.id}`);
      new ApiResponse(res, 200, 'File deleted successfully');
    } else {
      throw new ApiError(500, 'Failed to delete file');
    }
  });

  // Get file info
  getFileInfo = asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const { url } = req.query;
    
    if (!url) {
      throw new ApiError(400, 'File URL is required');
    }
    
    const info = await fileService.getFileInfo(url);
    
    if (info) {
      new ApiResponse(res, 200, 'File info retrieved successfully', {
        file: info,
      });
    } else {
      throw new ApiError(404, 'File not found');
    }
  });

  // Get user files
  getUserFiles = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { type, page = 1, limit = 20 } = req.query;
    
    // This would query a File model
    // For now, return empty array
    
    new ApiResponse(res, 200, 'User files retrieved successfully', {
      files: [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  });

  // Generate presigned URL for direct upload
  generatePresignedUrl = asyncHandler(async (req, res) => {
    const { filename, fileType, chunks, chunkSize } = req.body;
    
    if (!filename || !fileType) {
      throw new ApiError(400, 'Filename and file type are required');
    }
    
    const presignedUrl = await fileService.generatePresignedUrl(
      filename,
      fileType,
      { chunks, chunkSize }
    );
    
    new ApiResponse(res, 200, 'Presigned URL generated successfully', {
      presignedUrl,
    });
  });

  // Get upload limits
  getUploadLimits = asyncHandler(async (req, res) => {
    const config = require('../config');
    
    new ApiResponse(res, 200, 'Upload limits retrieved successfully', {
      limits: {
        maxFileSize: config.MAX_FILE_SIZE,
        maxImageSize: config.MAX_IMAGE_SIZE,
        maxVideoSize: config.MAX_VIDEO_SIZE,
        maxAudioSize: config.MAX_AUDIO_SIZE,
        maxDocumentSize: config.MAX_DOCUMENT_SIZE,
        allowedImageTypes: fileService.allowedImageTypes,
        allowedVideoTypes: fileService.allowedVideoTypes,
        allowedAudioTypes: fileService.allowedAudioTypes,
        allowedDocumentTypes: fileService.allowedDocumentTypes,
      },
    });
  });
}

module.exports = new UploadController();