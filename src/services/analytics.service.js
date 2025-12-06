const sequelize = require('../config/database');
const { User, Post, Like, Comment, Share, View } = require('../models');
const redis = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');

class AnalyticsService {
  // User analytics
  async getUserAnalytics(userId, timeRange = '7d') {
    const cacheKey = `analytics:user:${userId}:${timeRange}`;
    
    if (config.ENABLE_CACHING) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const { startDate, endDate } = this.getDateRange(timeRange);
    
    const analytics = {
      overview: await this.getUserOverview(userId, startDate, endDate),
      engagement: await this.getUserEngagement(userId, startDate, endDate),
      growth: await this.getUserGrowth(userId, startDate, endDate),
      topPosts: await this.getUserTopPosts(userId, startDate, endDate),
      audience: await this.getUserAudience(userId),
      timeline: await this.getUserTimeline(userId, startDate, endDate),
    };

    if (config.ENABLE_CACHING) {
      await redis.setex(cacheKey, 300, JSON.stringify(analytics)); // 5 minutes cache
    }

    return analytics;
  }

  // Post analytics
  async getPostAnalytics(postId, timeRange = '7d') {
    const cacheKey = `analytics:post:${postId}:${timeRange}`;
    
    if (config.ENABLE_CACHING) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const { startDate, endDate } = this.getDateRange(timeRange);
    
    const analytics = {
      overview: await this.getPostOverview(postId, startDate, endDate),
      engagement: await this.getPostEngagement(postId, startDate, endDate),
      reach: await this.getPostReach(postId, startDate, endDate),
      demographics: await this.getPostDemographics(postId),
      timeline: await this.getPostTimeline(postId, startDate, endDate),
    };

    if (config.ENABLE_CACHING) {
      await redis.setex(cacheKey, 300, JSON.stringify(analytics));
    }

    return analytics;
  }

  // Platform analytics (admin only)
  async getPlatformAnalytics(timeRange = '7d') {
    const cacheKey = `analytics:platform:${timeRange}`;
    
    if (config.ENABLE_CACHING) {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const { startDate, endDate } = this.getDateRange(timeRange);
    
    const analytics = {
      overview: await this.getPlatformOverview(startDate, endDate),
      users: await this.getPlatformUsers(startDate, endDate),
      content: await this.getPlatformContent(startDate, endDate),
      engagement: await this.getPlatformEngagement(startDate, endDate),
      revenue: await this.getPlatformRevenue(startDate, endDate),
      performance: await this.getPlatformPerformance(startDate, endDate),
    };

    if (config.ENABLE_CACHING) {
      await redis.setex(cacheKey, 600, JSON.stringify(analytics)); // 10 minutes cache
    }

    return analytics;
  }

  // Helper methods
  getDateRange(timeRange) {
    const endDate = new Date();
    let startDate = new Date();

    switch (timeRange) {
      case '1h':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case '24h':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    return { startDate, endDate };
  }

  async getUserOverview(userId, startDate, endDate) {
    const [
      totalPosts,
      totalLikes,
      totalComments,
      totalShares,
      totalFollowers,
      totalFollowing,
      engagementRate,
    ] = await Promise.all([
      Post.count({ where: { userId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Like.count({ where: { userId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Comment.count({ where: { userId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Share.count({ where: { userId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      // Add follower/following counts
      this.getFollowerCount(userId),
      this.getFollowingCount(userId),
      this.calculateUserEngagementRate(userId, startDate, endDate),
    ]);

    return {
      totalPosts,
      totalLikes,
      totalComments,
      totalShares,
      totalFollowers,
      totalFollowing,
      engagementRate,
      avgPostsPerDay: totalPosts / this.getDaysBetween(startDate, endDate),
    };
  }

  async getPostOverview(postId, startDate, endDate) {
    const post = await Post.findByPk(postId);
    if (!post) return null;

    const [
      views,
      likes,
      comments,
      shares,
      saves,
      reach,
    ] = await Promise.all([
      View.count({ where: { postId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Like.count({ where: { postId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Comment.count({ where: { postId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Share.count({ where: { postId, createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      // Add saves count
      this.getPostSaves(postId, startDate, endDate),
      this.calculatePostReach(postId, startDate, endDate),
    ]);

    const engagement = likes + comments + shares;
    const engagementRate = views > 0 ? (engagement / views) * 100 : 0;

    return {
      views,
      likes,
      comments,
      shares,
      saves,
      reach,
      engagement,
      engagementRate,
      avgViewTime: await this.getAvgViewTime(postId, startDate, endDate),
    };
  }

  async getPlatformOverview(startDate, endDate) {
    const [
      totalUsers,
      newUsers,
      activeUsers,
      totalPosts,
      totalLikes,
      totalComments,
      totalShares,
      avgSessionDuration,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      this.getActiveUsers(startDate, endDate),
      Post.count({ where: { createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Like.count({ where: { createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Comment.count({ where: { createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      Share.count({ where: { createdAt: { [sequelize.Op.between]: [startDate, endDate] } } }),
      this.getAvgSessionDuration(startDate, endDate),
    ]);

    const totalEngagement = totalLikes + totalComments + totalShares;
    const engagementRate = totalPosts > 0 ? totalEngagement / totalPosts : 0;

    return {
      totalUsers,
      newUsers,
      activeUsers,
      totalPosts,
      totalLikes,
      totalComments,
      totalShares,
      totalEngagement,
      engagementRate,
      avgSessionDuration,
      userGrowthRate: newUsers / Math.max(totalUsers - newUsers, 1),
    };
  }

  // Additional helper methods would be implemented here
  // ...
}

module.exports = new AnalyticsService();