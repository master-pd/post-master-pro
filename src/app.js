const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const redis = require('./config/redis');
const statusMonitor = require('express-status-monitor');

const { errorConverter, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const config = require('./config');
const logger = require('./utils/logger');
const swaggerDocs = require('./docs/swagger');
// Add after other middleware imports
const { renderOptimizer, keepAlive, memoryMonitor } = require('./middleware/render');


const app = express();

// Trust proxy for Render
app.set('trust proxy', 1);

// Status monitoring (only in development or if enabled)
if (config.NODE_ENV === 'development' && config.ENABLE_SWAGGER) {
  app.use(statusMonitor());
}

// Security middleware for Render
app.use(helmet({
  contentSecurityPolicy: config.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration for Render
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      config.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'https://post-master-pro.onrender.com',
      config.BASE_URL,
    ].filter(Boolean);
    
    if (allowedOrigins.indexOf(origin) !== -1 || config.CORS_ORIGINS === '*') {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting (adjusted for Render Free Tier)
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.url === '/health';
  },
});
app.use('/api', limiter);

// Body parsers
app.use(express.json({ limit: config.MAX_FILE_SIZE }));
app.use(express.urlencoded({ extended: true, limit: config.MAX_FILE_SIZE }));

// Cookie parser
app.use(cookieParser(config.SESSION_SECRET));

// Session with Redis (or memory store as fallback)
const sessionConfig = {
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: config.SESSION_TTL,
    sameSite: config.NODE_ENV === 'production' ? 'none' : 'lax',
  },
  store: undefined, // Will be set below
};

// Try to use Redis store, fallback to memory
try {
  const RedisStore = require('connect-redis').default;
  sessionConfig.store = new RedisStore({ 
    client: redis,
    prefix: 'session:',
  });
  logger.info('✅ Using Redis session store');
} catch (error) {
  logger.warn('⚠️ Using memory session store (Redis not available)');
  // Memory store will be used by default
}

app.use(session(sessionConfig));

// Data sanitization
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Compression
app.use(compression({
  level: config.COMPRESSION_LEVEL,
  threshold: 1024, // Compress responses larger than 1KB
}));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Skip logging for health checks
  if (req.path === '/health') {
    return next();
  }
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });
  
  next();
});

// Static files
app.use('/uploads', express.static('public/uploads', {
  maxAge: '1d', // Cache for 1 day
}));

// Health check endpoint (required by Render)
app.get('/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: config.NODE_ENV,
    version: process.version,
    render: config.isRender,
    database: 'connected',
  };
  
  res.set('Cache-Control', 'no-store');
  res.status(200).json(health);
});

// API Documentation (Swagger)
if (config.ENABLE_SWAGGER) {
  swaggerDocs(app);
  logger.info('✅ Swagger docs enabled at /api-docs');
}

// API routes
app.use(`/api/${config.API_VERSION}`, routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      path: req.url,
      method: req.method,
    },
  });
});

// Error handling middleware
app.use(errorConverter);
app.use(errorHandler);
// Add before routes
app.use(renderOptimizer);
app.use(keepAlive);
app.use(memoryMonitor);
module.exports = app;