const sequelize = require('../config/database');
const { User, Post, Follow, Like, Comment, View } = require('../models');
const redis = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');

class FeedService {
  constructor() {
    this.cacheKey = (userId) => `feed:user:${userId}`;
    this.cacheTTL = 300; // 5 minutes
  }

  async getPersonalizedFeed(userId, page = 1, limit = 20) {
    const cacheKey = `${this.cacheKey(userId)}:page:${page}`;
    
    // Try cache first
    if (config.ENABLE_CACHING) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const offset = (page - 1) * limit;
    
    // Get user's followed users
    const followedUsers = await Follow.findAll({
      where: { followerId: userId },
      attributes: ['followingId'],
    });
    
    const followingIds = followedUsers.map(f => f.followingId);
    followingIds.push(userId); // Include user's own posts

    // Get posts based on algorithm
    const feed = await this.generateAlgorithmicFeed(
      userId,
      followingIds,
      offset,
      limit
    );

    // Cache the result
    if (config.ENABLE_CACHING) {
      await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(feed));
    }

    return feed;
  }

  async generateAlgorithmicFeed(userId, followingIds, offset, limit) {
    // Algorithm: 50% recency, 30% popularity, 20% relevance
    const recencyWeight = 0.5;
    const popularityWeight = 0.3;
    const relevanceWeight = 0.2;

    // Get raw posts
    const posts = await Post.findAll({
      where: {
        userId: followingIds,
        isPublished: true,
        isDeleted: false,
        [sequelize.Op.or]: [
          { privacy: 'public' },
          { 
            [sequelize.Op.and]: [
              { privacy: 'friends' },
              { userId: followingIds }
            ]
          }
        ]
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture'],
        },
        {
          model: Like,
          as: 'likes',
          attributes: ['userId'],
          where: { userId },
          required: false,
        },
        {
          model: Comment,
          as: 'comments',
          attributes: ['id'],
          limit: 3,
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'fullName', 'profilePicture'],
          }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: limit * 3, // Get more for sorting
      offset,
    });

    // Calculate scores for each post
    const scoredPosts = await Promise.all(
      posts.map(async (post) => {
        const recencyScore = this.calculateRecencyScore(post.createdAt);
        const popularityScore = await this.calculatePopularityScore(post);
        const relevanceScore = await this.calculateRelevanceScore(post, userId);

        const totalScore = 
          (recencyScore * recencyWeight) +
          (popularityScore * popularityWeight) +
          (relevanceScore * relevanceWeight);

        return {
          post: post.toJSON(),
          score: totalScore,
          isLiked: post.likes.length > 0,
        };
      })
    );

    // Sort by score and limit
    return scoredPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.post,
        isLiked: item.isLiked,
        score: item.score,
      }));
  }

  calculateRecencyScore(createdAt) {
    const now = new Date();
    const postDate = new Date(createdAt);
    const hoursDiff = (now - postDate) / (1000 * 60 * 60);
    
    // Exponential decay: score = e^(-0.1 * hours)
    return Math.exp(-0.1 * hoursDiff);
  }

  async calculatePopularityScore(post) {
    const { likesCount, commentsCount, sharesCount, viewsCount } = post;
    
    const engagement = likesCount + (commentsCount * 2) + (sharesCount * 3);
    const normalizedEngagement = engagement / Math.max(viewsCount, 1);
    
    // Logarithmic scaling to prevent domination by viral posts
    return Math.log1p(normalizedEngagement * 100);
  }

  async calculateRelevanceScore(post, userId) {
    let score = 0;
    
    // 1. User interaction history
    const userInteractions = await this.getUserInteractionScore(userId, post.id);
    score += userInteractions * 0.4;
    
    // 2. Content similarity with liked posts
    const contentSimilarity = await this.calculateContentSimilarity(userId, post);
    score += contentSimilarity * 0.3;
    
    // 3. Social proximity (friends of friends)
    const socialProximity = await this.calculateSocialProximity(userId, post.userId);
    score += socialProximity * 0.3;
    
    return score;
  }

  async getUserInteractionScore(userId, postId) {
    const interactions = await sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM "Likes" WHERE "userId" = :userId AND "postId" = :postId) as likes,
        (SELECT COUNT(*) FROM "Comments" WHERE "userId" = :userId AND "postId" = :postId) as comments,
        (SELECT COUNT(*) FROM "Shares" WHERE "userId" = :userId AND "postId" = :postId) as shares,
        (SELECT COUNT(*) FROM "Views" WHERE "userId" = :userId AND "postId" = :postId) as views
    `, {
      replacements: { userId, postId },
      type: sequelize.QueryTypes.SELECT,
    });

    const { likes, comments, shares, views } = interactions[0];
    return (likes * 1) + (comments * 2) + (shares * 3) + (views * 0.5);
  }

  async calculateContentSimilarity(userId, post) {
    // Get user's liked posts content
    const userLikedPosts = await Post.findAll({
      include: [{
        model: Like,
        as: 'likes',
        where: { userId },
        attributes: [],
      }],
      attributes: ['content', 'hashtags'],
      limit: 50,
    });

    if (userLikedPosts.length === 0) return 0.5; // Default score

    // Simple keyword matching (in production, use NLP/ML)
    const postKeywords = this.extractKeywords(post.content);
    let matchScore = 0;

    for (const likedPost of userLikedPosts) {
      const likedKeywords = this.extractKeywords(likedPost.content);
      const commonKeywords = postKeywords.filter(k => likedKeywords.includes(k));
      matchScore += commonKeywords.length / Math.max(postKeywords.length, 1);
    }

    return matchScore / userLikedPosts.length;
  }

  async calculateSocialProximity(userId, postAuthorId) {
    if (userId === postAuthorId) return 1;

    // Check if direct follow
    const directFollow = await Follow.findOne({
      where: {
        followerId: userId,
        followingId: postAuthorId,
      },
    });
    if (directFollow) return 0.8;

    // Check mutual connections
    const mutualCount = await sequelize.query(`
      SELECT COUNT(*) FROM "Follows" f1
      JOIN "Follows" f2 ON f1."followingId" = f2."followerId"
      WHERE f1."followerId" = :userId 
      AND f2."followingId" = :postAuthorId
    `, {
      replacements: { userId, postAuthorId },
      type: sequelize.QueryTypes.SELECT,
    });

    const count = parseInt(mutualCount[0].count);
    return Math.min(count / 10, 0.7); // Cap at 0.7
  }

  extractKeywords(text) {
    if (!text) return [];
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 20);
  }

  async invalidateUserFeedCache(userId) {
    if (!config.ENABLE_CACHING) return;
    
    const pattern = `${this.cacheKey(userId)}:*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }

  async getTrendingPosts(limit = 20) {
    const cacheKey = 'feed:trending';
    
    if (config.ENABLE_CACHING) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Get posts from last 24 hours with high engagement
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const trendingPosts = await Post.findAll({
      where: {
        createdAt: { [sequelize.Op.gte]: oneDayAgo },
        isPublished: true,
        isDeleted: false,
        privacy: 'public',
      },
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order: [
        [sequelize.literal('("likesCount" * 1 + "commentsCount" * 2 + "sharesCount" * 3) / NULLIF("viewsCount", 0)'), 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit,
    });

    const result = trendingPosts.map(post => post.toJSON());

    if (config.ENABLE_CACHING) {
      await redis.setex(cacheKey, 600, JSON.stringify(result)); // 10 minutes cache
    }

    return result;
  }

  async getExploreFeed(userId, interests = [], page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    let whereClause = {
      isPublished: true,
      isDeleted: false,
      privacy: 'public',
    };

    // Filter by interests if provided
    if (interests.length > 0) {
      whereClause[sequelize.Op.or] = interests.map(interest => ({
        [sequelize.Op.or]: [
          { content: { [sequelize.Op.iLike]: `%${interest}%` } },
          sequelize.where(
            sequelize.fn('jsonb_exists_any', 
              sequelize.col('hashtags'), 
              interests
            ),
            true
          )
        ]
      }));
    }

    // Exclude user's own posts and already seen
    const seenPosts = await View.findAll({
      where: { userId },
      attributes: ['postId'],
    });
    
    const seenPostIds = seenPosts.map(v => v.postId);
    if (seenPostIds.length > 0) {
      whereClause.id = { [sequelize.Op.notIn]: seenPostIds };
    }

    const explorePosts = await Post.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order: [
        ['createdAt', 'DESC'],
        [sequelize.literal('RANDOM()')] // Add some randomness
      ],
      limit,
      offset,
    });

    return explorePosts.map(post => post.toJSON());
  }
}

module.exports = new FeedService();