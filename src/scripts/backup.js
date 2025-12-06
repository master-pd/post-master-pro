const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const archiver = require('archiver');
const config = require('./config');
const logger = require('../utils/logger');
const { Sequelize } = require('sequelize');

const execAsync = promisify(exec);
const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const unlinkAsync = promisify(fs.unlink);

/**
 * Database backup utility
 */
class DatabaseBackup {
  constructor(options = {}) {
    this.options = {
      backupDir: path.join(__dirname, '../../backups'),
      retentionDays: 30,
      compress: true,
      encrypt: false,
      encryptionKey: null,
      includeMedia: false,
      includeLogs: false,
      includeConfig: true,
      ...options,
    };

    // Ensure backup directory exists
    if (!fs.existsSync(this.options.backupDir)) {
      fs.mkdirSync(this.options.backupDir, { recursive: true });
    }
  }

  /**
   * Create a full backup
   */
  async createFullBackup(description = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-full-${timestamp}`;
    const backupPath = path.join(this.options.backupDir, backupName);

    logger.info('Starting full backup', {
      backupName,
      backupPath,
      description,
    });

    try {
      // Create backup directory
      await mkdirAsync(backupPath, { recursive: true });

      // Create metadata
      const metadata = {
        type: 'full',
        timestamp: new Date().toISOString(),
        description,
        options: this.options,
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        application: {
          name: 'Post Master Pro',
          version: require('../../package.json').version,
        },
      };

      // 1. Backup database
      await this.backupDatabase(backupPath);

      // 2. Backup uploads if requested
      if (this.options.includeMedia) {
        await this.backupUploads(backupPath);
      }

      // 3. Backup logs if requested
      if (this.options.includeLogs) {
        await this.backupLogs(backupPath);
      }

      // 4. Backup configuration if requested
      if (this.options.includeConfig) {
        await this.backupConfig(backupPath);
      }

      // 5. Save metadata
      await writeFileAsync(
        path.join(backupPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      // 6. Compress backup if requested
      let finalBackupPath = backupPath;
      if (this.options.compress) {
        finalBackupPath = await this.compressBackup(backupPath);
      }

      // 7. Encrypt backup if requested
      if (this.options.encrypt && this.options.encryptionKey) {
        finalBackupPath = await this.encryptBackup(finalBackupPath);
      }

      // 8. Clean old backups
      await this.cleanOldBackups();

      logger.info('Full backup completed', {
        backupName,
        finalPath: finalBackupPath,
        size: await this.getFileSize(finalBackupPath),
      });

      return {
        success: true,
        backupPath: finalBackupPath,
        backupName,
        timestamp: metadata.timestamp,
        size: await this.getFileSize(finalBackupPath),
      };
    } catch (error) {
      logger.error('Full backup failed', {
        backupName,
        error: error.message,
        stack: error.stack,
      });

      // Cleanup failed backup
      try {
        if (fs.existsSync(backupPath)) {
          await this.deleteDirectory(backupPath);
        }
      } catch (cleanupError) {
        logger.error('Failed to cleanup backup directory', {
          error: cleanupError.message,
        });
      }

      throw error;
    }
  }

  /**
   * Create incremental backup
   */
  async createIncrementalBackup(lastBackupDate = null, description = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-incremental-${timestamp}`;
    const backupPath = path.join(this.options.backupDir, backupName);

    logger.info('Starting incremental backup', {
      backupName,
      lastBackupDate,
      description,
    });

    try {
      await mkdirAsync(backupPath, { recursive: true });

      const metadata = {
        type: 'incremental',
        timestamp: new Date().toISOString(),
        lastBackupDate,
        description,
        options: this.options,
      };

      // Get changes since last backup
      const changes = await this.getChangesSince(lastBackupDate);

      // Backup only changed data
      await this.backupDatabaseIncremental(backupPath, changes);
      await this.backupChangedFiles(backupPath, changes);

      // Save metadata and changes
      await writeFileAsync(
        path.join(backupPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      await writeFileAsync(
        path.join(backupPath, 'changes.json'),
        JSON.stringify(changes, null, 2)
      );

      // Compress if requested
      let finalBackupPath = backupPath;
      if (this.options.compress) {
        finalBackupPath = await this.compressBackup(backupPath);
      }

      // Encrypt if requested
      if (this.options.encrypt && this.options.encryptionKey) {
        finalBackupPath = await this.encryptBackup(finalBackupPath);
      }

      logger.info('Incremental backup completed', {
        backupName,
        changes: Object.keys(changes).length,
        finalPath: finalBackupPath,
        size: await this.getFileSize(finalBackupPath),
      });

      return {
        success: true,
        backupPath: finalBackupPath,
        backupName,
        timestamp: metadata.timestamp,
        changes: Object.keys(changes).length,
        size: await this.getFileSize(finalBackupPath),
      };
    } catch (error) {
      logger.error('Incremental backup failed', {
        backupName,
        error: error.message,
      });

      // Cleanup
      try {
        if (fs.existsSync(backupPath)) {
          await this.deleteDirectory(backupPath);
        }
      } catch (cleanupError) {
        logger.error('Failed to cleanup backup directory', {
          error: cleanupError.message,
        });
      }

      throw error;
    }
  }

  /**
   * Backup database
   */
  async backupDatabase(backupPath) {
    const dbBackupPath = path.join(backupPath, 'database');
    await mkdirAsync(dbBackupPath, { recursive: true });

    const dbConfig = config.database || config;

    try {
      // Use pg_dump for PostgreSQL
      if (dbConfig.dialect === 'postgres') {
        const dumpFile = path.join(dbBackupPath, 'database.sql');
        const pgDumpCmd = `pg_dump "${dbConfig.url}" > "${dumpFile}"`;
        
        await execAsync(pgDumpCmd, { maxBuffer: 10 * 1024 * 1024 });
        
        logger.info('PostgreSQL database backed up', { dumpFile });
      }
      // Use mysqldump for MySQL/MariaDB
      else if (dbConfig.dialect === 'mysql') {
        const dumpFile = path.join(dbBackupPath, 'database.sql');
        const { host, port, username, password, database } = dbConfig;
        
        let mysqlDumpCmd = `mysqldump --host=${host} --port=${port} --user=${username}`;
        if (password) {
          mysqlDumpCmd += ` --password=${password}`;
        }
        mysqlDumpCmd += ` ${database} > "${dumpFile}"`;
        
        await execAsync(mysqlDumpCmd, { maxBuffer: 10 * 1024 * 1024 });
        
        logger.info('MySQL database backed up', { dumpFile });
      }
      // For SQLite, just copy the file
      else if (dbConfig.dialect === 'sqlite') {
        const dbFile = dbConfig.storage;
        if (fs.existsSync(dbFile)) {
          const destFile = path.join(dbBackupPath, 'database.sqlite');
          fs.copyFileSync(dbFile, destFile);
          logger.info('SQLite database backed up', { destFile });
        }
      }
      // Fallback: Export data as JSON
      else {
        await this.exportDatabaseAsJson(dbBackupPath);
      }

      // Also backup Redis if configured
      if (config.REDIS_URL) {
        await this.backupRedis(dbBackupPath);
      }
    } catch (error) {
      logger.error('Database backup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Export database as JSON
   */
  async exportDatabaseAsJson(backupPath) {
    const models = require('../models');
    const jsonBackupPath = path.join(backupPath, 'json');
    await mkdirAsync(jsonBackupPath, { recursive: true });

    const modelNames = Object.keys(models).filter(
      key => key !== 'sequelize' && key !== 'Sequelize'
    );

    for (const modelName of modelNames) {
      const Model = models[modelName];
      if (Model && Model.findAll) {
        try {
          const data = await Model.findAll({ raw: true });
          const jsonFile = path.join(jsonBackupPath, `${modelName}.json`);
          await writeFileAsync(jsonFile, JSON.stringify(data, null, 2));
          
          logger.debug('Model exported as JSON', {
            model: modelName,
            records: data.length,
          });
        } catch (error) {
          logger.warn('Failed to export model', {
            model: modelName,
            error: error.message,
          });
        }
      }
    }

    logger.info('Database exported as JSON', {
      models: modelNames.length,
      path: jsonBackupPath,
    });
  }

  /**
   * Backup Redis
   */
  async backupRedis(backupPath) {
    try {
      const redis = require('../config/redis');
      const redisBackupPath = path.join(backupPath, 'redis');
      await mkdirAsync(redisBackupPath, { recursive: true });

      // Get all keys
      const keys = await redis.keys('*');
      const data = {};

      // Get values for each key
      for (const key of keys) {
        try {
          const type = await redis.type(key);
          let value;

          switch (type) {
            case 'string':
              value = await redis.get(key);
              break;
            case 'hash':
              value = await redis.hGetAll(key);
              break;
            case 'list':
              value = await redis.lRange(key, 0, -1);
              break;
            case 'set':
              value = await redis.sMembers(key);
              break;
            case 'zset':
              value = await redis.zRange(key, 0, -1, 'WITHSCORES');
              break;
            default:
              value = null;
          }

          data[key] = { type, value };
        } catch (error) {
          logger.warn('Failed to get Redis key', { key, error: error.message });
        }
      }

      // Save to file
      const redisFile = path.join(redisBackupPath, 'redis.json');
      await writeFileAsync(redisFile, JSON.stringify(data, null, 2));

      logger.info('Redis backed up', {
        keys: keys.length,
        file: redisFile,
      });
    } catch (error) {
      logger.error('Redis backup failed', { error: error.message });
      // Don't throw error for Redis backup failure
    }
  }

  /**
   * Backup uploads directory
   */
  async backupUploads(backupPath) {
    const uploadsPath = path.join(__dirname, '../../public/uploads');
    const uploadsBackupPath = path.join(backupPath, 'uploads');

    if (!fs.existsSync(uploadsPath)) {
      logger.warn('Uploads directory does not exist', { uploadsPath });
      return;
    }

    try {
      await this.copyDirectory(uploadsPath, uploadsBackupPath);
      logger.info('Uploads backed up', {
        source: uploadsPath,
        destination: uploadsBackupPath,
      });
    } catch (error) {
      logger.error('Uploads backup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Backup logs directory
   */
  async backupLogs(backupPath) {
    const logsPath = path.join(__dirname, '../../logs');
    const logsBackupPath = path.join(backupPath, 'logs');

    if (!fs.existsSync(logsPath)) {
      logger.warn('Logs directory does not exist', { logsPath });
      return;
    }

    try {
      await this.copyDirectory(logsPath, logsBackupPath);
      logger.info('Logs backed up', {
        source: logsPath,
        destination: logsBackupPath,
      });
    } catch (error) {
      logger.error('Logs backup failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Backup configuration
   */
  async backupConfig(backupPath) {
    const configBackupPath = path.join(backupPath, 'config');
    await mkdirAsync(configBackupPath, { recursive: true });

    const configFiles = [
      '.env',
      '.env.example',
      'package.json',
      'package-lock.json',
      'docker-compose.yml',
      'docker-compose.prod.yml',
      'Dockerfile',
      'nginx.conf',
    ];

    for (const file of configFiles) {
      const filePath = path.join(__dirname, '../../', file);
      if (fs.existsSync(filePath)) {
        const destPath = path.join(configBackupPath, file);
        fs.copyFileSync(filePath, destPath);
      }
    }

    // Backup src/config directory
    const srcConfigPath = path.join(__dirname, '../config');
    if (fs.existsSync(srcConfigPath)) {
      const destConfigPath = path.join(configBackupPath, 'src-config');
      await this.copyDirectory(srcConfigPath, destConfigPath);
    }

    logger.info('Configuration backed up', { path: configBackupPath });
  }

  /**
   * Backup database incrementally
   */
  async backupDatabaseIncremental(backupPath, changes) {
    // This would require tracking changes in the database
    // For now, we'll do a full backup for incremental as well
    // In production, you'd want to implement change tracking
    await this.backupDatabase(backupPath);
  }

  /**
   * Backup changed files
   */
  async backupChangedFiles(backupPath, changes) {
    // Implement file change tracking
    // This is a simplified version
    if (this.options.includeMedia && changes.files) {
      const changedFilesBackupPath = path.join(backupPath, 'changed-files');
      await mkdirAsync(changedFilesBackupPath, { recursive: true });

      for (const file of changes.files) {
        if (fs.existsSync(file)) {
          const relativePath = path.relative(
            path.join(__dirname, '../../'),
            file
          );
          const destPath = path.join(changedFilesBackupPath, relativePath);
          const destDir = path.dirname(destPath);

          if (!fs.existsSync(destDir)) {
            await mkdirAsync(destDir, { recursive: true });
          }

          fs.copyFileSync(file, destPath);
        }
      }
    }
  }

  /**
   * Get changes since last backup
   */
  async getChangesSince(lastBackupDate) {
    const changes = {
      database: {},
      files: [],
      logs: [],
    };

    // Get database changes (simplified)
    if (lastBackupDate) {
      const models = require('../models');
      const sequelize = models.sequelize;

      // Query for records modified since last backup
      // This is a simplified example - you'd need to implement per-model
      const modelNames = Object.keys(models).filter(
        key => key !== 'sequelize' && key !== 'Sequelize'
      );

      for (const modelName of modelNames) {
        const Model = models[modelName];
        if (Model && Model.findAll) {
          try {
            const updatedRecords = await Model.findAll({
              where: {
                updatedAt: {
                  [Sequelize.Op.gte]: lastBackupDate,
                },
              },
              raw: true,
              limit: 1000, // Limit for incremental backup
            });

            if (updatedRecords.length > 0) {
              changes.database[modelName] = updatedRecords.length;
            }
          } catch (error) {
            logger.warn('Failed to get changes for model', {
              model: modelName,
              error: error.message,
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Compress backup directory
   */
  async compressBackup(sourcePath) {
    const archivePath = sourcePath + '.zip';

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      output.on('close', () => {
        logger.info('Backup compressed', {
          source: sourcePath,
          archive: archivePath,
          size: archive.pointer() + ' total bytes',
        });

        // Delete original directory
        this.deleteDirectory(sourcePath)
          .then(() => resolve(archivePath))
          .catch(reject);
      });

      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  /**
   * Encrypt backup file
   */
  async encryptBackup(filePath) {
    if (!this.options.encryptionKey) {
      throw new Error('Encryption key is required for encryption');
    }

    const crypto = require('crypto');
    const encryptedPath = filePath + '.enc';

    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.options.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(encryptedPath);

    return new Promise((resolve, reject) => {
      output.on('finish', () => {
        // Delete original file
        unlinkAsync(filePath)
          .then(() => {
            logger.info('Backup encrypted', {
              original: filePath,
              encrypted: encryptedPath,
            });
            resolve(encryptedPath);
          })
          .catch(reject);
      });

      output.on('error', reject);

      // Write IV first
      output.write(iv);

      input.pipe(cipher).pipe(output);
    });
  }

  /**
   * Clean old backups
   */
  async cleanOldBackups() {
    try {
      const files = await readdirAsync(this.options.backupDir);
      const now = new Date();
      const retentionTime = this.options.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.options.backupDir, file);
        const stats = await statAsync(filePath);

        if (now - stats.mtime > retentionTime) {
          await unlinkAsync(filePath);
          logger.info('Old backup deleted', {
            file,
            age: Math.round((now - stats.mtime) / (24 * 60 * 60 * 1000)) + ' days',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to clean old backups', { error: error.message });
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath, options = {}) {
    logger.info('Starting backup restoration', { backupPath, options });

    try {
      // 1. Decrypt if encrypted
      let workingPath = backupPath;
      if (backupPath.endsWith('.enc')) {
        workingPath = await this.decryptBackup(backupPath);
      }

      // 2. Extract if compressed
      if (backupPath.endsWith('.zip') || workingPath.endsWith('.zip')) {
        workingPath = await this.extractBackup(
          workingPath.endsWith('.zip') ? workingPath : backupPath
        );
      }

      // 3. Read metadata
      const metadataPath = path.join(workingPath, 'metadata.json');
      if (!fs.existsSync(metadataPath)) {
        throw new Error('Backup metadata not found');
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

      // 4. Restore database
      if (!options.skipDatabase) {
        await this.restoreDatabase(workingPath, options);
      }

      // 5. Restore uploads
      if (options.restoreUploads && metadata.options.includeMedia) {
        await this.restoreUploads(workingPath);
      }

      // 6. Restore logs
      if (options.restoreLogs && metadata.options.includeLogs) {
        await this.restoreLogs(workingPath);
      }

      // 7. Restore config
      if (options.restoreConfig && metadata.options.includeConfig) {
        await this.restoreConfig(workingPath);
      }

      logger.info('Backup restoration completed', {
        backup: metadata.timestamp,
        type: metadata.type,
      });

      return {
        success: true,
        metadata,
        restored: {
          database: !options.skipDatabase,
          uploads: options.restoreUploads,
          logs: options.restoreLogs,
          config: options.restoreConfig,
        },
      };
    } catch (error) {
      logger.error('Backup restoration failed', {
        backupPath,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Helper methods
   */
  async copyDirectory(source, destination) {
    await mkdirAsync(destination, { recursive: true });

    const items = await readdirAsync(source, { withFileTypes: true });

    for (const item of items) {
      const srcPath = path.join(source, item.name);
      const destPath = path.join(destination, item.name);

      if (item.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  async deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const items = await readdirAsync(dirPath, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        if (item.isDirectory()) {
          await this.deleteDirectory(fullPath);
        } else {
          await unlinkAsync(fullPath);
        }
      }

      await fs.promises.rmdir(dirPath);
    }
  }

  async getFileSize(filePath) {
    try {
      const stats = await statAsync(filePath);
      return this.formatBytes(stats.size);
    } catch {
      return '0 Bytes';
    }
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * List available backups
   */
  async listBackups() {
    try {
      const files = await readdirAsync(this.options.backupDir);
      const backups = [];

      for (const file of files) {
        const filePath = path.join(this.options.backupDir, file);
        const stats = await statAsync(filePath);

        let metadata = null;
        let type = 'unknown';

        // Try to read metadata for compressed/encrypted backups
        if (file.endsWith('.zip') || file.endsWith('.enc')) {
          // For compressed/encrypted files, we can't easily read metadata
          type = file.endsWith('.enc') ? 'encrypted' : 'compressed';
        } else if (fs.existsSync(path.join(filePath, 'metadata.json'))) {
          try {
            const metadataContent = fs.readFileSync(
              path.join(filePath, 'metadata.json'),
              'utf8'
            );
            metadata = JSON.parse(metadataContent);
            type = metadata.type;
          } catch {
            // Ignore metadata read errors
          }
        }

        backups.push({
          name: file,
          path: filePath,
          size: stats.size,
          formattedSize: this.formatBytes(stats.size),
          modified: stats.mtime,
          type,
          metadata,
        });
      }

      // Sort by modification time (newest first)
      backups.sort((a, b) => b.modified - a.modified);

      return backups;
    } catch (error) {
      logger.error('Failed to list backups', { error: error.message });
      return [];
    }
  }

  /**
   * Get backup information
   */
  async getBackupInfo(backupPath) {
    try {
      let workingPath = backupPath;
      let isEncrypted = false;
      let isCompressed = false;

      // Check if encrypted
      if (backupPath.endsWith('.enc')) {
        isEncrypted = true;
        workingPath = backupPath.replace(/\.enc$/, '');
      }

      // Check if compressed
      if (workingPath.endsWith('.zip')) {
        isCompressed = true;
      }

      const stats = await statAsync(backupPath);
      const info = {
        path: backupPath,
        exists: true,
        size: stats.size,
        formattedSize: this.formatBytes(stats.size),
        modified: stats.mtime,
        isEncrypted,
        isCompressed,
        canRestore: false,
        metadata: null,
      };

      // Try to read metadata
      if (!isEncrypted && !isCompressed) {
        const metadataPath = path.join(backupPath, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
          try {
            info.metadata = JSON.parse(
              fs.readFileSync(metadataPath, 'utf8')
            );
            info.canRestore = true;
          } catch {
            // Ignore metadata read errors
          }
        }
      }

      return info;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          path: backupPath,
          exists: false,
        };
      }
      throw error;
    }
  }
}

/**
 * Command line interface
 */
if (require.main === module) {
  const yargs = require('yargs/yargs');
  const { hideBin } = require('yargs/helpers');

  const argv = yargs(hideBin(process.argv))
    .command('create', 'Create a new backup', {
      type: {
        alias: 't',
        choices: ['full', 'incremental'],
        default: 'full',
        description: 'Backup type',
      },
      description: {
        alias: 'd',
        type: 'string',
        description: 'Backup description',
      },
      'no-media': {
        type: 'boolean',
        default: false,
        description: 'Skip media files',
      },
      'no-logs': {
        type: 'boolean',
        default: false,
        description: 'Skip log files',
      },
      'no-config': {
        type: 'boolean',
        default: false,
        description: 'Skip configuration files',
      },
      compress: {
        alias: 'c',
        type: 'boolean',
        default: true,
        description: 'Compress backup',
      },
      encrypt: {
        alias: 'e',
        type: 'boolean',
        default: false,
        description: 'Encrypt backup',
      },
      'encryption-key': {
        type: 'string',
        description: 'Encryption key',
      },
    })
    .command('restore', 'Restore from backup', {
      backup: {
        alias: 'b',
        type: 'string',
        demandOption: true,
        description: 'Backup file or directory path',
      },
      'skip-database': {
        type: 'boolean',
        default: false,
        description: 'Skip database restoration',
      },
      'restore-uploads': {
        type: 'boolean',
        default: false,
        description: 'Restore uploads',
      },
      'restore-logs': {
        type: 'boolean',
        default: false,
        description: 'Restore logs',
      },
      'restore-config': {
        type: 'boolean',
        default: false,
        description: 'Restore configuration',
      },
      'decryption-key': {
        type: 'string',
        description: 'Decryption key',
      },
    })
    .command('list', 'List available backups')
    .command('info', 'Get backup information', {
      backup: {
        alias: 'b',
        type: 'string',
        demandOption: true,
        description: 'Backup file or directory path',
      },
    })
    .command('clean', 'Clean old backups', {
      'retention-days': {
        alias: 'r',
        type: 'number',
        default: 30,
        description: 'Number of days to retain backups',
      },
    })
    .help()
    .alias('help', 'h')
    .argv;

  const backup = new DatabaseBackup({
    includeMedia: !argv['no-media'],
    includeLogs: !argv['no-logs'],
    includeConfig: !argv['no-config'],
    compress: argv.compress,
    encrypt: argv.encrypt,
    encryptionKey: argv['encryption-key'],
  });

  async function run() {
    try {
      if (argv._.includes('create')) {
        if (argv.type === 'full') {
          const result = await backup.createFullBackup(argv.description);
          console.log('✅ Backup created:', result);
        } else {
          const result = await backup.createIncrementalBackup(
            null,
            argv.description
          );
          console.log('✅ Incremental backup created:', result);
        }
      } else if (argv._.includes('restore')) {
        const result = await backup.restoreBackup(argv.backup, {
          skipDatabase: argv['skip-database'],
          restoreUploads: argv['restore-uploads'],
          restoreLogs: argv['restore-logs'],
          restoreConfig: argv['restore-config'],
        });
        console.log('✅ Backup restored:', result);
      } else if (argv._.includes('list')) {
        const backups = await backup.listBackups();
        console.log('📦 Available backups:');
        backups.forEach((b, i) => {
          console.log(
            `${i + 1}. ${b.name} (${b.formattedSize}) - ${b.modified.toLocaleString()}`
          );
          if (b.metadata) {
            console.log(`   Type: ${b.metadata.type}, Description: ${b.metadata.description}`);
          }
        });
      } else if (argv._.includes('info')) {
        const info = await backup.getBackupInfo(argv.backup);
        console.log('📋 Backup information:', info);
      } else if (argv._.includes('clean')) {
        backup.options.retentionDays = argv['retention-days'];
        await backup.cleanOldBackups();
        console.log('✅ Old backups cleaned');
      } else {
        console.log('Please specify a command. Use --help for usage information.');
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }

  run();
}

module.exports = DatabaseBackup;