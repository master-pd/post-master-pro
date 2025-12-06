const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');

const startServer = async () => {
  try {
    logger.info('🚀 Starting Post-Master Pro Server on Render...');
    
    // Connect to database
    await connectDB();
    
    // Connect to Redis (with fallback)
    await connectRedis();
    
    // Start server
    const server = app.listen(config.PORT, '0.0.0.0', () => {
      logger.info(`
      ============================================
      ✅ POST-MASTER PRO SERVER RUNNING ON RENDER
      ============================================
      🌐 URL: ${config.BASE_URL}
      🚪 Port: ${config.PORT}
      📊 Environment: ${config.NODE_ENV}
      🗄️ Database: PostgreSQL (Render)
      ⚡ Redis: ${config.REDIS_URL ? 'Connected' : 'Memory Cache'}
      📚 API Docs: ${config.BASE_URL}/api-docs
      ❤️ Health: ${config.BASE_URL}/health
      🛠️ API: ${config.BASE_URL}/api/${config.API_VERSION}
      ============================================
      `);
    });
    
    // Graceful shutdown for Render
    const gracefulShutdown = async () => {
      logger.info('🛑 Received shutdown signal, closing server gracefully...');
      
      server.close(async () => {
        logger.info('✅ HTTP server closed');
        
        // Close database connection
        try {
          const { sequelize } = require('./config/database');
          await sequelize.close();
          logger.info('✅ Database connection closed');
        } catch (error) {
          logger.error('❌ Error closing database:', error.message);
        }
        
        // Close Redis
        try {
          const redis = require('./config/redis');
          await redis.quit();
          logger.info('✅ Redis connection closed');
        } catch (error) {
          logger.error('❌ Error closing Redis:', error.message);
        }
        
        logger.info('👋 Server shutdown complete');
        process.exit(0);
      });
      
      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('⏰ Force shutdown after 10 seconds');
        process.exit(1);
      }, 10000);
    };
    
    // Handle shutdown signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      gracefulShutdown();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    // Render-specific: Handle health checks
    process.on('SIGUSR2', () => {
      logger.info('❤️ Received health check signal');
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;