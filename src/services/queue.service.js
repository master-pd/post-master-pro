const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');

class QueueService {
  constructor() {
    this.queues = new Map();
    this.initializeQueues();
  }

  initializeQueues() {
    // Define all queues
    const queueConfigs = [
      { name: 'email', concurrency: 5 },
      { name: 'notification', concurrency: 10 },
      { name: 'video', concurrency: 3 },
      { name: 'analytics', concurrency: 2 },
      { name: 'cleanup', concurrency: 1 },
    ];

    queueConfigs.forEach(({ name, concurrency }) => {
      const queue = new Queue(name, config.REDIS_URL, {
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      });

      // Error handling
      queue.on('error', (error) => {
        logger.error(`Queue ${name} error:`, error);
      });

      queue.on('failed', (job, error) => {
        logger.error(`Job ${job.id} failed in queue ${name}:`, error);
      });

      queue.on('completed', (job) => {
        logger.debug(`Job ${job.id} completed in queue ${name}`);
      });

      this.queues.set(name, {
        queue,
        concurrency,
      });
    });
  }

  getQueue(name) {
    const queueData = this.queues.get(name);
    if (!queueData) {
      throw new Error(`Queue ${name} not found`);
    }
    return queueData.queue;
  }

  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, options);
    logger.info(`Job ${job.id} added to queue ${queueName}: ${jobName}`);
    return job;
  }

  async processQueue(queueName, processor) {
    const queueData = this.queues.get(queueName);
    if (!queueData) {
      throw new Error(`Queue ${queueName} not found`);
    }

    queueData.queue.process(queueData.concurrency, async (job) => {
      try {
        logger.info(`Processing job ${job.id} in queue ${queueName}`);
        return await processor(job.data, job);
      } catch (error) {
        logger.error(`Error processing job ${job.id} in queue ${queueName}:`, error);
        throw error;
      }
    });

    logger.info(`Queue ${queueName} processor registered with concurrency ${queueData.concurrency}`);
  }

  async getJobCounts(queueName) {
    const queue = this.getQueue(queueName);
    return await queue.getJobCounts();
  }

  async cleanQueue(queueName, grace = 5000) {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    logger.info(`Queue ${queueName} cleaned`);
  }

  async pauseQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  }

  async resumeQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  }

  async emptyQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.empty();
    logger.info(`Queue ${queueName} emptied`);
  }

  async closeQueue(queueName) {
    const queue = this.getQueue(queueName);
    await queue.close();
    this.queues.delete(queueName);
    logger.info(`Queue ${queueName} closed`);
  }

  async closeAll() {
    for (const [name, { queue }] of this.queues) {
      await queue.close();
    }
    this.queues.clear();
    logger.info('All queues closed');
  }

  // Convenience methods for specific queues
  async addEmailJob(data, options = {}) {
    return this.addJob('email', 'send-email', data, options);
  }

  async addNotificationJob(data, options = {}) {
    return this.addJob('notification', 'send-notification', data, options);
  }

  async addVideoJob(data, options = {}) {
    return this.addJob('video', 'process-video', data, options);
  }

  async addAnalyticsJob(data, options = {}) {
    return this.addJob('analytics', 'process-analytics', data, options);
  }
}

module.exports = new QueueService();