const cloudinary = require('cloudinary').v2;
const config = require('./index');
const logger = require('../utils/logger');

const initCloudinary = () => {
  try {
    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
      secure: config.CLOUDINARY_SECURE !== false,
    });

    logger.info('Cloudinary configured successfully.');
    return cloudinary;
  } catch (error) {
    logger.error('Failed to configure Cloudinary:', error);
    throw error;
  }
};

// Helper functions
const uploadToCloudinary = async (file, options = {}) => {
  const uploadOptions = {
    folder: 'post_master',
    resource_type: 'auto',
    timeout: 60000, // 60 seconds
    ...options,
  };

  try {
    const result = await cloudinary.uploader.upload(file.path, uploadOptions);
    return result;
  } catch (error) {
    logger.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
};

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    logger.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete from Cloudinary: ${error.message}`);
  }
};

const generateVideoThumbnail = async (videoUrl, options = {}) => {
  try {
    const publicId = videoUrl.split('/').pop().split('.')[0];
    const thumbnailUrl = cloudinary.url(publicId, {
      resource_type: 'video',
      format: 'jpg',
      transformation: [
        { width: 800, height: 450, crop: 'fill' },
        { quality: 'auto' },
      ],
      ...options,
    });
    
    return thumbnailUrl;
  } catch (error) {
    logger.error('Failed to generate video thumbnail:', error);
    return null;
  }
};

module.exports = {
  cloudinary: initCloudinary(),
  uploadToCloudinary,
  deleteFromCloudinary,
  generateVideoThumbnail,
};