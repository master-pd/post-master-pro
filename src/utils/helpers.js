const crypto = require('crypto');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * Generate a random string
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a unique ID
 */
const generateUniqueId = () => {
  return uuidv4();
};

/**
 * Generate a short ID (for URLs)
 */
const generateShortId = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Hash a string (for passwords, tokens, etc.)
 */
const hashString = (string, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(string).digest('hex');
};

/**
 * Generate a secure token
 */
const generateSecureToken = (length = 64) => {
  return crypto.randomBytes(length).toString('base64url');
};

/**
 * Encrypt data
 */
const encryptData = (data, key = config.ENCRYPTION_KEY) => {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key.substring(0, 32), iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: authTag.toString('hex')
  };
};

/**
 * Decrypt data
 */
const decryptData = (encryptedObject, key = config.ENCRYPTION_KEY) => {
  const algorithm = 'aes-256-gcm';
  const decipher = crypto.createDecipheriv(
    algorithm,
    key.substring(0, 32),
    Buffer.from(encryptedObject.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedObject.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedObject.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
};

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
const formatRelativeTime = (date) => {
  const now = moment();
  const target = moment(date);
  const diff = now.diff(target, 'seconds');
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
  return `${Math.floor(diff / 31536000)} years ago`;
};

/**
 * Format date to human readable string
 */
const formatDate = (date, format = 'MMM DD, YYYY h:mm A') => {
  return moment(date).format(format);
};

/**
 * Format number with commas (e.g., 1000 -> 1,000)
 */
const formatNumber = (num) => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * Format file size (e.g., 1048576 -> 1MB)
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Truncate text with ellipsis
 */
const truncateText = (text, maxLength = 100) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Extract hashtags from text
 */
const extractHashtags = (text) => {
  const hashtagRegex = /#(\w+)/g;
  const matches = text.match(hashtagRegex);
  return matches ? matches.map(tag => tag.slice(1).toLowerCase()) : [];
};

/**
 * Extract mentions from text
 */
const extractMentions = (text) => {
  const mentionRegex = /@(\w+)/g;
  const matches = text.match(mentionRegex);
  return matches ? matches.map(mention => mention.slice(1)) : [];
};

/**
 * Generate slug from string
 */
const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
};

/**
 * Validate email address
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate URL
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate phone number
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[+]?[\d\s\-()]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

/**
 * Deep clone an object
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Merge objects deeply
 */
const deepMerge = (target, source) => {
  const output = Object.assign({}, target);
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
};

/**
 * Check if value is an object
 */
const isObject = (item) => {
  return item && typeof item === 'object' && !Array.isArray(item);
};

/**
 * Remove null/undefined values from object
 */
const removeEmptyValues = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v != null && v !== '')
  );
};

/**
 * Flatten nested object
 */
const flattenObject = (obj, prefix = '') => {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix.length ? prefix + '.' : '';
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(acc, flattenObject(obj[key], pre + key));
    } else {
      acc[pre + key] = obj[key];
    }
    
    return acc;
  }, {});
};

/**
 * Delay execution (sleep)
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry a function with exponential backoff
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
};

/**
 * Generate pagination metadata
 */
const generatePagination = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };
};

/**
 * Calculate distance between two coordinates (in km)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Generate avatar from initials
 */
const generateAvatar = (name, size = 100) => {
  const canvas = require('canvas').createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background color
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  
  // Text
  const initials = name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${size / 2}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2);
  
  return canvas.toDataURL();
};

/**
 * Generate QR code data URL
 */
const generateQRCode = async (text) => {
  const QRCode = require('qrcode');
  return await QRCode.toDataURL(text);
};

/**
 * Sanitize filename
 */
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-z0-9.\-]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

/**
 * Get file extension
 */
const getFileExtension = (filename) => {
  return filename.split('.').pop().toLowerCase();
};

/**
 * Check if file is an image
 */
const isImageFile = (filename) => {
  const ext = getFileExtension(filename);
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
};

/**
 * Check if file is a video
 */
const isVideoFile = (filename) => {
  const ext = getFileExtension(filename);
  return ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(ext);
};

/**
 * Check if file is a document
 */
const isDocumentFile = (filename) => {
  const ext = getFileExtension(filename);
  return ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext);
};

/**
 * Generate random color
 */
const generateRandomColor = () => {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
};

/**
 * Convert array to chunks
 */
const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Shuffle array
 */
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Remove duplicates from array
 */
const removeDuplicates = (array) => {
  return [...new Set(array)];
};

/**
 * Get unique objects by key
 */
const getUniqueObjects = (array, key) => {
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

/**
 * Group array by key
 */
const groupBy = (array, key) => {
  return array.reduce((groups, item) => {
    const groupKey = item[key];
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {});
};

/**
 * Sort array by key
 */
const sortBy = (array, key, order = 'asc') => {
  return [...array].sort((a, b) => {
    let aValue = a[key];
    let bValue = b[key];
    
    if (typeof aValue === 'string') aValue = aValue.toLowerCase();
    if (typeof bValue === 'string') bValue = bValue.toLowerCase();
    
    if (aValue < bValue) return order === 'asc' ? -1 : 1;
    if (aValue > bValue) return order === 'asc' ? 1 : -1;
    return 0;
  });
};

/**
 * Debounce function
 */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 */
const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

module.exports = {
  generateRandomString,
  generateUniqueId,
  generateShortId,
  hashString,
  generateSecureToken,
  encryptData,
  decryptData,
  formatRelativeTime,
  formatDate,
  formatNumber,
  formatFileSize,
  truncateText,
  extractHashtags,
  extractMentions,
  generateSlug,
  isValidEmail,
  isValidUrl,
  isValidPhone,
  deepClone,
  deepMerge,
  isObject,
  removeEmptyValues,
  flattenObject,
  sleep,
  retryWithBackoff,
  generatePagination,
  calculateDistance,
  generateAvatar,
  generateQRCode,
  sanitizeFilename,
  getFileExtension,
  isImageFile,
  isVideoFile,
  isDocumentFile,
  generateRandomColor,
  chunkArray,
  shuffleArray,
  removeDuplicates,
  getUniqueObjects,
  groupBy,
  sortBy,
  debounce,
  throttle,
};