const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const config = require('../config');
const logger = require('../utils/logger');
const { cloudinary, uploadToCloudinary, deleteFromCloudinary, generateVideoThumbnail } = require('../config/cloudinary');
const { uploadToSupabase, deleteFromSupabase, getSignedUrl } = require('../config/supabase');
const ApiError = require('../utils/ApiError');

class FileService {
  constructor() {
    this.allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
    this.allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    this.allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/flac', 'audio/aac'];
    this.allowedDocumentTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/rtf', 'text/csv'];
  }

  // Validate file
  validateFile(file, options = {}) {
    const { maxSize, allowedTypes } = options;
    
    // Check file size
    if (maxSize && file.size > maxSize) {
      throw new ApiError(400, `File size exceeds limit of ${this.formatBytes(maxSize)}`);
    }
    
    // Check file type
    if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
      throw new ApiError(400, `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
    }
    
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = this.getAllowedExtensions(allowedTypes);
    
    if (allowedExtensions && !allowedExtensions.includes(ext)) {
      throw new ApiError(400, `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}`);
    }
    
    return true;
  }

  // Get allowed extensions from MIME types
  getAllowedExtensions(mimeTypes) {
    if (!mimeTypes) return null;
    
    const extensionMap = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogg',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/x-matroska': '.mkv',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/m4a': '.m4a',
      'audio/flac': '.flac',
      'audio/aac': '.aac',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'text/plain': '.txt',
      'text/rtf': '.rtf',
      'text/csv': '.csv',
    };
    
    return mimeTypes.map(type => extensionMap[type]).filter(Boolean);
  }

  // Format bytes to human readable
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Upload image
  async uploadImage(file, options = {}) {
    this.validateFile(file, {
      maxSize: config.MAX_IMAGE_SIZE || 10 * 1024 * 1024,
      allowedTypes: this.allowedImageTypes,
    });
    
    try {
      // Upload to Cloudinary
      const result = await uploadToCloudinary(file, {
        folder: options.folder || 'images',
        transformation: options.transformation || [
          { quality: 'auto', fetch_format: 'auto' },
        ],
      });
      
      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        size: result.bytes,
        type: 'image',
      };
    } catch (error) {
      logger.error('Image upload failed:', error);
      throw new ApiError(500, 'Failed to upload image');
    }
  }

  // Upload video
  async uploadVideo(file, options = {}) {
    this.validateFile(file, {
      maxSize: config.MAX_VIDEO_SIZE || 500 * 1024 * 1024,
      allowedTypes: this.allowedVideoTypes,
    });
    
    try {
      // Upload to Cloudinary
      const result = await uploadToCloudinary(file, {
        folder: options.folder || 'videos',
        resource_type: 'video',
        transformation: options.transformation || [
          { quality: 'auto' },
        ],
      });
      
      // Generate thumbnail
      const thumbnailUrl = await generateVideoThumbnail(result.secure_url);
      
      return {
        url: result.secure_url,
        thumbnailUrl,
        publicId: result.public_id,
        format: result.format,
        duration: result.duration,
        width: result.width,
        height: result.height,
        size: result.bytes,
        type: 'video',
      };
    } catch (error) {
      logger.error('Video upload failed:', error);
      throw new ApiError(500, 'Failed to upload video');
    }
  }

  // Upload audio
  async uploadAudio(file, options = {}) {
    this.validateFile(file, {
      maxSize: config.MAX_AUDIO_SIZE || 50 * 1024 * 1024,
      allowedTypes: this.allowedAudioTypes,
    });
    
    try {
      // Upload to Cloudinary
      const result = await uploadToCloudinary(file, {
        folder: options.folder || 'audio',
        resource_type: 'video', // Cloudinary treats audio as video
      });
      
      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        duration: result.duration,
        size: result.bytes,
        type: 'audio',
      };
    } catch (error) {
      logger.error('Audio upload failed:', error);
      throw new ApiError(500, 'Failed to upload audio');
    }
  }

  // Upload document
  async uploadDocument(file, options = {}) {
    this.validateFile(file, {
      maxSize: config.MAX_DOCUMENT_SIZE || 100 * 1024 * 1024,
      allowedTypes: this.allowedDocumentTypes,
    });
    
    try {
      // For documents, use Supabase or local storage
      const result = await uploadToSupabase(file, 'documents');
      
      return {
        url: result.url,
        path: result.path,
        format: path.extname(file.originalname).toLowerCase().substring(1),
        size: file.size,
        originalName: file.originalname,
        type: 'document',
      };
    } catch (error) {
      logger.error('Document upload failed:', error);
      throw new ApiError(500, 'Failed to upload document');
    }
  }

  // Upload profile picture
  async uploadProfilePicture(file) {
    this.validateFile(file, {
      maxSize: 5 * 1024 * 1024, // 5MB for profile pictures
      allowedTypes: this.allowedImageTypes,
    });
    
    try {
      // Use Supabase for profile pictures
      const result = await uploadToSupabase(file, 'user-profiles', 'avatars');
      
      // Create thumbnail versions
      const thumbnailUrl = await this.createImageThumbnail(result.url, 150, 150);
      const mediumUrl = await this.createImageThumbnail(result.url, 300, 300);
      
      return {
        original: result.url,
        thumbnail: thumbnailUrl,
        medium: mediumUrl,
        path: result.path,
      };
    } catch (error) {
      logger.error('Profile picture upload failed:', error);
      throw new ApiError(500, 'Failed to upload profile picture');
    }
  }

  // Upload cover photo
  async uploadCoverPhoto(file) {
    this.validateFile(file, {
      maxSize: 10 * 1024 * 1024, // 10MB for cover photos
      allowedTypes: this.allowedImageTypes,
    });
    
    try {
      // Use Supabase for cover photos
      const result = await uploadToSupabase(file, 'user-profiles', 'covers');
      
      // Create optimized version
      const optimizedUrl = await this.createImageThumbnail(result.url, 1500, 500);
      
      return {
        original: result.url,
        optimized: optimizedUrl,
        path: result.path,
      };
    } catch (error) {
      logger.error('Cover photo upload failed:', error);
      throw new ApiError(500, 'Failed to upload cover photo');
    }
  }

  // Create image thumbnail
  async createImageThumbnail(imageUrl, width, height) {
    try {
      const publicId = this.extractPublicId(imageUrl);
      
      if (!publicId) {
        return imageUrl; // Return original if can't create thumbnail
      }
      
      const thumbnailUrl = cloudinary.url(publicId, {
        transformation: [
          { width, height, crop: 'fill' },
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      });
      
      return thumbnailUrl;
    } catch (error) {
      logger.error('Failed to create thumbnail:', error);
      return imageUrl;
    }
  }

  // Extract public ID from Cloudinary URL
  extractPublicId(url) {
    try {
      const matches = url.match(/upload\/(?:v\d+\/)?(.+?)\./);
      return matches ? matches[1] : null;
    } catch (error) {
      return null;
    }
  }

  // Delete file
  async deleteFile(fileUrl) {
    try {
      // Check if it's a Cloudinary URL
      if (fileUrl.includes('cloudinary.com')) {
        const publicId = this.extractPublicId(fileUrl);
        if (publicId) {
          await deleteFromCloudinary(publicId);
          return true;
        }
      }
      
      // Check if it's a Supabase URL
      if (fileUrl.includes('supabase.co')) {
        const path = this.extractSupabasePath(fileUrl);
        if (path) {
          await deleteFromSupabase(path);
          return true;
        }
      }
      
      // Local file
      if (fileUrl.startsWith('/uploads')) {
        const filePath = path.join(process.cwd(), 'public', fileUrl);
        await fs.unlink(filePath).catch(() => {});
        return true;
      }
      
      logger.warn(`Cannot delete file: ${fileUrl}`);
      return false;
    } catch (error) {
      logger.error('File deletion failed:', error);
      return false;
    }
  }

  // Extract path from Supabase URL
  extractSupabasePath(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const matches = pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
      return matches ? matches[2] : null;
    } catch (error) {
      return null;
    }
  }

  // Generate file hash
  async generateFileHash(file) {
    const hash = crypto.createHash('sha256');
    const fileBuffer = await fs.readFile(file.path);
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  // Process multiple files
  async processFiles(files, type = 'image') {
    const uploadPromises = files.map(file => {
      switch (type) {
        case 'image':
          return this.uploadImage(file);
        case 'video':
          return this.uploadVideo(file);
        case 'audio':
          return this.uploadAudio(file);
        case 'document':
          return this.uploadDocument(file);
        default:
          return this.uploadImage(file);
      }
    });
    
    return Promise.all(uploadPromises);
  }

  // Chunked upload
  async handleChunkedUpload(chunk, uploadId, chunkIndex, totalChunks) {
    const chunkDir = path.join('public/uploads/chunks', uploadId);
    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}-of-${totalChunks}`);
    
    // Save chunk
    await fs.writeFile(chunkPath, chunk.buffer);
    
    return {
      chunkIndex,
      totalChunks,
      uploadId,
    };
  }

  // Complete chunked upload
  async completeChunkedUpload(uploadId, filename, options = {}) {
    const chunkDir = path.join('public/uploads/chunks', uploadId);
    const outputPath = path.join('public/uploads', options.folder || 'chunked', filename);
    
    // Create output directory
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // Get all chunks
    const chunkFiles = await fs.readdir(chunkDir);
    chunkFiles.sort((a, b) => {
      const aNum = parseInt(a.match(/\d+/)[0]);
      const bNum = parseInt(b.match(/\d+/)[0]);
      return aNum - bNum;
    });
    
    // Merge chunks
    const writeStream = fs.createWriteStream(outputPath);
    
    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(chunkDir, chunkFile);
      const chunkData = await fs.readFile(chunkPath);
      writeStream.write(chunkData);
    }
    
    writeStream.end();
    
    // Cleanup chunks
    await fs.rm(chunkDir, { recursive: true });
    
    // Upload merged file to storage
    const file = {
      path: outputPath,
      originalname: filename,
      size: (await fs.stat(outputPath)).size,
    };
    
    let result;
    switch (options.type) {
      case 'video':
        result = await this.uploadVideo(file, options);
        break;
      case 'audio':
        result = await this.uploadAudio(file, options);
        break;
      case 'document':
        result = await this.uploadDocument(file, options);
        break;
      default:
        result = await this.uploadImage(file, options);
    }
    
    // Delete local file
    await fs.unlink(outputPath);
    
    return result;
  }

  // Generate presigned URL for direct upload
  async generatePresignedUrl(filename, fileType, options = {}) {
    const uploadId = crypto.randomBytes(16).toString('hex');
    const fileKey = `${uploadId}/${filename}`;
    
    // Generate upload URL (for S3/Cloudinary/Supabase)
    // This is a simplified example
    const uploadUrl = `${config.BASE_URL}/api/v1/upload/chunk`;
    
    return {
      uploadId,
      fileKey,
      uploadUrl,
      chunks: options.chunks || 1,
      chunkSize: options.chunkSize || 5 * 1024 * 1024, // 5MB chunks
      expiresIn: 3600, // 1 hour
    };
  }

  // Get file info
  async getFileInfo(fileUrl) {
    try {
      // For Cloudinary files
      if (fileUrl.includes('cloudinary.com')) {
        const publicId = this.extractPublicId(fileUrl);
        if (publicId) {
          const result = await cloudinary.api.resource(publicId);
          return {
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            size: result.bytes,
            width: result.width,
            height: result.height,
            createdAt: result.created_at,
            type: result.resource_type,
          };
        }
      }
      
      // For local files
      if (fileUrl.startsWith('/uploads')) {
        const filePath = path.join(process.cwd(), 'public', fileUrl);
        const stats = await fs.stat(filePath);
        
        return {
          url: fileUrl,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get file info:', error);
      return null;
    }
  }

  // Compress image
  async compressImage(file, quality = 80) {
    // This would use Sharp or similar library
    // For now, return the original file
    return file;
  }

  // Convert video format
  async convertVideo(file, format = 'mp4') {
    // This would use FFmpeg
    // For now, return the original file
    return file;
  }

  // Extract metadata from file
  async extractMetadata(file) {
    const metadata = {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      extension: path.extname(file.originalname).toLowerCase(),
    };
    
    // Add image-specific metadata
    if (this.allowedImageTypes.includes(file.mimetype)) {
      // Would extract EXIF data, dimensions, etc.
    }
    
    // Add video-specific metadata
    if (this.allowedVideoTypes.includes(file.mimetype)) {
      // Would extract duration, codec, resolution, etc.
    }
    
    return metadata;
  }
}

module.exports = new FileService();