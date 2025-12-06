const Queue = require('bull');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const config = require('../config');
const logger = require('../utils/logger');
const fileService = require('../services/file.service');
const cloudinary = require('../config/cloudinary');

// Promisify fs functions
const unlinkAsync = promisify(fs.unlink);
const statAsync = promisify(fs.stat);
const mkdirAsync = promisify(fs.mkdir);

// Create video processing queue
const videoQueue = new Queue('video-processing', {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: true,
    removeOnFail: false,
    timeout: 30 * 60 * 1000, // 30 minutes timeout
  },
});

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../../temp/videos');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Video worker processor
 */
videoQueue.process('processVideo', async (job) => {
  const { filePath, userId, options = {} } = job.data;
  
  logger.job('video-processing', job.id, 'started', {
    filePath,
    userId,
    options,
  });

  try {
    // Validate file exists
    await statAsync(filePath);
    
    // Generate unique filename
    const filename = path.basename(filePath);
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const outputDir = path.join(tempDir, fileId);
    await mkdirAsync(outputDir, { recursive: true });

    // Get video metadata
    const metadata = await getVideoMetadata(filePath);
    
    // Process video based on options
    const processedFiles = await processVideoFile(
      filePath,
      outputDir,
      metadata,
      options
    );

    // Upload processed files to cloud storage
    const uploadResults = await uploadProcessedFiles(
      processedFiles,
      userId,
      filename
    );

    // Cleanup temporary files
    await cleanupTempFiles(filePath, outputDir);

    logger.job('video-processing', job.id, 'completed', {
      userId,
      originalFile: filename,
      processedFiles: Object.keys(processedFiles),
      uploadResults,
    });

    return {
      success: true,
      metadata,
      processedFiles: uploadResults,
      jobId: job.id,
    };
  } catch (error) {
    logger.job('video-processing', job.id, 'failed', {
      filePath,
      userId,
      error: error.message,
      stack: error.stack,
    });

    // Cleanup on failure
    try {
      if (fs.existsSync(filePath)) {
        await unlinkAsync(filePath);
      }
    } catch (cleanupError) {
      logger.error('Error cleaning up failed video file', {
        filePath,
        error: cleanupError.message,
      });
    }

    throw error;
  }
});

videoQueue.process('generateThumbnail', async (job) => {
  const { videoPath, outputPath, timestamp = '00:00:01' } = job.data;
  
  logger.job('video-processing', job.id, 'thumbnail_started', {
    videoPath,
    outputPath,
    timestamp,
  });

  try {
    // Validate video exists
    await statAsync(videoPath);
    
    // Generate thumbnail
    await generateVideoThumbnail(videoPath, outputPath, timestamp);
    
    // Upload thumbnail to cloud storage
    const uploadResult = await fileService.uploadFile(outputPath, {
      folder: 'thumbnails',
      resource_type: 'image',
    });

    // Cleanup temporary file
    await unlinkAsync(outputPath);

    logger.job('video-processing', job.id, 'thumbnail_completed', {
      videoPath,
      thumbnailUrl: uploadResult.url,
    });

    return {
      success: true,
      thumbnailUrl: uploadResult.url,
      publicId: uploadResult.publicId,
    };
  } catch (error) {
    logger.job('video-processing', job.id, 'thumbnail_failed', {
      videoPath,
      error: error.message,
    });

    throw error;
  }
});

videoQueue.process('compressVideo', async (job) => {
  const { inputPath, outputPath, quality = 'medium' } = job.data;
  
  logger.job('video-processing', job.id, 'compress_started', {
    inputPath,
    outputPath,
    quality,
  });

  try {
    // Validate input file
    await statAsync(inputPath);
    
    // Get original size
    const originalStats = await statAsync(inputPath);
    const originalSize = originalStats.size;
    
    // Compress video
    await compressVideo(inputPath, outputPath, quality);
    
    // Get compressed size
    const compressedStats = await statAsync(outputPath);
    const compressedSize = compressedStats.size;
    
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

    logger.job('video-processing', job.id, 'compress_completed', {
      inputPath,
      originalSize: formatBytes(originalSize),
      compressedSize: formatBytes(compressedSize),
      compressionRatio: `${compressionRatio}%`,
    });

    return {
      success: true,
      outputPath,
      originalSize,
      compressedSize,
      compressionRatio,
    };
  } catch (error) {
    logger.job('video-processing', job.id, 'compress_failed', {
      inputPath,
      error: error.message,
    });

    throw error;
  }
});

videoQueue.process('extractAudio', async (job) => {
  const { videoPath, outputPath, format = 'mp3' } = job.data;
  
  logger.job('video-processing', job.id, 'audio_extract_started', {
    videoPath,
    outputPath,
    format,
  });

  try {
    // Validate video exists
    await statAsync(videoPath);
    
    // Extract audio
    await extractAudioFromVideo(videoPath, outputPath, format);
    
    // Get audio file stats
    const audioStats = await statAsync(outputPath);
    
    logger.job('video-processing', job.id, 'audio_extract_completed', {
      videoPath,
      audioSize: formatBytes(audioStats.size),
      format,
    });

    return {
      success: true,
      outputPath,
      size: audioStats.size,
      format,
    };
  } catch (error) {
    logger.job('video-processing', job.id, 'audio_extract_failed', {
      videoPath,
      error: error.message,
    });

    throw error;
  }
});

videoQueue.process('mergeVideos', async (job) => {
  const { videoPaths, outputPath } = job.data;
  
  logger.job('video-processing', job.id, 'merge_started', {
    videoCount: videoPaths.length,
    outputPath,
  });

  try {
    // Validate all input videos exist
    for (const videoPath of videoPaths) {
      await statAsync(videoPath);
    }
    
    // Merge videos
    await mergeVideos(videoPaths, outputPath);
    
    // Get merged video stats
    const mergedStats = await statAsync(outputPath);
    
    logger.job('video-processing', job.id, 'merge_completed', {
      videoCount: videoPaths.length,
      mergedSize: formatBytes(mergedStats.size),
    });

    return {
      success: true,
      outputPath,
      size: mergedStats.size,
    };
  } catch (error) {
    logger.job('video-processing', job.id, 'merge_failed', {
      error: error.message,
    });

    throw error;
  }
});

/**
 * Get video metadata using ffmpeg
 */
async function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(error);
      } else {
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        
        resolve({
          format: metadata.format,
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            aspectRatio: videoStream.display_aspect_ratio,
            fps: eval(videoStream.r_frame_rate),
            bitrate: videoStream.bit_rate,
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            channels: audioStream.channels,
            sampleRate: audioStream.sample_rate,
            bitrate: audioStream.bit_rate,
          } : null,
        });
      }
    });
  });
}

/**
 * Process video file with multiple outputs
 */
async function processVideoFile(inputPath, outputDir, metadata, options) {
  const results = {};
  const promises = [];

  // Generate thumbnail
  if (options.generateThumbnail !== false) {
    const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
    promises.push(
      generateVideoThumbnail(inputPath, thumbnailPath)
        .then(() => {
          results.thumbnail = thumbnailPath;
        })
    );
  }

  // Generate preview (short version)
  if (options.generatePreview) {
    const previewPath = path.join(outputDir, 'preview.mp4');
    const duration = Math.min(metadata.duration, 30); // Max 30 seconds preview
    promises.push(
      generateVideoPreview(inputPath, previewPath, duration)
        .then(() => {
          results.preview = previewPath;
        })
    );
  }

  // Compress for web
  if (options.compressForWeb !== false) {
    const webPath = path.join(outputDir, 'web.mp4');
    promises.push(
      compressVideo(inputPath, webPath, 'web')
        .then(() => {
          results.web = webPath;
        })
    );
  }

  // Compress for mobile
  if (options.compressForMobile) {
    const mobilePath = path.join(outputDir, 'mobile.mp4');
    promises.push(
      compressVideo(inputPath, mobilePath, 'mobile')
        .then(() => {
          results.mobile = mobilePath;
        })
    );
  }

  // Generate different resolutions
  if (options.resolutions) {
    for (const resolution of options.resolutions) {
      const resPath = path.join(outputDir, `${resolution}p.mp4`);
      promises.push(
        convertResolution(inputPath, resPath, resolution)
          .then(() => {
            results[`${resolution}p`] = resPath;
          })
      );
    }
  }

  // Wait for all processing to complete
  await Promise.all(promises);
  
  return results;
}

/**
 * Generate video thumbnail
 */
async function generateVideoThumbnail(inputPath, outputPath, timestamp = '00:00:01') {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '640x360',
      })
      .on('end', resolve)
      .on('error', reject);
  });
}

/**
 * Generate video preview (short version)
 */
async function generateVideoPreview(inputPath, outputPath, duration = 30) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .duration(duration)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset fast', '-crf 23'])
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Compress video
 */
async function compressVideo(inputPath, outputPath, quality = 'medium') {
  const qualitySettings = {
    low: {
      videoBitrate: '500k',
      audioBitrate: '64k',
      size: '640x360',
    },
    medium: {
      videoBitrate: '1000k',
      audioBitrate: '128k',
      size: '854x480',
    },
    high: {
      videoBitrate: '2500k',
      audioBitrate: '192k',
      size: '1280x720',
    },
    web: {
      videoBitrate: '1500k',
      audioBitrate: '128k',
      size: '1280x720',
      preset: 'fast',
    },
    mobile: {
      videoBitrate: '800k',
      audioBitrate: '96k',
      size: '854x480',
      preset: 'ultrafast',
    },
  };

  const settings = qualitySettings[quality] || qualitySettings.medium;

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .output(outputPath)
      .videoBitrate(settings.videoBitrate)
      .audioBitrate(settings.audioBitrate)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset', settings.preset || 'medium', '-crf', '23']);

    if (settings.size) {
      command.size(settings.size);
    }

    command
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Convert video to specific resolution
 */
async function convertResolution(inputPath, outputPath, resolution) {
  const resolutions = {
    240: '426x240',
    360: '640x360',
    480: '854x480',
    720: '1280x720',
    1080: '1920x1080',
    1440: '2560x1440',
    2160: '3840x2160',
  };

  const size = resolutions[resolution] || '854x480';

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .size(size)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions(['-preset fast', '-crf 23'])
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Extract audio from video
 */
async function extractAudioFromVideo(inputPath, outputPath, format = 'mp3') {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Merge multiple videos
 */
async function mergeVideos(videoPaths, outputPath) {
  // Create text file with video list for concatenation
  const listFile = path.join(path.dirname(outputPath), 'list.txt');
  const listContent = videoPaths.map(video => `file '${video}'`).join('\n');
  fs.writeFileSync(listFile, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy'])
      .output(outputPath)
      .on('end', () => {
        // Cleanup list file
        unlinkAsync(listFile).catch(() => {});
        resolve();
      })
      .on('error', reject)
      .run();
  });
}

/**
 * Upload processed files to cloud storage
 */
async function uploadProcessedFiles(files, userId, originalFilename) {
  const results = {};
  
  for (const [type, filePath] of Object.entries(files)) {
    try {
      const folder = `videos/${userId}/${type}`;
      const uploadResult = await fileService.uploadFile(filePath, {
        folder,
        resource_type: type === 'thumbnail' ? 'image' : 'video',
        public_id: `${path.parse(originalFilename).name}-${type}`,
      });
      
      results[type] = {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        format: uploadResult.format,
        size: uploadResult.bytes,
        width: uploadResult.width,
        height: uploadResult.height,
        duration: uploadResult.duration,
      };
    } catch (error) {
      logger.error('Error uploading processed video file', {
        type,
        filePath,
        userId,
        error: error.message,
      });
      results[type] = { error: error.message };
    }
  }
  
  return results;
}

/**
 * Cleanup temporary files
 */
async function cleanupTempFiles(originalPath, outputDir) {
  const filesToDelete = [originalPath];
  
  // Add all files in output directory
  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    files.forEach(file => {
      filesToDelete.push(path.join(outputDir, file));
    });
    filesToDelete.push(outputDir);
  }
  
  // Delete files
  for (const file of filesToDelete) {
    try {
      if (fs.existsSync(file)) {
        if (fs.statSync(file).isDirectory()) {
          fs.rmdirSync(file, { recursive: true });
        } else {
          await unlinkAsync(file);
        }
      }
    } catch (error) {
      logger.warn('Error deleting temp file', { file, error: error.message });
    }
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Queue event handlers
 */
videoQueue.on('completed', (job, result) => {
  logger.info(`Video job ${job.id} completed`, {
    queue: 'video-processing',
    jobId: job.id,
    type: job.name,
    result: result.success,
  });
});

videoQueue.on('failed', (job, error) => {
  logger.error(`Video job ${job.id} failed`, {
    queue: 'video-processing',
    jobId: job.id,
    type: job.name,
    error: error.message,
    data: job.data,
    stack: error.stack,
  });

  // Retry logic
  if (job.attemptsMade < job.opts.attempts) {
    const delay = Math.min(300000, 10000 * Math.pow(2, job.attemptsMade));
    job.retry(delay);
  }
});

videoQueue.on('stalled', (job) => {
  logger.warn(`Video job ${job.id} stalled`, {
    queue: 'video-processing',
    jobId: job.id,
  });
});

videoQueue.on('error', (error) => {
  logger.error('Video queue error', {
    queue: 'video-processing',
    error: error.message,
    stack: error.stack,
  });
});

/**
 * Add video job to queue
 */
const addVideoJob = (type, data, options = {}) => {
  return videoQueue.add(type, data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    timeout: options.timeout || 30 * 60 * 1000,
    ...options,
  });
};

/**
 * Clean old jobs
 */
const cleanOldJobs = async () => {
  try {
    // Remove completed jobs older than 7 days
    await videoQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
    
    // Remove failed jobs older than 30 days
    await videoQueue.clean(30 * 24 * 60 * 60 * 1000, 'failed');
    
    logger.info('Cleaned old video jobs');
  } catch (error) {
    logger.error('Error cleaning video jobs', { error: error.message });
  }
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      videoQueue.getWaitingCount(),
      videoQueue.getActiveCount(),
      videoQueue.getCompletedCount(),
      videoQueue.getFailedCount(),
      videoQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  } catch (error) {
    logger.error('Error getting video queue stats', { error: error.message });
    return null;
  }
};

/**
 * Pause queue processing
 */
const pauseQueue = async () => {
  await videoQueue.pause();
  logger.info('Video queue paused');
};

/**
 * Resume queue processing
 */
const resumeQueue = async () => {
  await videoQueue.resume();
  logger.info('Video queue resumed');
};

/**
 * Empty the queue
 */
const emptyQueue = async () => {
  await videoQueue.empty();
  logger.info('Video queue emptied');
};

/**
 * Get job by ID
 */
const getJob = async (jobId) => {
  try {
    const job = await videoQueue.getJob(jobId);
    return job;
  } catch (error) {
    logger.error('Error getting video job', { jobId, error: error.message });
    return null;
  }
};

/**
 * Remove job by ID
 */
const removeJob = async (jobId) => {
  try {
    const job = await getJob(jobId);
    if (job) {
      await job.remove();
      logger.info('Video job removed', { jobId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error removing video job', { jobId, error: error.message });
    return false;
  }
};

/**
 * Retry failed job
 */
const retryJob = async (jobId) => {
  try {
    const job = await getJob(jobId);
    if (job) {
      await job.retry();
      logger.info('Video job retried', { jobId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error retrying video job', { jobId, error: error.message });
    return false;
  }
};

module.exports = {
  videoQueue,
  addVideoJob,
  cleanOldJobs,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  emptyQueue,
  getJob,
  removeJob,
  retryJob,
  getVideoMetadata,
  generateVideoThumbnail,
  compressVideo,
};