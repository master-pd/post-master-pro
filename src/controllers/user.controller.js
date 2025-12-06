const { Op } = require('sequelize');
const User = require('../models/User');
const Post = require('../models/Post');
const Follow = require('../models/Follow');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const userService = require('../services/user.service');
const fileService = require('../services/file.service');
const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');

class UserController {
  // Get user profile
  getUserProfile = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    const user = await User.findByPk(userId, {
      attributes: {
        exclude: ['password', 'refreshToken', 'twoFactorSecret'],
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError(404, 'User not found');
    }

    // Get follow status
    let followStatus = null;
    if (currentUserId) {
      const follow = await Follow.findOne({
        where: {
          followerId: currentUserId,
          followingId: userId,
        },
      });
      
      if (follow) {
        followStatus = follow.status;
      }
    }

    // Get counts
    const [followersCount, followingCount, postsCount] = await Promise.all([
      Follow.count({ where: { followingId: userId, status: 'accepted' } }),
      Follow.count({ where: { followerId: userId, status: 'accepted' } }),
      Post.count({ where: { userId, isPublished: true, isDeleted: false } }),
    ]);

    const profile = {
      ...user.toJSON(),
      followersCount,
      followingCount,
      postsCount,
      followStatus,
      isFollowing: followStatus === 'accepted',
      isFollowRequested: followStatus === 'pending',
      isBlocked: followStatus === 'blocked',
    };

    new ApiResponse(res, 200, 'User profile retrieved successfully', { user: profile });
  });

  // Update user profile
  updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const updateData = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Handle profile picture upload
    if (req.file) {
      const profilePicture = await fileService.uploadProfilePicture(req.file);
      updateData.profilePicture = profilePicture;
      
      // Delete old profile picture if exists
      if (user.profilePicture) {
        await fileService.deleteFile(user.profilePicture);
      }
    }

    // Handle cover photo upload
    if (req.files?.coverPhoto) {
      const coverPhoto = await fileService.uploadCoverPhoto(req.files.coverPhoto[0]);
      updateData.coverPhoto = coverPhoto;
      
      // Delete old cover photo if exists
      if (user.coverPhoto) {
        await fileService.deleteFile(user.coverPhoto);
      }
    }

    // Update user
    await user.update(updateData);

    // Invalidate cache
    await cacheService.invalidateUserCache(userId);

    logger.info(`User profile updated: ${userId}`);

    new ApiResponse(res, 200, 'Profile updated successfully', {
      user: await this.getSafeUserData(user),
    });
  });

  // Change password
  changePassword = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate
    if (newPassword !== confirmPassword) {
      throw new ApiError(400, 'New password and confirmation do not match');
    }

    if (newPassword.length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters long');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      throw new ApiError(400, 'Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    // Invalidate all sessions
    await userService.invalidateUserSessions(userId);

    logger.info(`Password changed for user: ${userId}`);

    new ApiResponse(res, 200, 'Password changed successfully');
  });

  // Follow/Unfollow user
  toggleFollow = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (userId === currentUserId) {
      throw new ApiError(400, 'You cannot follow yourself');
    }

    const targetUser = await User.findByPk(userId);
    if (!targetUser || !targetUser.isActive) {
      throw new ApiError(404, 'User not found');
    }

    // Check existing follow
    const existingFollow = await Follow.findOne({
      where: {
        followerId: currentUserId,
        followingId: userId,
      },
    });

    let action;
    let follow;

    if (existingFollow) {
      // Unfollow or cancel follow request
      await existingFollow.destroy();
      action = 'unfollowed';
    } else {
      // Check user's privacy settings
      const isPrivate = targetUser.isPrivate || false; // Assuming isPrivate field exists
      
      if (isPrivate) {
        // Send follow request
        follow = await Follow.create({
          followerId: currentUserId,
          followingId: userId,
          status: 'pending',
        });
        action = 'requested';
        
        // Create notification
        await Notification.create({
          userId,
          fromUserId: currentUserId,
          type: 'follow',
          title: 'New Follow Request',
          body: `${req.user.username} wants to follow you`,
          data: {
            followerId: currentUserId,
            followId: follow.id,
          },
        });
      } else {
        // Follow directly
        follow = await Follow.create({
          followerId: currentUserId,
          followingId: userId,
          status: 'accepted',
        });
        action = 'followed';
        
        // Create notification
        await Notification.create({
          userId,
          fromUserId: currentUserId,
          type: 'follow',
          title: 'New Follower',
          body: `${req.user.username} started following you`,
          data: {
            followerId: currentUserId,
          },
        });
      }
    }

    // Invalidate cache
    await cacheService.invalidateUserCache(userId);
    await cacheService.invalidateUserCache(currentUserId);
    await cacheService.invalidateUserFeed(currentUserId);

    // Real-time notification
    if (action !== 'unfollowed') {
      req.io?.to(`user:${userId}`).emit('user:follow', {
        followerId: currentUserId,
        action,
        followId: follow?.id,
      });
    }

    logger.info(`User ${currentUserId} ${action} user ${userId}`);

    new ApiResponse(res, 200, `Successfully ${action} user`, {
      action,
      followStatus: follow?.status,
    });
  });

  // Accept/Reject follow request
  handleFollowRequest = asyncHandler(async (req, res) => {
    const { followId } = req.params;
    const { action } = req.body; // 'accept' or 'reject'
    const userId = req.user.id;

    const follow = await Follow.findByPk(followId);
    if (!follow || follow.followingId !== userId || follow.status !== 'pending') {
      throw new ApiError(404, 'Follow request not found');
    }

    if (action === 'accept') {
      follow.status = 'accepted';
      await follow.save();

      // Create notification
      await Notification.create({
        userId: follow.followerId,
        fromUserId: userId,
        type: 'follow',
        title: 'Follow Request Accepted',
        body: `${req.user.username} accepted your follow request`,
        data: {
          followingId: userId,
        },
      });

      // Real-time notification
      req.io?.to(`user:${follow.followerId}`).emit('follow:accepted', {
        followingId: userId,
      });
    } else if (action === 'reject') {
      await follow.destroy();
    } else {
      throw new ApiError(400, 'Invalid action');
    }

    // Invalidate cache
    await cacheService.invalidateUserCache(userId);
    await cacheService.invalidateUserCache(follow.followerId);

    logger.info(`Follow request ${followId} ${action}ed by user ${userId}`);

    new ApiResponse(res, 200, `Follow request ${action}ed successfully`);
  });

  // Get user followers
  getFollowers = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const currentUserId = req.user?.id;
    
    const offset = (page - 1) * limit;

    const user = await User.findByPk(userId);
    if (!user || !user.isActive) {
      throw new ApiError(404, 'User not found');
    }

    // Check privacy
    if (userId !== currentUserId && user.isPrivate) {
      // Check if current user follows this user
      const follow = await Follow.findOne({
        where: {
          followerId: currentUserId,
          followingId: userId,
          status: 'accepted',
        },
      });
      
      if (!follow) {
        throw new ApiError(403, 'You cannot view followers of private accounts');
      }
    }

    const { count, rows: followers } = await Follow.findAndCountAll({
      where: {
        followingId: userId,
        status: 'accepted',
      },
      include: [{
        model: User,
        as: 'follower',
        attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    // Check mutual follow status
    const enrichedFollowers = await Promise.all(
      followers.map(async (follow) => {
        const follower = follow.follower.toJSON();
        
        if (currentUserId) {
          const mutualFollow = await Follow.findOne({
            where: {
              followerId: follower.id,
              followingId: currentUserId,
              status: 'accepted',
            },
          });
          
          follower.isFollowedBack = !!mutualFollow;
          
          // Check if current user follows this follower
          const currentUserFollow = await Follow.findOne({
            where: {
              followerId: currentUserId,
              followingId: follower.id,
            },
          });
          
          follower.followStatus = currentUserFollow?.status || null;
        }
        
        return follower;
      })
    );

    new ApiResponse(res, 200, 'Followers retrieved successfully', {
      followers: enrichedFollowers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get user following
  getFollowing = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const currentUserId = req.user?.id;
    
    const offset = (page - 1) * limit;

    const user = await User.findByPk(userId);
    if (!user || !user.isActive) {
      throw new ApiError(404, 'User not found');
    }

    // Check privacy (same as getFollowers)
    if (userId !== currentUserId && user.isPrivate) {
      const follow = await Follow.findOne({
        where: {
          followerId: currentUserId,
          followingId: userId,
          status: 'accepted',
        },
      });
      
      if (!follow) {
        throw new ApiError(403, 'You cannot view following of private accounts');
      }
    }

    const { count, rows: following } = await Follow.findAndCountAll({
      where: {
        followerId: userId,
        status: 'accepted',
      },
      include: [{
        model: User,
        as: 'following',
        attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    // Check mutual follow status
    const enrichedFollowing = await Promise.all(
      following.map(async (follow) => {
        const followingUser = follow.following.toJSON();
        
        if (currentUserId) {
          const mutualFollow = await Follow.findOne({
            where: {
              followerId: followingUser.id,
              followingId: currentUserId,
              status: 'accepted',
            },
          });
          
          followingUser.isFollowedBack = !!mutualFollow;
          
          // Check if current user follows this user
          const currentUserFollow = await Follow.findOne({
            where: {
              followerId: currentUserId,
              followingId: followingUser.id,
            },
          });
          
          followingUser.followStatus = currentUserFollow?.status || null;
        }
        
        return followingUser;
      })
    );

    new ApiResponse(res, 200, 'Following retrieved successfully', {
      following: enrichedFollowing,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Search users
  searchUsers = asyncHandler(async (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;
    const currentUserId = req.user?.id;
    
    const offset = (page - 1) * limit;

    if (!q || q.trim().length < 2) {
      throw new ApiError(400, 'Search query must be at least 2 characters');
    }

    const searchQuery = `%${q.trim()}%`;
    
    const { count, rows: users } = await User.findAndCountAll({
      where: {
        [Op.or]: [
          { username: { [Op.iLike]: searchQuery } },
          { fullName: { [Op.iLike]: searchQuery } },
          { email: { [Op.iLike]: searchQuery } },
        ],
        isActive: true,
        isEmailVerified: true,
      },
      attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio'],
      order: [
        // Prioritize exact matches
        [sequelize.literal(`CASE WHEN username ILIKE '${q.trim()}' THEN 1 ELSE 2 END`), 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });

    // Add follow status for authenticated users
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const userData = user.toJSON();
        
        if (currentUserId && currentUserId !== userData.id) {
          const follow = await Follow.findOne({
            where: {
              followerId: currentUserId,
              followingId: userData.id,
            },
          });
          
          userData.followStatus = follow?.status || null;
          userData.isFollowing = follow?.status === 'accepted';
        }
        
        return userData;
      })
    );

    new ApiResponse(res, 200, 'Users found successfully', {
      users: enrichedUsers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get suggested users to follow
  getSuggestedUsers = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    // Get users not followed by current user
    const followedUsers = await Follow.findAll({
      where: { followerId: userId },
      attributes: ['followingId'],
    });

    const followedIds = followedUsers.map(f => f.followingId);
    followedIds.push(userId); // Exclude self

    // Get users with many followers (popular users)
    const suggestedUsers = await User.findAll({
      where: {
        id: { [Op.notIn]: followedIds },
        isActive: true,
        isEmailVerified: true,
      },
      attributes: [
        'id',
        'username',
        'fullName',
        'profilePicture',
        'bio',
        [
          sequelize.literal(`(
            SELECT COUNT(*) FROM "Follows" 
            WHERE "followingId" = "User".id
          )`),
          'followersCount',
        ],
      ],
      order: [
        [sequelize.literal('followersCount'), 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: parseInt(limit),
    });

    // Add mutual friends count
    const enrichedUsers = await Promise.all(
      suggestedUsers.map(async (user) => {
        const userData = user.toJSON();
        
        // Count mutual followers
        const mutualCount = await sequelize.query(`
          SELECT COUNT(*) FROM "Follows" f1
          JOIN "Follows" f2 ON f1."followingId" = f2."followerId"
          WHERE f1."followerId" = :userId
          AND f2."followingId" = :suggestedUserId
          AND f1.status = 'accepted'
          AND f2.status = 'accepted'
        `, {
          replacements: { userId, suggestedUserId: userData.id },
          type: sequelize.QueryTypes.SELECT,
        });

        userData.mutualFollowers = parseInt(mutualCount[0].count);
        return userData;
      })
    );

    new ApiResponse(res, 200, 'Suggested users retrieved successfully', {
      users: enrichedUsers,
    });
  });

  // Block/Unblock user
  toggleBlock = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (userId === currentUserId) {
      throw new ApiError(400, 'You cannot block yourself');
    }

    const targetUser = await User.findByPk(userId);
    if (!targetUser || !targetUser.isActive) {
      throw new ApiError(404, 'User not found');
    }

    // Check existing block
    const existingBlock = await Follow.findOne({
      where: {
        followerId: currentUserId,
        followingId: userId,
        status: 'blocked',
      },
    });

    let action;
    
    if (existingBlock) {
      // Unblock
      await existingBlock.destroy();
      action = 'unblocked';
    } else {
      // Block
      // First, remove any existing follow relationship
      await Follow.destroy({
        where: {
          [Op.or]: [
            { followerId: currentUserId, followingId: userId },
            { followerId: userId, followingId: currentUserId },
          ],
        },
      });

      // Create block
      await Follow.create({
        followerId: currentUserId,
        followingId: userId,
        status: 'blocked',
      });
      action = 'blocked';
    }

    // Invalidate cache
    await cacheService.invalidateUserCache(userId);
    await cacheService.invalidateUserCache(currentUserId);
    await cacheService.invalidateUserFeed(currentUserId);

    logger.info(`User ${currentUserId} ${action} user ${userId}`);

    new ApiResponse(res, 200, `User ${action} successfully`, { action });
  });

  // Get blocked users
  getBlockedUsers = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (page - 1) * limit;

    const { count, rows: blocks } = await Follow.findAndCountAll({
      where: {
        followerId: userId,
        status: 'blocked',
      },
      include: [{
        model: User,
        as: 'following',
        attributes: ['id', 'username', 'fullName', 'profilePicture'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    const blockedUsers = blocks.map(block => block.following.toJSON());

    new ApiResponse(res, 200, 'Blocked users retrieved successfully', {
      users: blockedUsers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Deactivate account
  deactivateAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { reason, password } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new ApiError(400, 'Password is incorrect');
    }

    // Deactivate account
    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivationReason = reason;
    await user.save();

    // Invalidate all sessions
    await userService.invalidateUserSessions(userId);

    logger.info(`Account deactivated: ${userId}, reason: ${reason}`);

    new ApiResponse(res, 200, 'Account deactivated successfully');
  });

  // Reactivate account
  reactivateAccount = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new ApiError(404, 'Account not found');
    }

    if (user.isActive) {
      throw new ApiError(400, 'Account is already active');
    }

    // Check if deactivation period has expired
    const deactivationPeriod = 30; // days
    const deactivationDate = new Date(user.deactivatedAt);
    const reactivationDate = new Date(deactivationDate);
    reactivationDate.setDate(reactivationDate.getDate() + deactivationPeriod);

    if (new Date() > reactivationDate) {
      throw new ApiError(400, 'Account cannot be reactivated. Please contact support.');
    }

    // Reactivate account
    user.isActive = true;
    user.deactivatedAt = null;
    user.deactivationReason = null;
    await user.save();

    logger.info(`Account reactivated: ${user.id}`);

    new ApiResponse(res, 200, 'Account reactivated successfully');
  });

  // Delete account permanently
  deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { password, confirmation } = req.body;

    if (confirmation !== 'DELETE MY ACCOUNT') {
      throw new ApiError(400, 'Confirmation text is incorrect');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new ApiError(400, 'Password is incorrect');
    }

    // Mark user as deleted (soft delete)
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    // Anonymize personal data
    user.username = `deleted_${user.id.substring(0, 8)}`;
    user.email = `deleted_${user.id}@example.com`;
    user.fullName = 'Deleted User';
    user.profilePicture = null;
    user.bio = null;
    user.phone = null;
    user.location = null;
    await user.save();

    // Invalidate all sessions
    await userService.invalidateUserSessions(userId);

    logger.warn(`Account permanently deleted: ${userId}`);

    new ApiResponse(res, 200, 'Account deleted successfully');
  });

  // Get user settings
  getSettings = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: [
        'id',
        'username',
        'email',
        'notificationSettings',
        'privacySettings',
        'securitySettings',
        'language',
        'timezone',
        'theme',
      ],
    });

    new ApiResponse(res, 200, 'Settings retrieved successfully', {
      settings: user.toJSON(),
    });
  });

  // Update user settings
  updateSettings = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { notificationSettings, privacySettings, securitySettings, language, timezone, theme } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Update settings
    if (notificationSettings) user.notificationSettings = notificationSettings;
    if (privacySettings) user.privacySettings = privacySettings;
    if (securitySettings) user.securitySettings = securitySettings;
    if (language) user.language = language;
    if (timezone) user.timezone = timezone;
    if (theme) user.theme = theme;

    await user.save();

    // Invalidate cache
    await cacheService.invalidateUserCache(userId);

    logger.info(`Settings updated for user: ${userId}`);

    new ApiResponse(res, 200, 'Settings updated successfully', {
      settings: {
        notificationSettings: user.notificationSettings,
        privacySettings: user.privacySettings,
        securitySettings: user.securitySettings,
        language: user.language,
        timezone: user.timezone,
        theme: user.theme,
      },
    });
  });

  // Helper method to get safe user data
  getSafeUserData(user) {
    const userData = user.toJSON();
    delete userData.password;
    delete userData.refreshToken;
    delete userData.twoFactorSecret;
    delete userData.passwordChangedAt;
    return userData;
  }
}

module.exports = new UserController();