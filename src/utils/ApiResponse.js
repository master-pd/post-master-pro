class ApiResponse {
  constructor(res, statusCode, message, data = null, meta = null) {
    this.res = res;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.meta = meta;
    
    this.send();
  }
  
  send() {
    const response = {
      success: true,
      message: this.message,
      ...(this.data && { data: this.data }),
      ...(this.meta && { meta: this.meta }),
      timestamp: new Date().toISOString(),
    };
    
    this.res.status(this.statusCode).json(response);
  }
  
  // Common response helpers
  static success(res, message, data, meta) {
    return new ApiResponse(res, 200, message, data, meta);
  }
  
  static created(res, message, data, meta) {
    return new ApiResponse(res, 201, message, data, meta);
  }
  
  static noContent(res, message = 'No content') {
    return new ApiResponse(res, 204, message);
  }
  
  static paginated(res, message, data, pagination) {
    return new ApiResponse(res, 200, message, data, { pagination });
  }
  
  // Error response (compatible with ApiError)
  static error(res, error) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    
    const response = {
      success: false,
      error: {
        code: statusCode,
        message: message,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      },
    };
    
    res.status(statusCode).json(response);
  }
}

module.exports = ApiResponse;