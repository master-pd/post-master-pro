const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Post = require('../models/Post');
const cacheService = require('./cache.service');

class UserService {
  /**
   * Create a new user
   */
  async createUser(userData) {
    const user = await User.create(userData);
    return user;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    return await User.findOne({ where: { email } });
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username) {
    return await User.findOne({ where: { username } });
  }

  /**
   * Find user by ID
   */
  async findUserById(userId, options = {}) {
    const { includeStats = false } = options;
    const cacheKey = `user:${userId}:${includeStats}`;

    const cachedUser = await cacheService.get(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return null;
    }

    if (includeStats) {
      const stats = await this.getUserStats(userId);
      user.dataValues.stats = stats;
    }

    // Cache for 5 minutes
    await cacheService.set(cacheKey, user, 300);

    return user;
  }

  /**
   * Update user profile
   */
  async updateUser(userId, updateData) {
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent updating certain fields
    delete updateData.password;
    delete updateData.email;
    delete updateData.role;

    Object.assign(user, updateData);
    await user.save();

    // Invalidate cache
    await cacheService.invalidateUserCache(userId);

    return user;
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return true;
  }

  /**
   * Follow a user
   */
  async followUser(followerId, followingId) {
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      where: { followerId, followingId }
    });

    if (existingFollow) {
      throw new Error('Already following');
    }

    // Check if user exists
    const followingUser = await User.findByPk(followingId);
    if (!followingUser) {
      throw new Error('User not found');
    }

    const follow = await Follow.create({
      followerId,
      followingId
    });

    // Update follower counts
    await Promise.all([
      User.increment('followingCount', { where: { id: followerId } }),
      User.increment('followersCount', { where: { id: followingId } })
    ]);

    // Invalidate cache
    await cacheService.invalidateUserCache(followerId);
    await cacheService.invalidateUserCache(followingId);
    await cacheService.invalidateCache(`user:${followerId}:following`);
    await cacheService.invalidateCache(`user:${followingId}:followers`);

    return follow;
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId, followingId) {
    const result = await Follow.destroy({
      where: { followerId, followingId }
    });

    if (result === 0) {
      throw new Error('Not following');
    }

    // Update follower counts
    await Promise.all([
      User.decrement('followingCount', { where: { id: followerId } }),
      User.decrement('followersCount', { where: { id: followingId } })
    ]);

    // Invalidate cache
    await cacheService.invalidateUserCache(followerId);
    await cacheService.invalidateUserCache(followingId);
    await cacheService.invalidateCache(`user:${followerId}:following`);
    await cacheService.invalidateCache(`user:${followingId}:followers`);

    return true;
  }

  /**
   * Get user's followers
   */
  async getFollowers(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const cacheKey = `user:${userId}:followers:${page}:${limit}`;

    const cachedFollowers = await cacheService.get(cacheKey);
    if (cachedFollowers) {
      return cachedFollowers;
    }

    const offset = (page - 1) * limit;

    const { count, rows: followers } = await Follow.findAndCountAll({
      where: { followingId: userId },
      include: [{
        model: User,
        as: 'follower',
        attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio']
      }],
      offset,
      limit: parseInt(limit),
      order: [['createdAt', 'DESC']]
    });

    const result = {
      followers: followers.map(f => f.follower),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, result, 300);

    return result;
  }

  /**
   * Get user's following
   */
  async getFollowing(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const cacheKey = `user:${userId}:following:${page}:${limit}`;

    const cachedFollowing = await cacheService.get(cacheKey);
    if (cachedFollowing) {
      return cachedFollowing;
    }

    const offset = (page - 1) * limit;

    const { count, rows: following } = await Follow.findAndCountAll({
      where: { followerId: userId },
      include: [{
        model: User,
        as: 'following',
        attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio']
      }],
      offset,
      limit: parseInt(limit),
      order: [['createdAt', 'DESC']]
    });

    const result = {
      following: following.map(f => f.following),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, result, 300);

    return result;
  }

  /**
   * Check if user is following another user
   */
  async isFollowing(followerId, followingId) {
    const cacheKey = `follow:${followerId}:${followingId}`;
    
    const cachedStatus = await cacheService.get(cacheKey);
    if (cachedStatus !== undefined) {
      return cachedStatus;
    }

    const follow = await Follow.findOne({
      where: { followerId, followingId }
    });

    const isFollowing = !!follow;
    
    // Cache for 5 minutes
    await cacheService.set(cacheKey, isFollowing, 300);

    return isFollowing;
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId) {
    const cacheKey = `user:${userId}:stats`;

    const cachedStats = await cacheService.get(cacheKey);
    if (cachedStats) {
      return cachedStats;
    }

    const [
      postsCount,
      followersCount,
      followingCount,
      totalLikes,
      totalComments
    ] = await Promise.all([
      Post.count({ where: { userId, isPublished: true, isDeleted: false } }),
      Follow.count({ where: { followingId: userId } }),
      Follow.count({ where: { followerId: userId } }),
      this.getUserTotalLikes(userId),
      this.getUserTotalComments(userId)
    ]);

    const stats = {
      postsCount,
      followersCount,
      followingCount,
      totalLikes,
      totalComments,
      engagementRate: postsCount > 0 ? ((totalLikes + totalComments) / postsCount) * 100 : 0
    };

    // Cache for 10 minutes
    await cacheService.set(cacheKey, stats, 600);

    return stats;
  }

  /**
   * Get total likes on user's posts
   */
  async getUserTotalLikes(userId) {
    const posts = await Post.findAll({
      where: { userId },
      attributes: ['id']
    });

    const postIds = posts.map(post => post.id);
    
    if (postIds.length === 0) {
      return 0;
    }

    const { count } = await Like.findAndCountAll({
      where: { postId: { [Op.in]: postIds } }
    });

    return count;
  }

  /**
   * Get total comments on user's posts
   */
  async getUserTotalComments(userId) {
    const posts = await Post.findAll({
      where: { userId },
      attributes: ['id']
    });

    const postIds = posts.map(post => post.id);
    
    if (postIds.length === 0) {
      return 0;
    }

    const { count } = await Comment.findAndCountAll({
      where: { postId: { [Op.in]: postIds } }
    });

    return count;
  }

  /**
   * Search users
   */
  async searchUsers(query, options = {}) {
    const { page = 1, limit = 20, excludeId = null } = options;

    const where = {
      [Op.or]: [
        { username: { [Op.iLike]: `%${query}%` } },
        { fullName: { [Op.iLike]: `%${query}%` } },
        { email: { [Op.iLike]: `%${query}%` } }
      ],
      isActive: true
    };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password', 'refreshToken'] },
      offset,
      limit: parseInt(limit),
      order: [
        ['followersCount', 'DESC'],
        ['createdAt', 'DESC']
      ]
    });

    // Get stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const stats = await this.getUserStats(user.id);
        const userData = user.toJSON();
        userData.stats = stats;
        return userData;
      })
    );

    return {
      users: usersWithStats,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };
  }

  /**
   * Get suggested users to follow
   */
  async getSuggestedUsers(userId, limit = 10) {
    const cacheKey = `user:${userId}:suggestions:${limit}`;

    const cachedSuggestions = await cacheService.get(cacheKey);
    if (cachedSuggestions) {
      return cachedSuggestions;
    }

    // Get users that the user is already following
    const following = await Follow.findAll({
      where: { followerId: userId },
      attributes: ['followingId']
    });

    const followingIds = following.map(f => f.followingId);
    followingIds.push(userId); // Exclude self

    // Get suggested users (not already followed, with most followers)
    const suggestions = await User.findAll({
      where: {
        id: { [Op.notIn]: followingIds },
        isActive: true
      },
      attributes: { exclude: ['password', 'refreshToken'] },
      order: [['followersCount', 'DESC']],
      limit: parseInt(limit)
    });

    // Cache for 15 minutes
    await cacheService.set(cacheKey, suggestions, 900);

    return suggestions;
  }

  /**
   * Update last login
   */
  async updateLastLogin(userId) {
    await User.update(
      { lastLogin: new Date() },
      { where: { id: userId } }
    );
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId) {
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    user.isActive = false;
    await user.save();

    // Invalidate all user-related cache
    await cacheService.invalidateUserCache(userId);

    return true;
  }

  /**
   * Reactivate user account
   */
  async reactivateUser(userId) {
    const user = await User.findByPk(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    user.isActive = true;
    await user.save();

    // Invalidate cache
    await cacheService.invalidateUserCache(userId);

    return true;
  }
}

module.exports = new UserService();