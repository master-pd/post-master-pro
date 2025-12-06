const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

async function migrate() {
  try {
    logger.info('🔄 Starting database migration for Render...');
    
    // Test connection
    await sequelize.authenticate();
    logger.info('✅ Database connected');
    
    // Sync all models without dropping data
    await sequelize.sync({ alter: false });
    
    logger.info('✅ Database migration completed successfully');
    
    // List all tables
    const [tables] = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    
    logger.info(`📊 Database has ${tables.length} tables:`, 
      tables.map(t => t.table_name).join(', '));
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Handle command line arguments
if (require.main === module) {
  migrate();
}

module.exports = { migrate };