require('dotenv').config();

const config = {
  // Application
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  API_VERSION: process.env.API_VERSION || 'v1',
  
  // Database (Render provides this automatically)
  DATABASE_URL: process.env.DATABASE_URL || 
                process.env.POSTGRESQL_URL || 
                process.env.DATABASE_URL || 
                'postgresql://localhost:5432/post_master_pro',
  
  // Redis (Optional - can use memory cache if not available)
  REDIS_URL: process.env.REDIS_URL || 
             process.env.REDIS_TLS_URL || 
             'redis://localhost:6379',
  
  // JWT - MUST SET IN RENDER DASHBOARD
  JWT_SECRET: process.env.JWT_SECRET || 'default_jwt_secret_change_in_production',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret_change_in_production',
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '7d',
  
  // Email
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@postmaster.com',
  
  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  
  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  RATE_LIMIT_SKIP_SUCCESSFUL: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
  
  // Session
  SESSION_SECRET: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'session_secret',
  SESSION_TTL: parseInt(process.env.SESSION_TTL) || 24 * 60 * 60 * 1000,
  
  // File Upload
  MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || '10mb',
  
  // Database Pool (Optimized for Render Free Tier)
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX) || 5,
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN) || 1,
  DB_POOL_ACQUIRE: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
  DB_POOL_IDLE: parseInt(process.env.DB_POOL_IDLE) || 10000,
  
  // Compression
  COMPRESSION_LEVEL: parseInt(process.env.COMPRESSION_LEVEL) || 6,
  
  // Features (Optimized for Render Free Tier)
  ENABLE_QUEUE: process.env.ENABLE_QUEUE === 'true',
  ENABLE_SOCKETS: process.env.ENABLE_SOCKETS === 'true',
  ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === 'true',
  ENABLE_GRAPHIQL: process.env.ENABLE_GRAPHIQL === 'false',
  CLUSTER_ENABLED: process.env.CLUSTER_ENABLED === 'true',
  
  // Render-specific
  isRender: !!process.env.RENDER,
  isProduction: process.env.NODE_ENV === 'production',
};

// Log config (without secrets)
console.log('Config loaded:', {
  NODE_ENV: config.NODE_ENV,
  PORT: config.PORT,
  BASE_URL: config.BASE_URL,
  isRender: config.isRender,
  isProduction: config.isProduction,
});

module.exports = config;