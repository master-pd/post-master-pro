const { addEmailJob } = require('../workers/email.worker');
const logger = require('../utils/logger');

/**
 * Email job utilities
 */
class EmailJobs {
  /**
   * Send verification email
   */
  static async sendVerificationEmail(email, verificationUrl) {
    try {
      const job = await addEmailJob('sendVerificationEmail', {
        email,
        verificationUrl,
      }, {
        priority: 1, // High priority
        attempts: 5,
        backoff: 10000,
      });

      logger.info('Verification email job added', {
        email,
        jobId: job.id,
        verificationUrl,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add verification email job', {
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(email, resetUrl) {
    try {
      const job = await addEmailJob('sendPasswordResetEmail', {
        email,
        resetUrl,
      }, {
        priority: 1, // High priority
        attempts: 5,
        backoff: 10000,
      });

      logger.info('Password reset email job added', {
        email,
        jobId: job.id,
        resetUrl,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add password reset email job', {
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send welcome email
   */
  static async sendWelcomeEmail(email, username) {
    try {
      const job = await addEmailJob('sendWelcomeEmail', {
        email,
        username,
      }, {
        priority: 0, // Normal priority
        delay: 5000, // 5 second delay
        attempts: 3,
      });

      logger.info('Welcome email job added', {
        email,
        username,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add welcome email job', {
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send notification email
   */
  static async sendNotificationEmail(email, notification) {
    try {
      const job = await addEmailJob('sendNotificationEmail', {
        email,
        notification,
      }, {
        priority: 0, // Normal priority
        attempts: 3,
      });

      logger.info('Notification email job added', {
        email,
        notificationId: notification.id,
        type: notification.type,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add notification email job', {
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send generic email
   */
  static async sendEmail(to, subject, template, data) {
    try {
      const job = await addEmailJob('sendEmail', {
        to,
        subject,
        template,
        data,
      }, {
        priority: 0,
        attempts: 3,
      });

      logger.info('Email job added', {
        to,
        subject,
        template,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add email job', {
        to,
        subject,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send bulk emails
   */
  static async sendBulkEmails(recipients, subject, content) {
    try {
      const job = await addEmailJob('sendBulkEmail', {
        recipients,
        subject,
        content,
      }, {
        priority: -1, // Low priority
        attempts: 3,
        backoff: 30000,
        timeout: 300000, // 5 minutes timeout
      });

      logger.info('Bulk email job added', {
        recipientCount: recipients.length,
        subject,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add bulk email job', {
        recipientCount: recipients.length,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send email with attachment
   */
  static async sendEmailWithAttachment(to, subject, html, attachment) {
    try {
      const job = await addEmailJob('sendEmail', {
        to,
        subject,
        template: 'custom',
        data: {
          html,
          attachments: [attachment],
        },
      }, {
        priority: 0,
        attempts: 3,
      });

      logger.info('Email with attachment job added', {
        to,
        subject,
        attachmentName: attachment.filename,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add email with attachment job', {
        to,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send scheduled email
   */
  static async sendScheduledEmail(to, subject, template, data, sendAt) {
    try {
      const delay = new Date(sendAt) - new Date();
      
      if (delay < 0) {
        throw new Error('Scheduled time is in the past');
      }

      const job = await addEmailJob('sendEmail', {
        to,
        subject,
        template,
        data,
      }, {
        priority: 0,
        delay,
        attempts: 3,
      });

      logger.info('Scheduled email job added', {
        to,
        subject,
        sendAt,
        jobId: job.id,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add scheduled email job', {
        to,
        sendAt,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send email with retry logic
   */
  static async sendEmailWithRetry(to, subject, template, data, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const job = await this.sendEmail(to, subject, template, data);
        return job;
      } catch (error) {
        lastError = error;
        logger.warn(`Email send attempt ${i + 1} failed`, {
          to,
          subject,
          error: error.message,
        });
        
        if (i < maxRetries - 1) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => 
            setTimeout(resolve, 1000 * Math.pow(2, i))
          );
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get email job status
   */
  static async getJobStatus(jobId) {
    try {
      const { getJob } = require('../workers/email.worker');
      const job = await getJob(jobId);
      
      if (!job) {
        return { exists: false };
      }

      const state = await job.getState();
      const progress = job._progress;
      const result = await job.finished().catch(() => null);

      return {
        exists: true,
        id: job.id,
        name: job.name,
        data: job.data,
        state,
        progress,
        result,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      };
    } catch (error) {
      logger.error('Failed to get email job status', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cancel scheduled email
   */
  static async cancelScheduledEmail(jobId) {
    try {
      const { removeJob } = require('../workers/email.worker');
      const success = await removeJob(jobId);
      
      if (success) {
        logger.info('Scheduled email cancelled', { jobId });
      } else {
        logger.warn('Email job not found or already processed', { jobId });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to cancel scheduled email', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Retry failed email job
   */
  static async retryFailedEmail(jobId) {
    try {
      const { retryJob } = require('../workers/email.worker');
      const success = await retryJob(jobId);
      
      if (success) {
        logger.info('Failed email job retried', { jobId });
      } else {
        logger.warn('Failed email job not found', { jobId });
      }
      
      return success;
    } catch (error) {
      logger.error('Failed to retry email job', {
        jobId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get email queue statistics
   */
  static async getQueueStats() {
    try {
      const { getQueueStats } = require('../workers/email.worker');
      const stats = await getQueueStats();
      return stats;
    } catch (error) {
      logger.error('Failed to get email queue stats', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clean old email jobs
   */
  static async cleanOldJobs() {
    try {
      const { cleanOldJobs } = require('../workers/email.worker');
      await cleanOldJobs();
      logger.info('Old email jobs cleaned');
    } catch (error) {
      logger.error('Failed to clean old email jobs', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Pause email queue
   */
  static async pauseQueue() {
    try {
      const { pauseQueue } = require('../workers/email.worker');
      await pauseQueue();
      logger.info('Email queue paused');
    } catch (error) {
      logger.error('Failed to pause email queue', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Resume email queue
   */
  static async resumeQueue() {
    try {
      const { resumeQueue } = require('../workers/email.worker');
      await resumeQueue();
      logger.info('Email queue resumed');
    } catch (error) {
      logger.error('Failed to resume email queue', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = EmailJobs;