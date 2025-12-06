const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const Post = require('../models/Post');
const User = require('../models/User');
const Event = require('../models/Event');
const Group = require('../models/Group');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Follow = require('../models/Follow');
const cacheService = require('../services/cache.service');

// Create analytics queue
const analyticsQueue = new Queue('analytics', {
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
 * Analytics worker processor
 */
analyticsQueue.process('calculateUserAnalytics', async (job) => {
  const { userId, dateRange = 'month' } = job.data;
  
  logger.job('analytics', job.id, 'user_analytics_started', { userId, dateRange });

  try {
    const analytics = await calculateUserAnalytics(userId, dateRange);
    
    // Cache the results
    await cacheService.set(`analytics:user:${userId}:${dateRange}`, analytics, 3600);
    
    logger.job('analytics', job.id, 'user_analytics_completed', {
      userId,
      dateRange,
      metrics: Object.keys(analytics),
    });

    return { success: true, analytics };
  } catch (error) {
    logger.job('analytics', job.id, 'user_analytics_failed', {
      userId,
      error: error.message,
    });

    throw error;
  }
});

analyticsQueue.process('calculatePostAnalytics', async (job) => {
  const { postId, dateRange = 'week' } = job.data;
  
  logger.job('analytics', job.id, 'post_analytics_started', { postId, dateRange });

  try {
    const analytics = await calculatePostAnalytics(postId, dateRange);
    
    // Cache the results
    await cacheService.set(`analytics:post:${postId}:${dateRange}`, analytics, 1800);
    
    logger.job('analytics', job.id, 'post_analytics_completed', {
      postId,
      dateRange,
      metrics: Object.keys(analytics),
    });

    return { success: true, analytics };
  } catch (error) {
    logger.job('analytics', job.id, 'post_analytics_failed', {
      postId,
      error: error.message,
    });

    throw error;
  }
});

analyticsQueue.process('calculatePlatformAnalytics', async (job) => {
  const { dateRange = 'day', metrics = [] } = job.data;
  
  logger.job('analytics', job.id, 'platform_analytics_started', { dateRange, metrics });

  try {
    const analytics = await calculatePlatformAnalytics(dateRange, metrics);
    
    // Cache the results
    await cacheService.set(`analytics:platform:${dateRange}`, analytics, 900);
    
    logger.job('analytics', job.id, 'platform_analytics_completed', {
      dateRange,
      metrics: Object.keys(analytics),
    });

    return { success: true, analytics };
  } catch (error) {
    logger.job('analytics', job.id, 'platform_analytics_failed', {
      error: error.message,
    });

    throw error;
  }
});

analyticsQueue.process('calculateTrendingContent', async (job) => {
  const { type = 'posts', limit = 10, timeRange = 'day' } = job.data;
  
  logger.job('analytics', job.id, 'trending_started', { type, limit, timeRange });

  try {
    let trending;
    
    switch (type) {
      case 'posts':
        trending = await calculateTrendingPosts(limit, timeRange);
        break;
      case 'users':
        trending = await calculateTrendingUsers(limit, timeRange);
        break;
      case 'hashtags':
        trending = await calculateTrendingHashtags(limit, timeRange);
        break;
      default:
        throw new Error(`Unsupported trending type: ${type}`);
    }
    
    // Cache the results
    await cacheService.set(`trending:${type}:${timeRange}:${limit}`, trending, 300);
    
    logger.job('analytics', job.id, 'trending_completed', {
      type,
      limit,
      timeRange,
      count: trending.length,
    });

    return { success: true, trending };
  } catch (error) {
    logger.job('analytics', job.id, 'trending_failed', {
      type,
      error: error.message,
    });

    throw error;
  }
});

analyticsQueue.process('generateDailyReport', async (job) => {
  const { date = new Date().toISOString().split('T')[0] } = job.data;
  
  logger.job('analytics', job.id, 'daily_report_started', { date });

  try {
    const report = await generateDailyReport(date);
    
    logger.job('analytics', job.id, 'daily_report_completed', {
      date,
      reportSummary: Object.keys(report),
    });

    return { success: true, report };
  } catch (error) {
    logger.job('analytics', job.id, 'daily_report_failed', {
      date,
      error: error.message,
    });

    throw error;
  }
});

analyticsQueue.process('cleanOldAnalytics', async (job) => {
  const { days = 90 } = job.data;
  
  logger.job('analytics', job.id, 'cleanup_started', { days });

  try {
    const result = await cleanOldAnalyticsData(days);
    
    logger.job('analytics', job.id, 'cleanup_completed', result);
    
    return result;
  } catch (error) {
    logger.job('analytics', job.id, 'cleanup_failed', {
      error: error.message,
    });

    throw error;
  }
});

/**
 * Calculate user analytics
 */
async function calculateUserAnalytics(userId, dateRange) {
  const dateFilter = getDateFilter(dateRange);
  
  const [
    postsCount,
    postsGrowth,
    likesReceived,
    commentsReceived,
    followersCount,
    followersGrowth,
    followingCount,
    engagementRate,
    topPosts,
    activityByHour,
    topHashtags,
  ] = await Promise.all([
    // Total posts count
    Post.count({
      where: {
        userId,
        createdAt: dateFilter,
        isPublished: true,
        isDeleted: false,
      },
    }),
    
    // Posts growth (compared to previous period)
    calculateGrowth('posts', userId, dateRange),
    
    // Likes received
    calculateLikesReceived(userId, dateRange),
    
    // Comments received
    calculateCommentsReceived(userId, dateRange),
    
    // Current followers count
    Follow.count({
      where: {
        followingId: userId,
        createdAt: dateFilter,
      },
    }),
    
    // Followers growth
    calculateFollowersGrowth(userId, dateRange),
    
    // Following count
    Follow.count({
      where: {
        followerId: userId,
        createdAt: dateFilter,
      },
    }),
    
    // Engagement rate
    calculateEngagementRate(userId, dateRange),
    
    // Top performing posts
    getTopPosts(userId, dateRange, 5),
    
    // Activity by hour
    getUserActivityByHour(userId, dateRange),
    
    // Top used hashtags
    getTopUserHashtags(userId, dateRange, 10),
  ]);
  
  return {
    overview: {
      postsCount,
      likesReceived,
      commentsReceived,
      followersCount,
      followingCount,
      engagementRate: engagementRate.toFixed(2) + '%',
    },
    growth: {
      posts: postsGrowth,
      followers: followersGrowth,
    },
    topPosts,
    activityByHour,
    topHashtags,
    dateRange,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate post analytics
 */
async function calculatePostAnalytics(postId, dateRange) {
  const dateFilter = getDateFilter(dateRange);
  
  const post = await Post.findByPk(postId, {
    include: [
      {
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName'],
      },
    ],
  });
  
  if (!post) {
    throw new Error('Post not found');
  }
  
  const [
    viewsGrowth,
    likesGrowth,
    commentsGrowth,
    sharesGrowth,
    demographics,
    referrers,
    engagementTimeline,
    topCommenters,
  ] = await Promise.all([
    // Views growth
    calculateMetricGrowth('views', postId, dateRange),
    
    // Likes growth
    calculateMetricGrowth('likes', postId, dateRange),
    
    // Comments growth
    calculateMetricGrowth('comments', postId, dateRange),
    
    // Shares growth
    calculateMetricGrowth('shares', postId, dateRange),
    
    // Audience demographics (simplified)
    getPostDemographics(postId, dateRange),
    
    // Traffic referrers
    getPostReferrers(postId, dateRange),
    
    // Engagement timeline
    getPostEngagementTimeline(postId, dateRange),
    
    // Top commenters
    getTopCommenters(postId, dateRange, 5),
  ]);
  
  const engagementRate = calculatePostEngagementRate(post);
  
  return {
    basic: {
      id: post.id,
      type: post.type,
      author: post.author ? post.author.username : 'Unknown',
      createdAt: post.createdAt,
    },
    metrics: {
      views: post.viewsCount,
      likes: post.likesCount,
      comments: post.commentsCount,
      shares: post.sharesCount,
      saves: post.savesCount,
      reach: post.reachCount,
      engagementRate: engagementRate.toFixed(2) + '%',
    },
    growth: {
      views: viewsGrowth,
      likes: likesGrowth,
      comments: commentsGrowth,
      shares: sharesGrowth,
    },
    demographics,
    referrers,
    engagementTimeline,
    topCommenters,
    dateRange,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate platform analytics
 */
async function calculatePlatformAnalytics(dateRange, requestedMetrics = []) {
  const dateFilter = getDateFilter(dateRange);
  const metrics = requestedMetrics.length > 0 ? requestedMetrics : [
    'users', 'posts', 'engagement', 'growth', 'topContent'
  ];
  
  const results = {};
  
  // Calculate requested metrics
  for (const metric of metrics) {
    switch (metric) {
      case 'users':
        results.users = await calculateUserMetrics(dateFilter);
        break;
      case 'posts':
        results.posts = await calculatePostMetrics(dateFilter);
        break;
      case 'engagement':
        results.engagement = await calculateEngagementMetrics(dateFilter);
        break;
      case 'growth':
        results.growth = await calculateGrowthMetrics(dateRange);
        break;
      case 'topContent':
        results.topContent = await getTopContent(dateRange);
        break;
      case 'revenue':
        results.revenue = await calculateRevenueMetrics(dateFilter);
        break;
    }
  }
  
  return {
    ...results,
    dateRange,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate trending posts
 */
async function calculateTrendingPosts(limit = 10, timeRange = 'day') {
  const dateFilter = getDateFilter(timeRange);
  
  const posts = await Post.findAll({
    where: {
      createdAt: dateFilter,
      isPublished: true,
      isDeleted: false,
      privacy: 'public',
    },
    include: [
      {
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      },
    ],
    order: [
      // Score based on engagement
      ['likesCount', 'DESC'],
      ['commentsCount', 'DESC'],
      ['viewsCount', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit,
  });
  
  // Calculate trending score for each post
  const trendingPosts = posts.map(post => {
    const score = calculateTrendingScore(post, timeRange);
    return {
      ...post.toJSON(),
      trendingScore: score,
    };
  });
  
  // Sort by trending score
  trendingPosts.sort((a, b) => b.trendingScore - a.trendingScore);
  
  return trendingPosts.slice(0, limit);
}

/**
 * Calculate trending users
 */
async function calculateTrendingUsers(limit = 10, timeRange = 'day') {
  const dateFilter = getDateFilter(timeRange);
  
  // Get users with most followers growth
  const users = await User.findAll({
    where: {
      createdAt: dateFilter,
      isActive: true,
    },
    attributes: {
      include: [
        // Calculate follower growth
        [
          sequelize.literal(`(
            SELECT COUNT(*)
            FROM "Follows"
            WHERE "followingId" = "User"."id"
            AND "createdAt" >= NOW() - INTERVAL '1 ${timeRange}'
          )`),
          'recentFollowers'
        ],
        // Calculate post count
        [
          sequelize.literal(`(
            SELECT COUNT(*)
            FROM "Posts"
            WHERE "userId" = "User"."id"
            AND "createdAt" >= NOW() - INTERVAL '1 ${timeRange}'
            AND "isPublished" = true
            AND "isDeleted" = false
          )`),
          'recentPosts'
        ],
      ],
    },
    order: [
      [sequelize.literal('"recentFollowers"'), 'DESC'],
      [sequelize.literal('"recentPosts"'), 'DESC'],
    ],
    limit,
  });
  
  // Calculate trending score
  const trendingUsers = users.map(user => {
    const score = calculateUserTrendingScore(user, timeRange);
    return {
      ...user.toJSON(),
      trendingScore: score,
    };
  });
  
  // Sort by trending score
  trendingUsers.sort((a, b) => b.trendingScore - a.trendingScore);
  
  return trendingUsers.slice(0, limit);
}

/**
 * Calculate trending hashtags
 */
async function calculateTrendingHashtags(limit = 10, timeRange = 'day') {
  const dateFilter = getDateFilter(timeRange);
  
  // This would require a Hashtag model with post associations
  // For now, we'll extract from post content
  const posts = await Post.findAll({
    where: {
      createdAt: dateFilter,
      isPublished: true,
      isDeleted: false,
    },
    attributes: ['hashtags'],
  });
  
  // Count hashtag occurrences
  const hashtagCounts = {};
  posts.forEach(post => {
    const hashtags = post.hashtags || [];
    hashtags.forEach(hashtag => {
      hashtagCounts[hashtag] = (hashtagCounts[hashtag] || 0) + 1;
    });
  });
  
  // Convert to array and sort
  const trendingHashtags = Object.entries(hashtagCounts)
    .map(([hashtag, count]) => ({ hashtag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  
  return trendingHashtags;
}

/**
 * Generate daily report
 */
async function generateDailyReport(date) {
  const startDate = new Date(date);
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1);
  
  const [
    newUsers,
    activeUsers,
    newPosts,
    totalLikes,
    totalComments,
    totalShares,
    topPosts,
    userGrowth,
    engagementMetrics,
  ] = await Promise.all([
    // New users
    User.count({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
    }),
    
    // Active users (users who performed any action)
    calculateActiveUsers(startDate, endDate),
    
    // New posts
    Post.count({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
        isPublished: true,
        isDeleted: false,
      },
    }),
    
    // Total likes
    Like.count({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
    }),
    
    // Total comments
    Comment.count({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
    }),
    
    // Total shares
    Post.count({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
        type: 'shared',
        isPublished: true,
        isDeleted: false,
      },
    }),
    
    // Top 5 posts of the day
    getTopPosts(null, 'day', 5, startDate, endDate),
    
    // User growth compared to previous day
    calculateDailyGrowth('users', date),
    
    // Engagement metrics
    calculateDailyEngagement(date),
  ]);
  
  const totalEngagement = totalLikes + totalComments + totalShares;
  const avgEngagementPerUser = activeUsers > 0 ? (totalEngagement / activeUsers).toFixed(2) : 0;
  
  return {
    date,
    summary: {
      newUsers,
      activeUsers,
      newPosts,
      totalLikes,
      totalComments,
      totalShares,
      totalEngagement,
      avgEngagementPerUser,
    },
    growth: userGrowth,
    engagement: engagementMetrics,
    topPosts,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Helper functions
 */

function getDateFilter(dateRange) {
  const now = new Date();
  let startDate;
  
  switch (dateRange) {
    case 'hour':
      startDate = new Date(now.setHours(now.getHours() - 1));
      break;
    case 'day':
      startDate = new Date(now.setDate(now.getDate() - 1));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case 'quarter':
      startDate = new Date(now.setMonth(now.getMonth() - 3));
      break;
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      startDate = new Date(now.setDate(now.getDate() - 7));
  }
  
  return {
    [Op.gte]: startDate,
    [Op.lte]: new Date(),
  };
}

async function calculateGrowth(metric, entityId, dateRange) {
  const currentFilter = getDateFilter(dateRange);
  const previousFilter = getDateFilter(getPreviousDateRange(dateRange));
  
  let currentCount, previousCount;
  
  switch (metric) {
    case 'posts':
      currentCount = await Post.count({ where: { userId: entityId, createdAt: currentFilter } });
      previousCount = await Post.count({ where: { userId: entityId, createdAt: previousFilter } });
      break;
    case 'followers':
      currentCount = await Follow.count({ where: { followingId: entityId, createdAt: currentFilter } });
      previousCount = await Follow.count({ where: { followingId: entityId, createdAt: previousFilter } });
      break;
    default:
      return 0;
  }
  
  return previousCount > 0 
    ? (((currentCount - previousCount) / previousCount) * 100).toFixed(2)
    : currentCount > 0 ? 100 : 0;
}

function getPreviousDateRange(dateRange) {
  const mappings = {
    'hour': 'hour',
    'day': 'day',
    'week': 'week',
    'month': 'month',
    'quarter': 'quarter',
    'year': 'year',
  };
  return mappings[dateRange] || 'week';
}

function calculateTrendingScore(post, timeRange) {
  const weights = {
    'hour': { likes: 3, comments: 2, shares: 4, views: 0.1 },
    'day': { likes: 2, comments: 1.5, shares: 3, views: 0.05 },
    'week': { likes: 1, comments: 1, shares: 2, views: 0.01 },
    'month': { likes: 0.5, comments: 0.5, shares: 1, views: 0.005 },
  };
  
  const weight = weights[timeRange] || weights.day;
  const ageInHours = (new Date() - new Date(post.createdAt)) / (1000 * 60 * 60);
  
  // Decay factor: newer posts get higher scores
  const decayFactor = Math.exp(-ageInHours / 24);
  
  const score = (
    (post.likesCount || 0) * weight.likes +
    (post.commentsCount || 0) * weight.comments +
    (post.sharesCount || 0) * weight.shares +
    (post.viewsCount || 0) * weight.views
  ) * decayFactor;
  
  return score;
}

/**
 * Queue event handlers
 */
analyticsQueue.on('completed', (job, result) => {
  logger.info(`Analytics job ${job.id} completed`, {
    queue: 'analytics',
    jobId: job.id,
    type: job.name,
  });
});

analyticsQueue.on('failed', (job, error) => {
  logger.error(`Analytics job ${job.id} failed`, {
    queue: 'analytics',
    jobId: job.id,
    type: job.name,
    error: error.message,
    stack: error.stack,
  });

  // Retry logic for important analytics
  if (job.attemptsMade < job.opts.attempts) {
    const delay = Math.min(60000, 5000 * Math.pow(2, job.attemptsMade));
    job.retry(delay);
  }
});

analyticsQueue.on('stalled', (job) => {
  logger.warn(`Analytics job ${job.id} stalled`, {
    queue: 'analytics',
    jobId: job.id,
  });
});

analyticsQueue.on('error', (error) => {
  logger.error('Analytics queue error', {
    queue: 'analytics',
    error: error.message,
    stack: error.stack,
  });
});

/**
 * Add analytics job to queue
 */
const addAnalyticsJob = (type, data, options = {}) => {
  return analyticsQueue.add(type, data, {
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
    await analyticsQueue.clean(7 * 24 * 60 * 60 * 1000, 'completed');
    
    // Remove failed jobs older than 30 days
    await analyticsQueue.clean(30 * 24 * 60 * 60 * 1000, 'failed');
    
    logger.info('Cleaned old analytics jobs');
  } catch (error) {
    logger.error('Error cleaning analytics jobs', { error: error.message });
  }
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      analyticsQueue.getWaitingCount(),
      analyticsQueue.getActiveCount(),
      analyticsQueue.getCompletedCount(),
      analyticsQueue.getFailedCount(),
      analyticsQueue.getDelayedCount(),
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
    logger.error('Error getting analytics queue stats', { error: error.message });
    return null;
  }
};

/**
 * Schedule recurring analytics jobs
 */
const scheduleRecurringJobs = () => {
  // Daily platform analytics at 2 AM
  analyticsQueue.add('calculatePlatformAnalytics', 
    { dateRange: 'day' },
    { repeat: { cron: '0 2 * * *' } } // Every day at 2:00 AM
  );
  
  // Weekly user analytics on Monday at 3 AM
  analyticsQueue.add('calculatePlatformAnalytics',
    { dateRange: 'week' },
    { repeat: { cron: '0 3 * * 1' } } // Every Monday at 3:00 AM
  );
  
  // Monthly trending content at 4 AM on 1st of month
  analyticsQueue.add('calculateTrendingContent',
    { type: 'posts', limit: 20, timeRange: 'month' },
    { repeat: { cron: '0 4 1 * *' } } // 1st of every month at 4:00 AM
  );
  
  // Clean old analytics data every Sunday at 5 AM
  analyticsQueue.add('cleanOldAnalytics',
    { days: 90 },
    { repeat: { cron: '0 5 * * 0' } } // Every Sunday at 5:00 AM
  );
  
  logger.info('Scheduled recurring analytics jobs');
};

module.exports = {
  analyticsQueue,
  addAnalyticsJob,
  cleanOldJobs,
  getQueueStats,
  scheduleRecurringJobs,
  calculateUserAnalytics,
  calculatePostAnalytics,
  calculatePlatformAnalytics,
  calculateTrendingPosts,
  generateDailyReport,
};