const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');
const emailService = require('../services/email.service');

// Create email queue
const emailQueue = new Queue('email', {
  redis: config.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

/**
 * Email worker processor
 */
emailQueue.process('sendEmail', async (job) => {
  const { to, subject, template, data } = job.data;
  
  logger.job('email', job.id, 'started', {
    to,
    subject,
    template,
  });

  try {
    await emailService.sendEmail(to, subject, template, data);
    
    logger.job('email', job.id, 'completed', {
      to,
      subject,
      template,
    });

    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    logger.job('email', job.id, 'failed', {
      to,
      subject,
      template,
      error: error.message,
    });

    throw error;
  }
});

emailQueue.process('sendVerificationEmail', async (job) => {
  const { email, verificationUrl } = job.data;
  
  logger.job('email', job.id, 'verification_started', { email });

  try {
    await emailService.sendVerificationEmail(email, verificationUrl);
    
    logger.job('email', job.id, 'verification_completed', { email });
    
    return { success: true, message: 'Verification email sent' };
  } catch (error) {
    logger.job('email', job.id, 'verification_failed', {
      email,
      error: error.message,
    });

    throw error;
  }
});

emailQueue.process('sendPasswordResetEmail', async (job) => {
  const { email, resetUrl } = job.data;
  
  logger.job('email', job.id, 'reset_started', { email });

  try {
    await emailService.sendPasswordResetEmail(email, resetUrl);
    
    logger.job('email', job.id, 'reset_completed', { email });
    
    return { success: true, message: 'Password reset email sent' };
  } catch (error) {
    logger.job('email', job.id, 'reset_failed', {
      email,
      error: error.message,
    });

    throw error;
  }
});

emailQueue.process('sendWelcomeEmail', async (job) => {
  const { email, username } = job.data;
  
  logger.job('email', job.id, 'welcome_started', { email, username });

  try {
    await emailService.sendWelcomeEmail(email, username);
    
    logger.job('email', job.id, 'welcome_completed', { email, username });
    
    return { success: true, message: 'Welcome email sent' };
  } catch (error) {
    logger.job('email', job.id, 'welcome_failed', {
      email,
      username,
      error: error.message,
    });

    throw error;
  }
});

emailQueue.process('sendNotificationEmail', async (job) => {
  const { email, notification } = job.data;
  
  logger.job('email', job.id, 'notification_started', { email, type: notification.type });

  try {
    await emailService.sendNotificationEmail(email, notification);
    
    logger.job('email', job.id, 'notification_completed', { email, type: notification.type });
    
    return { success: true, message: 'Notification email sent' };
  } catch (error) {
    logger.job('email', job.id, 'notification_failed', {
      email,
      type: notification.type,
      error: error.message,
    });

    throw error;
  }
});

emailQueue.process('sendBulkEmail', async (job) => {
  const { recipients, subject, content } = job.data;
  
  logger.job('email', job.id, 'bulk_started', {
    recipientCount: recipients.length,
    subject,
  });

  try {
    const results = await emailService.sendBulkEmail(recipients, subject, content);
    
    logger.job('email', job.id, 'bulk_completed', {
      sent: results.sent.length,
      failed: results.failed.length,
    });
    
    return results;
  } catch (error) {
    logger.job('email', job.id, 'bulk_failed', {
      error: error.message,
    });

    throw error;
  }
});

/**
 * Queue event handlers
 */
emailQueue.on('completed', (job, result) => {
  logger.info(`Email job ${job.id} completed`, {
    queue: 'email',
    jobId: job.id,
    result,
  });
});

emailQueue.on('failed', (job, error) => {
  logger.error(`Email job ${job.id} failed`, {
    queue: 'email',
    jobId: job.id,
    error: error.message,
    data: job.data,
    stack: error.stack,
  });

  // Retry logic for critical emails
  if (job.attemptsMade < job.opts.attempts) {
    const delay = Math.min(60000, 5000 * Math.pow(2, job.attemptsMade));
    job.retry(delay);
  }
});

emailQueue.on('stalled', (job) => {
  logger.warn(`Email job ${job.id} stalled`, {
    queue: 'email',
    jobId: job.id,
  });
});

emailQueue.on('error', (error) => {
  logger.error('Email queue error', {
    queue: 'email',
    error: error.message,
    stack: error.stack,
  });
});

/**
 * Add email job to queue
 */
const addEmailJob = (type, data, options = {}) => {
  return emailQueue.add(type, data, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    ...options,
  });
};

/**
 * Clean old jobs
 */
const cleanOldJobs = async () => {
  try {
    // Remove completed jobs older than 7 days
    await emailQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
    
    // Remove failed jobs older than 30 days
    await emailQueue.clean(30 * 24 * 60 * 60 * 1000, 'failed');
    
    logger.info('Cleaned old email jobs');
  } catch (error) {
    logger.error('Error cleaning email jobs', { error: error.message });
  }
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      emailQueue.getWaitingCount(),
      emailQueue.getActiveCount(),
      emailQueue.getCompletedCount(),
      emailQueue.getFailedCount(),
      emailQueue.getDelayedCount(),
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
    logger.error('Error getting email queue stats', { error: error.message });
    return null;
  }
};

/**
 * Pause queue processing
 */
const pauseQueue = async () => {
  await emailQueue.pause();
  logger.info('Email queue paused');
};

/**
 * Resume queue processing
 */
const resumeQueue = async () => {
  await emailQueue.resume();
  logger.info('Email queue resumed');
};

/**
 * Empty the queue
 */
const emptyQueue = async () => {
  await emailQueue.empty();
  logger.info('Email queue emptied');
};

/**
 * Get job by ID
 */
const getJob = async (jobId) => {
  try {
    const job = await emailQueue.getJob(jobId);
    return job;
  } catch (error) {
    logger.error('Error getting email job', { jobId, error: error.message });
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
      logger.info('Email job removed', { jobId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error removing email job', { jobId, error: error.message });
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
      logger.info('Email job retried', { jobId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error retrying email job', { jobId, error: error.message });
    return false;
  }
};

module.exports = {
  emailQueue,
  addEmailJob,
  cleanOldJobs,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  emptyQueue,
  getJob,
  removeJob,
  retryJob,
};