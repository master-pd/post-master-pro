const xss = require('xss');
const validator = require('validator');
const ApiError = require('../utils/ApiError');

/**
 * XSS sanitization options
 */
const xssOptions = {
  whiteList: {}, // empty, means filter out all tags
  stripIgnoreTag: true, // filter out all HTML not in the whitelist
  stripIgnoreTagBody: ['script', 'style'], // the script and style tag and its content
  allowCommentTag: false,
};

/**
 * Custom XSS sanitizer
 */
const xssSanitizer = new xss.FilterXSS(xssOptions);

/**
 * Sanitize string input
 */
const sanitizeString = (input, options = {}) => {
  const {
    trim = true,
    escape = true,
    stripTags = true,
    normalize = true,
    maxLength,
    minLength,
    allowEmpty = false,
  } = options;

  if (input === null || input === undefined) {
    return input;
  }

  let sanitized = String(input);

  // Trim whitespace
  if (trim) {
    sanitized = sanitized.trim();
  }

  // Check if empty after trimming
  if (!allowEmpty && sanitized === '') {
    throw new ApiError(400, 'Input cannot be empty');
  }

  // Strip HTML tags
  if (stripTags) {
    sanitized = xssSanitizer.process(sanitized);
  }

  // Escape special characters
  if (escape) {
    sanitized = validator.escape(sanitized);
  }

  // Normalize Unicode
  if (normalize) {
    sanitized = validator.normalizeEmail(sanitized, { gmail_remove_dots: false });
  }

  // Validate length
  if (minLength && sanitized.length < minLength) {
    throw new ApiError(400, `Input must be at least ${minLength} characters long`);
  }

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
};

/**
 * Sanitize email
 */
const sanitizeEmail = (email) => {
  if (!email) {
    throw new ApiError(400, 'Email is required');
  }

  const sanitized = validator.normalizeEmail(email.trim(), {
    gmail_remove_dots: false,
    gmail_remove_subaddress: false,
    outlookdotcom_remove_subaddress: false,
    yahoo_remove_subaddress: false,
    icloud_remove_subaddress: false,
  });

  if (!validator.isEmail(sanitized)) {
    throw new ApiError(400, 'Invalid email format');
  }

  return sanitized;
};

/**
 * Sanitize URL
 */
const sanitizeUrl = (url, options = {}) => {
  const { requireProtocol = true, allowedProtocols = ['http:', 'https:'] } = options;

  if (!url) {
    return url;
  }

  let sanitized = url.trim();

  // Add protocol if missing
  if (requireProtocol && !sanitized.startsWith('http')) {
    sanitized = 'https://' + sanitized;
  }

  // Validate URL
  if (!validator.isURL(sanitized, { require_protocol: requireProtocol })) {
    throw new ApiError(400, 'Invalid URL format');
  }

  // Validate protocol
  if (allowedProtocols.length > 0) {
    const urlObj = new URL(sanitized);
    if (!allowedProtocols.includes(urlObj.protocol)) {
      throw new ApiError(400, `URL protocol must be one of: ${allowedProtocols.join(', ')}`);
    }
  }

  return sanitized;
};

/**
 * Sanitize phone number
 */
const sanitizePhone = (phone) => {
  if (!phone) {
    return phone;
  }

  // Remove all non-digit characters except plus sign
  let sanitized = phone.replace(/[^\d+]/g, '');

  // Validate length
  if (sanitized.length < 10 || sanitized.length > 15) {
    throw new ApiError(400, 'Invalid phone number length');
  }

  return sanitized;
};

/**
 * Sanitize integer
 */
const sanitizeInteger = (input, options = {}) => {
  const { min, max, defaultValue } = options;

  if (input === null || input === undefined || input === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ApiError(400, 'Integer value is required');
  }

  const num = parseInt(input, 10);

  if (isNaN(num)) {
    throw new ApiError(400, 'Invalid integer value');
  }

  if (min !== undefined && num < min) {
    throw new ApiError(400, `Value must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new ApiError(400, `Value must be at most ${max}`);
  }

  return num;
};

/**
 * Sanitize float
 */
const sanitizeFloat = (input, options = {}) => {
  const { min, max, decimalPlaces = 2, defaultValue } = options;

  if (input === null || input === undefined || input === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ApiError(400, 'Float value is required');
  }

  const num = parseFloat(input);

  if (isNaN(num)) {
    throw new ApiError(400, 'Invalid float value');
  }

  if (min !== undefined && num < min) {
    throw new ApiError(400, `Value must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new ApiError(400, `Value must be at most ${max}`);
  }

  // Round to specified decimal places
  return parseFloat(num.toFixed(decimalPlaces));
};

/**
 * Sanitize boolean
 */
const sanitizeBoolean = (input) => {
  if (input === null || input === undefined) {
    return false;
  }

  if (typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'string') {
    const lower = input.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
  }

  if (typeof input === 'number') {
    return input === 1;
  }

  return Boolean(input);
};

/**
 * Sanitize date
 */
const sanitizeDate = (input, options = {}) => {
  const { format = 'iso', minDate, maxDate, defaultValue } = options;

  if (!input) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ApiError(400, 'Date is required');
  }

  const date = new Date(input);

  if (isNaN(date.getTime())) {
    throw new ApiError(400, 'Invalid date format');
  }

  // Validate min date
  if (minDate) {
    const min = new Date(minDate);
    if (date < min) {
      throw new ApiError(400, `Date must be after ${minDate}`);
    }
  }

  // Validate max date
  if (maxDate) {
    const max = new Date(maxDate);
    if (date > max) {
      throw new ApiError(400, `Date must be before ${maxDate}`);
    }
  }

  // Format date
  switch (format) {
    case 'iso':
      return date.toISOString();
    case 'date':
      return date.toISOString().split('T')[0];
    case 'timestamp':
      return date.getTime();
    default:
      return date;
  }
};

/**
 * Sanitize JSON
 */
const sanitizeJson = (input, options = {}) => {
  const { schema, defaultValue = {} } = options;

  if (!input) {
    return defaultValue;
  }

  let parsed;
  
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      throw new ApiError(400, 'Invalid JSON format');
    }
  } else {
    parsed = input;
  }

  // Apply schema validation if provided
  if (schema) {
    const { error, value } = schema.validate(parsed, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      throw new ApiError(400, 'JSON validation failed', errors);
    }

    return value;
  }

  return parsed;
};

/**
 * Sanitize array
 */
const sanitizeArray = (input, options = {}) => {
  const {
    itemSanitizer,
    minLength,
    maxLength,
    unique = false,
    defaultValue = [],
  } = options;

  if (!input) {
    return defaultValue;
  }

  let array = Array.isArray(input) ? input : [input];

  // Filter out null/undefined values
  array = array.filter(item => item !== null && item !== undefined);

  // Apply item sanitizer if provided
  if (itemSanitizer) {
    array = array.map(itemSanitizer);
  }

  // Validate length
  if (minLength && array.length < minLength) {
    throw new ApiError(400, `Array must contain at least ${minLength} items`);
  }

  if (maxLength && array.length > maxLength) {
    array = array.slice(0, maxLength);
  }

  // Ensure uniqueness
  if (unique) {
    array = [...new Set(array)];
  }

  return array;
};

/**
 * Sanitize object
 */
const sanitizeObject = (input, options = {}) => {
  const {
    schema,
    stripUnknown = true,
    defaultValue = {},
    allowedFields,
    requiredFields,
  } = options;

  if (!input || typeof input !== 'object') {
    return defaultValue;
  }

  let sanitized = { ...input };

  // Filter allowed fields
  if (Array.isArray(allowedFields)) {
    sanitized = Object.keys(sanitized)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = sanitized[key];
        return obj;
      }, {});
  }

  // Check required fields
  if (Array.isArray(requiredFields)) {
    const missingFields = requiredFields.filter(field => !(field in sanitized));
    if (missingFields.length > 0) {
      throw new ApiError(400, `Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  // Apply schema validation
  if (schema) {
    const { error, value } = schema.validate(sanitized, {
      abortEarly: false,
      stripUnknown,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      throw new ApiError(400, 'Object validation failed', errors);
    }

    return value;
  }

  return sanitized;
};

/**
 * Sanitize file upload
 */
const sanitizeFile = (file, options = {}) => {
  const {
    allowedTypes = [],
    maxSize,
    required = true,
  } = options;

  if (!file && required) {
    throw new ApiError(400, 'File is required');
  }

  if (!file) {
    return null;
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
    throw new ApiError(400, `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }

  // Check file size
  if (maxSize && file.size > maxSize) {
    throw new ApiError(400, `File size exceeds maximum allowed size of ${maxSize} bytes`);
  }

  // Sanitize filename
  const sanitizedFile = { ...file };
  sanitizedFile.originalname = sanitizeString(file.originalname, {
    stripTags: true,
    escape: false,
  });

  return sanitizedFile;
};

/**
 * Middleware to sanitize request body
 */
const sanitizeRequestBody = (options = {}) => {
  return (req, res, next) => {
    try {
      if (req.body) {
        req.body = sanitizeObject(req.body, options);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to sanitize request query
 */
const sanitizeRequestQuery = (options = {}) => {
  return (req, res, next) => {
    try {
      if (req.query) {
        req.query = sanitizeObject(req.query, options);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to sanitize request params
 */
const sanitizeRequestParams = (options = {}) => {
  return (req, res, next) => {
    try {
      if (req.params) {
        req.params = sanitizeObject(req.params, options);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Sanitize all request data
 */
const sanitizeAllRequestData = () => {
  return [
    sanitizeRequestBody({ stripUnknown: true }),
    sanitizeRequestQuery({ stripUnknown: true }),
    sanitizeRequestParams({ stripUnknown: true }),
  ];
};

module.exports = {
  sanitizeString,
  sanitizeEmail,
  sanitizeUrl,
  sanitizePhone,
  sanitizeInteger,
  sanitizeFloat,
  sanitizeBoolean,
  sanitizeDate,
  sanitizeJson,
  sanitizeArray,
  sanitizeObject,
  sanitizeFile,
  sanitizeRequestBody,
  sanitizeRequestQuery,
  sanitizeRequestParams,
  sanitizeAllRequestData,
  xssSanitizer,
};