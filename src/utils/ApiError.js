class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.success = false;
    this.timestamp = new Date().toISOString();
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  // Common error types
  static badRequest(message = 'Bad Request') {
    return new ApiError(400, message);
  }
  
  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }
  
  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }
  
  static notFound(message = 'Not Found') {
    return new ApiError(404, message);
  }
  
  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }
  
  static validationError(message = 'Validation Error') {
    return new ApiError(422, message);
  }
  
  static tooManyRequests(message = 'Too Many Requests') {
    return new ApiError(429, message);
  }
  
  static internal(message = 'Internal Server Error') {
    return new ApiError(500, message, false);
  }
  
  static serviceUnavailable(message = 'Service Unavailable') {
    return new ApiError(503, message);
  }
  
  // Database errors
  static databaseError(error) {
    const message = `Database error: ${error.message}`;
    return new ApiError(500, message, false);
  }
  
  // Validation errors from Joi/validator
  static validationErrors(errors) {
    return new ApiError(422, 'Validation failed', true, undefined, errors);
  }
  
  // File upload errors
  static fileUploadError(message = 'File upload failed') {
    return new ApiError(400, message);
  }
  
  // Authentication errors
  static invalidCredentials(message = 'Invalid email or password') {
    return new ApiError(401, message);
  }
  
  static tokenExpired(message = 'Token has expired') {
    return new ApiError(401, message);
  }
  
  static invalidToken(message = 'Invalid token') {
    return new ApiError(401, message);
  }
  
  // Permission errors
  static insufficientPermissions(message = 'Insufficient permissions') {
    return new ApiError(403, message);
  }
  
  // Resource errors
  static resourceNotFound(resource, id) {
    const message = `${resource} with ID ${id} not found`;
    return new ApiError(404, message);
  }
  
  static resourceAlreadyExists(resource, field, value) {
    const message = `${resource} with ${field} '${value}' already exists`;
    return new ApiError(409, message);
  }
  
  // Business logic errors
  static businessRuleViolation(message = 'Business rule violation') {
    return new ApiError(400, message);
  }
  
  // Format error response for API
  toJSON() {
    return {
      success: this.success,
      error: {
        code: this.statusCode,
        message: this.message,
        timestamp: this.timestamp,
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
      },
    };
  }
}

module.exports = ApiError;