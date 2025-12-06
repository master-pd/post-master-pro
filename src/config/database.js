const { Sequelize } = require('sequelize');
const config = require('./index');
const logger = require('../utils/logger');

// Render-compatible database configuration
const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  logging: config.NODE_ENV === 'development' ? msg => logger.debug(msg) : false,
  
  // Optimized for Render Free Tier
  pool: {
    max: config.DB_POOL_MAX || 5,
    min: config.DB_POOL_MIN || 1,
    acquire: config.DB_POOL_ACQUIRE || 30000,
    idle: config.DB_POOL_IDLE || 10000,
  },
  
  // SSL for production (Render requires SSL)
  dialectOptions: config.isProduction ? {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  } : {},
  
  // Sequelize settings
  define: {
    underscored: true,
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  },
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅ Database connected to Render PostgreSQL');
    
    // In production, only sync if tables don't exist
    if (config.NODE_ENV === 'production') {
      try {
        // Check if users table exists
        const tableExists = await sequelize.query(
          "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
        );
        
        if (!tableExists[0][0].exists) {
          logger.info('🔄 Creating database tables...');
          await sequelize.sync();
          logger.info('✅ Database tables created');
        } else {
          logger.info('✅ Database tables already exist');
        }
      } catch (syncError) {
        logger.warn('⚠️ Database sync warning:', syncError.message);
        // Continue even if sync fails
      }
    } else {
      // Development: sync with alter
      await sequelize.sync({ alter: true });
      logger.info('🔄 Development database synced');
    }
    
    return sequelize;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    
    // For Render, retry after delay
    if (config.isProduction) {
      logger.info('⏳ Retrying database connection in 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      return connectDB();
    }
    
    process.exit(1);
  }
};

module.exports = {
  sequelize,
  connectDB,
};