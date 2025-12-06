const Joi = require('joi');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Custom Joi validators
 */
const customValidators = {
  // Password validator
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .message(
      'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'
    ),

  // Phone number validator
  phone: Joi.string()
    .pattern(/^[+]?[\d\s\-()]+$/)
    .message('Invalid phone number format'),

  // URL validator
  url: Joi.string().uri(),

  // Date validator (ISO 8601)
  date: Joi.date().iso(),

  // Array of strings validator
  stringArray: Joi.array().items(Joi.string()),

  // JSON validator
  json: Joi.alternatives().try(
    Joi.object(),
    Joi.array(),
    Joi.string().allow('')
  ),

  // UUID validator
  uuid: Joi.string().guid({ version: 'uuidv4' }),

  // File size validator (in bytes)
  fileSize: (maxSize) => 
    Joi.number().integer().min(1).max(maxSize),

  // File type validator
  fileType: (allowedTypes) =>
    Joi.string().valid(...allowedTypes),
};

/**
 * Common validation schemas
 */
const commonSchemas = {
  // Pagination schema
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC'),
  }),

  // Search schema
  search: Joi.object({
    q: Joi.string().min(1).max(100).required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
  }),

  // File upload schema
  fileUpload: Joi.object({
    fieldname: Joi.string().required(),
    originalname: Joi.string().required(),
    encoding: Joi.string(),
    mimetype: Joi.string().required(),
    size: Joi.number().integer().required(),
    destination: Joi.string(),
    filename: Joi.string(),
    path: Joi.string(),
    buffer: Joi.binary(),
  }),

  // Location schema
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    address: Joi.string(),
  }),

  // Media schema
  media: Joi.object({
    url: Joi.string().uri().required(),
    type: Joi.string().valid('image', 'video', 'audio', 'document').required(),
    thumbnail: Joi.string().uri(),
    duration: Joi.number().integer().min(0),
    width: Joi.number().integer().min(1),
    height: Joi.number().integer().min(1),
    size: Joi.number().integer().min(1),
  }),

  // Metadata schema
  metadata: Joi.object().pattern(
    Joi.string(),
    Joi.alternatives().try(
      Joi.string(),
      Joi.number(),
      Joi.boolean(),
      Joi.array(),
      Joi.object()
    )
  ),
};

/**
 * Validate request body
 */
const validateBody = (schema) => {
  return asyncHandler(async (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      throw new ApiError(400, 'Validation failed', errors);
    }

    // Replace validated body
    req.body = value;
    next();
  });
};

/**
 * Validate request query
 */
const validateQuery = (schema) => {
  return asyncHandler(async (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      throw new ApiError(400, 'Query validation failed', errors);
    }

    req.query = value;
    next();
  });
};

/**
 * Validate request params
 */
const validateParams = (schema) => {
  return asyncHandler(async (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      throw new ApiError(400, 'Parameter validation failed', errors);
    }

    req.params = value;
    next();
  });
};

/**
 * Validate request headers
 */
const validateHeaders = (schema) => {
  return asyncHandler(async (req, res, next) => {
    const { error, value } = schema.validate(req.headers, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type,
      }));

      throw new ApiError(400, 'Header validation failed', errors);
    }

    req.headers = value;
    next();
  });
};

/**
 * Validate file upload
 */
const validateFile = (options = {}) => {
  const {
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize = 10 * 1024 * 1024, // 10MB default
    required = true,
    fieldName = 'file',
    maxFiles = 1,
  } = options;

  return asyncHandler(async (req, res, next) => {
    if (!req.files && !req.file) {
      if (required) {
        throw new ApiError(400, `No file uploaded. Please upload a ${fieldName}`);
      }
      return next();
    }

    const files = req.files ? req.files[fieldName] || [] : [req.file];
    
    if (!Array.isArray(files)) {
      files = [files];
    }

    // Check number of files
    if (files.length > maxFiles) {
      throw new ApiError(400, `Maximum ${maxFiles} files allowed`);
    }

    // Validate each file
    const errors = [];
    const validFiles = [];

    for (const file of files) {
      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        errors.push({
          field: file.fieldname,
          message: `Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`,
          filename: file.originalname,
        });
        continue;
      }

      // Check file size
      if (file.size > maxSize) {
        errors.push({
          field: file.fieldname,
          message: `File too large: ${file.size} bytes. Maximum size: ${maxSize} bytes`,
          filename: file.originalname,
        });
        continue;
      }

      validFiles.push(file);
    }

    if (errors.length > 0) {
      throw new ApiError(400, 'File validation failed', errors);
    }

    // Store validated files
    if (req.files) {
      req.files[fieldName] = validFiles.length === 1 ? validFiles[0] : validFiles;
    } else {
      req.file = validFiles[0];
    }

    next();
  });
};

/**
 * Sanitize input data
 */
const sanitizeInput = (data, options = {}) => {
  const {
    stripTags = true,
    trim = true,
    caseNormalize = true,
    removeNull = false,
    removeEmptyStrings = false,
  } = options;

  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      let sanitized = value;

      // Trim whitespace
      if (trim) {
        sanitized = sanitized.trim();
      }

      // Strip HTML tags
      if (stripTags) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
      }

      // Normalize case
      if (caseNormalize) {
        sanitized = sanitized.toLowerCase();
      }

      return sanitized;
    }

    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }

    if (value && typeof value === 'object') {
      return sanitizeInput(value, options);
    }

    return value;
  };

  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    // Remove null values
    if (removeNull && value === null) {
      continue;
    }

    // Remove empty strings
    if (removeEmptyStrings && value === '') {
      continue;
    }

    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 */
const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  const errors = [];

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!hasLowerCase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  if (!hasSpecialChars) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate URL
 */
const validateUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate date range
 */
const validateDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { isValid: false, error: 'Invalid date format' };
  }

  if (start > end) {
    return { isValid: false, error: 'Start date must be before end date' };
  }

  return { isValid: true };
};

/**
 * Validate array contains unique values
 */
const validateUniqueArray = (array) => {
  const unique = [...new Set(array)];
  return {
    isValid: unique.length === array.length,
    duplicates: array.filter((item, index) => array.indexOf(item) !== index),
  };
};

/**
 * Middleware to sanitize request body
 */
const sanitizeBody = (options = {}) => {
  return (req, res, next) => {
    if (req.body) {
      req.body = sanitizeInput(req.body, options);
    }
    next();
  };
};

/**
 * Middleware to sanitize request query
 */
const sanitizeQuery = (options = {}) => {
  return (req, res, next) => {
    if (req.query) {
      req.query = sanitizeInput(req.query, options);
    }
    next();
  };
};

/**
 * Middleware to sanitize request params
 */
const sanitizeParams = (options = {}) => {
  return (req, res, next) => {
    if (req.params) {
      req.params = sanitizeInput(req.params, options);
    }
    next();
  };
};

module.exports = {
  customValidators,
  commonSchemas,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  validateFile,
  sanitizeInput,
  validateEmail,
  validatePassword,
  validateUrl,
  validateDateRange,
  validateUniqueArray,
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
};