const { Op } = require('sequelize');
const Post = require('../models/Post');
const User = require('../models/User');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Bookmark = require('../models/Bookmark');
const Hashtag = require('../models/Hashtag');
const cacheService = require('./cache.service');
const searchService = require('./search.service');

class PostService {
  /**
   * Create a new post
   */
  async createPost(userId, postData) {
    const post = await Post.create({
      userId,
      ...postData
    });

    // Extract and process hashtags
    if (postData.content) {
      const hashtags = this.extractHashtags(postData.content);
      await this.processHashtags(post.id, hashtags);
    }

    // Index in search engine
    if (process.env.ENABLE_SEARCH === 'true') {
      await searchService.indexPost(post);
    }

    // Invalidate cache
    await cacheService.invalidateUserFeedCache(userId);
    await cacheService.invalidateCache(`user:${userId}:posts`);

    return post;
  }

  /**
   * Get post by ID with related data
   */
  async getPostById(postId, userId = null) {
    const cacheKey = `post:${postId}:${userId || 'anon'}`;
    const cachedPost = await cacheService.get(cacheKey);
    
    if (cachedPost) {
      return cachedPost;
    }

    const post = await Post.findByPk(postId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture']
        },
        {
          model: Post,
          as: 'originalPost',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'fullName', 'profilePicture']
          }]
        }
      ]
    });

    if (!post) {
      return null;
    }

    // Get engagement counts
    const [likesCount, commentsCount, sharesCount] = await Promise.all([
      Like.count({ where: { postId } }),
      Comment.count({ where: { postId } }),
      Post.count({ where: { sharedPostId: postId } })
    ]);

    post.dataValues.likesCount = likesCount;
    post.dataValues.commentsCount = commentsCount;
    post.dataValues.sharesCount = sharesCount;

    // Check if user has interacted with the post
    if (userId) {
      const [isLiked, isBookmarked, isShared] = await Promise.all([
        Like.findOne({ where: { postId, userId } }),
        Bookmark.findOne({ where: { postId, userId } }),
        Post.findOne({ where: { sharedPostId: postId, userId } })
      ]);

      post.dataValues.isLiked = !!isLiked;
      post.dataValues.isBookmarked = !!isBookmarked;
      post.dataValues.isShared = !!isShared;
    }

    // Cache the result
    await cacheService.set(cacheKey, post, 300); // 5 minutes

    return post;
  }

  /**
   * Get user's feed
   */
  async getUserFeed(userId, options = {}) {
    const { page = 1, limit = 10 } = options;
    const cacheKey = `feed:${userId}:${page}:${limit}`;
    
    const cachedFeed = await cacheService.get(cacheKey);
    if (cachedFeed) {
      return cachedFeed;
    }

    // Get user's following list
    const following = await this.getFollowingIds(userId);

    // Query posts from following users and public posts
    const where = {
      [Op.or]: [
        { userId: { [Op.in]: following } },
        { privacy: 'public' }
      ],
      isPublished: true,
      isDeleted: false
    };

    const offset = (page - 1) * limit;
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture']
      }],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit)
    });

    // Enrich posts with engagement data
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const enriched = await this.enrichPost(post, userId);
        return enriched;
      })
    );

    const result = {
      posts: enrichedPosts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    // Cache the result
    await cacheService.set(cacheKey, result, 60); // 1 minute

    return result;
  }

  /**
   * Get user's posts
   */
  async getUserPosts(userId, options = {}) {
    const { page = 1, limit = 10, privacy } = options;
    const cacheKey = `user:${userId}:posts:${page}:${limit}:${privacy || 'all'}`;
    
    const cachedPosts = await cacheService.get(cacheKey);
    if (cachedPosts) {
      return cachedPosts;
    }

    const where = {
      userId,
      isPublished: true,
      isDeleted: false
    };

    if (privacy) {
      where.privacy = privacy;
    }

    const offset = (page - 1) * limit;
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture']
      }],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit)
    });

    // Enrich posts
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const enriched = await this.enrichPost(post, userId);
        return enriched;
      })
    );

    const result = {
      posts: enrichedPosts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    await cacheService.set(cacheKey, result, 300); // 5 minutes

    return result;
  }

  /**
   * Update post
   */
  async updatePost(postId, userId, updateData) {
    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new Error('Post not found');
    }

    if (post.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Mark as edited
    updateData.isEdited = true;
    updateData.editedAt = new Date();

    Object.assign(post, updateData);
    await post.save();

    // Update hashtags if content changed
    if (updateData.content) {
      const hashtags = this.extractHashtags(updateData.content);
      await this.processHashtags(postId, hashtags);
    }

    // Invalidate cache
    await cacheService.invalidatePostCache(postId);
    await cacheService.invalidateUserFeedCache(userId);

    return post;
  }

  /**
   * Delete post (soft delete)
   */
  async deletePost(postId, userId) {
    const post = await Post.findByPk(postId);
    
    if (!post) {
      throw new Error('Post not found');
    }

    if (post.userId !== userId) {
      throw new Error('Unauthorized');
    }

    post.isDeleted = true;
    post.deletedAt = new Date();
    await post.save();

    // Invalidate cache
    await cacheService.invalidatePostCache(postId);
    await cacheService.invalidateUserFeedCache(userId);

    return post;
  }

  /**
   * Like a post
   */
  async likePost(postId, userId) {
    const existingLike = await Like.findOne({
      where: { postId, userId }
    });

    if (existingLike) {
      throw new Error('Already liked');
    }

    const like = await Like.create({
      postId,
      userId
    });

    // Increment likes count
    await Post.increment('likesCount', {
      where: { id: postId }
    });

    // Invalidate cache
    await cacheService.invalidatePostCache(postId);

    return like;
  }

  /**
   * Unlike a post
   */
  async unlikePost(postId, userId) {
    const result = await Like.destroy({
      where: { postId, userId }
    });

    if (result === 0) {
      throw new Error('Not liked');
    }

    // Decrement likes count
    await Post.decrement('likesCount', {
      where: { id: postId }
    });

    // Invalidate cache
    await cacheService.invalidatePostCache(postId);

    return true;
  }

  /**
   * Bookmark a post
   */
  async bookmarkPost(postId, userId) {
    const existingBookmark = await Bookmark.findOne({
      where: { postId, userId }
    });

    if (existingBookmark) {
      throw new Error('Already bookmarked');
    }

    const bookmark = await Bookmark.create({
      postId,
      userId
    });

    // Increment saves count
    await Post.increment('savesCount', {
      where: { id: postId }
    });

    return bookmark;
  }

  /**
   * Remove bookmark
   */
  async removeBookmark(postId, userId) {
    const result = await Bookmark.destroy({
      where: { postId, userId }
    });

    if (result === 0) {
      throw new Error('Not bookmarked');
    }

    // Decrement saves count
    await Post.decrement('savesCount', {
      where: { id: postId }
    });

    return true;
  }

  /**
   * Extract hashtags from content
   */
  extractHashtags(content) {
    const hashtagRegex = /#(\w+)/g;
    const matches = content.match(hashtagRegex);
    
    if (!matches) {
      return [];
    }

    return matches.map(tag => tag.slice(1).toLowerCase());
  }

  /**
   * Process hashtags for a post
   */
  async processHashtags(postId, hashtags) {
    if (!hashtags || hashtags.length === 0) {
      return;
    }

    const hashtagPromises = hashtags.map(async (tagName) => {
      let hashtag = await Hashtag.findOne({ where: { name: tagName } });
      
      if (!hashtag) {
        hashtag = await Hashtag.create({
          name: tagName,
          postsCount: 1
        });
      } else {
        await hashtag.increment('postsCount');
      }

      // Associate hashtag with post
      await hashtag.addPost(postId);
    });

    await Promise.all(hashtagPromises);
  }

  /**
   * Get following user IDs
   */
  async getFollowingIds(userId) {
    const cacheKey = `user:${userId}:following`;
    
    const cachedFollowing = await cacheService.get(cacheKey);
    if (cachedFollowing) {
      return cachedFollowing;
    }

    const Follow = require('../models/Follow');
    const follows = await Follow.findAll({
      where: { followerId: userId },
      attributes: ['followingId']
    });

    const followingIds = follows.map(f => f.followingId);
    
    // Cache for 5 minutes
    await cacheService.set(cacheKey, followingIds, 300);

    return followingIds;
  }

  /**
   * Enrich post with additional data
   */
  async enrichPost(post, userId) {
    const postId = post.id;

    // Get engagement counts
    const [likesCount, commentsCount, sharesCount, isLiked, isBookmarked] = await Promise.all([
      Like.count({ where: { postId } }),
      Comment.count({ where: { postId } }),
      Post.count({ where: { sharedPostId: postId } }),
      userId ? Like.findOne({ where: { postId, userId } }) : null,
      userId ? Bookmark.findOne({ where: { postId, userId } }) : null
    ]);

    // Convert to plain object
    const enrichedPost = post.toJSON ? post.toJSON() : post;
    
    enrichedPost.likesCount = likesCount;
    enrichedPost.commentsCount = commentsCount;
    enrichedPost.sharesCount = sharesCount;
    enrichedPost.isLiked = !!isLiked;
    enrichedPost.isBookmarked = !!isBookmarked;

    return enrichedPost;
  }

  /**
   * Get trending posts
   */
  async getTrendingPosts(options = {}) {
    const { limit = 10, timeRange = 'week' } = options;
    const cacheKey = `trending:posts:${timeRange}:${limit}`;

    const cachedTrending = await cacheService.get(cacheKey);
    if (cachedTrending) {
      return cachedTrending;
    }

    let dateFilter;
    const now = new Date();

    switch (timeRange) {
      case 'day':
        dateFilter = new Date(now.setDate(now.getDate() - 1));
        break;
      case 'week':
        dateFilter = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        dateFilter = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        dateFilter = new Date(now.setDate(now.getDate() - 7));
    }

    const posts = await Post.findAll({
      where: {
        createdAt: { [Op.gte]: dateFilter },
        isPublished: true,
        isDeleted: false,
        privacy: 'public'
      },
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture']
      }],
      order: [
        ['likesCount', 'DESC'],
        ['commentsCount', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: parseInt(limit)
    });

    // Enrich posts
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const enriched = await this.enrichPost(post);
        return enriched;
      })
    );

    // Cache for 15 minutes
    await cacheService.set(cacheKey, enrichedPosts, 900);

    return enrichedPosts;
  }

  /**
   * Search posts
   */
  async searchPosts(query, options = {}) {
    const { page = 1, limit = 10 } = options;

    if (process.env.ENABLE_SEARCH === 'true') {
      return await searchService.searchPosts(query, options);
    }

    // Fallback to database search
    const where = {
      [Op.or]: [
        { content: { [Op.iLike]: `%${query}%` } },
        { '$author.username$': { [Op.iLike]: `%${query}%` } }
      ],
      isPublished: true,
      isDeleted: false,
      privacy: 'public'
    };

    const offset = (page - 1) * limit;

    const { count, rows: posts } = await Post.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'fullName', 'profilePicture']
      }],
      offset,
      limit: parseInt(limit),
      order: [['createdAt', 'DESC']]
    });

    // Enrich posts
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const enriched = await this.enrichPost(post);
        return enriched;
      })
    );

    return {
      posts: enrichedPosts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };
  }
}

module.exports = new PostService();