const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// Create uploads directory if it doesn't exist
const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File filter
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp|bmp|svg/;
  const allowedVideoTypes = /mp4|webm|mov|avi|mkv|flv|wmv/;
  const allowedAudioTypes = /mp3|wav|ogg|m4a|flac|aac/;
  const allowedDocumentTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|csv/;

  let isValid = false;
  
  switch (file.fieldname) {
    case 'image':
    case 'images':
    case 'avatar':
    case 'profilePicture':
    case 'coverPhoto':
    case 'thumbnail':
      isValid = allowedImageTypes.test(path.extname(file.originalname).toLowerCase());
      break;
      
    case 'video':
    case 'videos':
      isValid = allowedVideoTypes.test(path.extname(file.originalname).toLowerCase());
      break;
      
    case 'audio':
      isValid = allowedAudioTypes.test(path.extname(file.originalname).toLowerCase());
      break;
      
    case 'document':
    case 'documents':
      isValid = allowedDocumentTypes.test(path.extname(file.originalname).toLowerCase());
      break;
      
    default:
      // For generic file uploads
      const fileExt = path.extname(file.originalname).toLowerCase().substring(1);
      isValid = allowedImageTypes.test(fileExt) || 
                allowedVideoTypes.test(fileExt) || 
                allowedAudioTypes.test(fileExt) || 
                allowedDocumentTypes.test(fileExt);
  }

  if (isValid) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `Invalid file type: ${file.originalname}. Allowed types: images, videos, audio, documents`), false);
  }
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'general';
    
    switch (file.fieldname) {
      case 'avatar':
      case 'profilePicture':
        folder = 'avatars';
        break;
      case 'coverPhoto':
      case 'cover':
        folder = 'covers';
        break;
      case 'image':
      case 'images':
        folder = 'images';
        break;
      case 'video':
      case 'videos':
        folder = 'videos';
        break;
      case 'audio':
        folder = 'audio';
        break;
      case 'document':
      case 'documents':
        folder = 'documents';
        break;
    }
    
    const dir = `${uploadDir}/${folder}`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  },
});

// File size limits
const limits = {
  fileSize: config.MAX_FILE_SIZE || 50 * 1024 * 1024, // 50MB default
  files: 10, // Max number of files
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits,
});

// Chunked upload storage (for large files)
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadId = req.body.uploadId;
    const dir = `${uploadDir}/chunks/${uploadId}`;
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  
  filename: (req, file, cb) => {
    const chunkIndex = req.body.chunkIndex;
    const totalChunks = req.body.totalChunks;
    cb(null, `chunk-${chunkIndex}-of-${totalChunks}`);
  },
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per chunk
  },
});

// Middleware to handle file size errors
const handleFileSizeError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, 'File size too large. Please upload a smaller file.'));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new ApiError(400, 'Too many files uploaded.'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new ApiError(400, 'Unexpected file field.'));
    }
  }
  next(err);
};

// Helper to get file info
const getFileInfo = (file) => {
  return {
    originalname: file.originalname,
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
    encoding: file.encoding,
    fieldname: file.fieldname,
  };
};

// Helper to delete uploaded files on error
const cleanupFiles = (files) => {
  if (!files) return;
  
  const fileArray = Array.isArray(files) ? files : Object.values(files).flat();
  
  fileArray.forEach(file => {
    if (file.path && fs.existsSync(file.path)) {
      fs.unlink(file.path, (err) => {
        if (err) {
          logger.error(`Failed to delete file ${file.path}:`, err);
        }
      });
    }
  });
};

module.exports = {
  upload,
  chunkUpload,
  handleFileSizeError,
  getFileInfo,
  cleanupFiles,
};