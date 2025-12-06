const { Op } = require('sequelize');
const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const Post = require('../models/Post');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');

class GroupController {
  // Create group
  createGroup = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { name, description, type = 'public', category, avatar, coverPhoto, rules } = req.body;
    
    // Generate slug from name
    const slug = this.generateSlug(name);
    
    // Check if slug exists
    const existingGroup = await Group.findOne({ where: { slug } });
    if (existingGroup) {
      throw new ApiError(400, 'Group with similar name already exists');
    }
    
    // Create group
    const group = await Group.create({
      name,
      slug,
      description,
      type,
      category,
      avatar,
      coverPhoto,
      rules,
      createdBy: userId,
    });
    
    // Add creator as admin
    await GroupMember.create({
      groupId: group.id,
      userId,
      role: 'admin',
      invitedBy: userId,
      invitationStatus: 'accepted',
    });
    
    logger.info(`Group created: ${group.id} by user ${userId}`);
    
    new ApiResponse(res, 201, 'Group created successfully', {
      group: await this.enrichGroupData(group, userId),
    });
  });

  // Get groups
  getGroups = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 20,
      type,
      category,
      search,
      sortBy = 'membersCount',
      sortOrder = 'DESC',
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    const where = {
      isActive: true,
      isBanned: false,
    };
    
    if (type) {
      where.type = type;
    }
    
    if (category) {
      where.category = category;
    }
    
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
      ];
    }
    
    const order = [[sortBy, sortOrder.toUpperCase()]];
    
    const { count, rows: groups } = await Group.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'creator',
        attributes: ['id', 'username', 'profilePicture'],
      }],
      order,
      limit: parseInt(limit),
      offset,
    });
    
    // Enrich with membership info
    const enrichedGroups = await Promise.all(
      groups.map(group => this.enrichGroupData(group, userId))
    );
    
    new ApiResponse(res, 200, 'Groups retrieved successfully', {
      groups: enrichedGroups,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Get single group
  getGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    const group = await Group.findByPk(groupId, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profilePicture'],
        },
        {
          model: GroupMember,
          as: 'members',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'profilePicture'],
          }],
          limit: 10,
        },
      ],
    });
    
    if (!group || !group.isActive || group.isBanned) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check access for private/secret groups
    if (!this.canViewGroup(group, userId)) {
      throw new ApiError(403, 'You do not have access to this group');
    }
    
    new ApiResponse(res, 200, 'Group retrieved successfully', {
      group: await this.enrichGroupData(group, userId),
    });
  });

  // Update group
  updateGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const updates = req.body;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check if user is admin
    const membership = await GroupMember.findOne({
      where: {
        groupId,
        userId,
        role: { [Op.in]: ['admin', 'moderator'] },
      },
    });
    
    if (!membership && group.createdBy !== userId) {
      throw new ApiError(403, 'Only admins/moderators can update group');
    }
    
    // If updating slug, check uniqueness
    if (updates.name) {
      updates.slug = this.generateSlug(updates.name);
      
      const existingGroup = await Group.findOne({
        where: {
          slug: updates.slug,
          id: { [Op.ne]: groupId },
        },
      });
      
      if (existingGroup) {
        throw new ApiError(400, 'Group with similar name already exists');
      }
    }
    
    await group.update(updates);
    
    logger.info(`Group ${groupId} updated by user ${userId}`);
    
    new ApiResponse(res, 200, 'Group updated successfully', {
      group: await this.enrichGroupData(group, userId),
    });
  });

  // Delete group
  deleteGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    const group = await Group.findByPk(groupId);
    
    if (!group) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check if user is creator or admin
    const membership = await GroupMember.findOne({
      where: {
        groupId,
        userId,
        role: 'admin',
      },
    });
    
    if (!membership && group.createdBy !== userId) {
      throw new ApiError(403, 'Only group admin can delete group');
    }
    
    // Soft delete
    group.isActive = false;
    await group.save();
    
    // Notify members
    const members = await GroupMember.findAll({
      where: { groupId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id'],
      }],
    });
    
    members.forEach(member => {
      if (member.userId !== userId) {
        notificationService.createNotification({
          userId: member.userId,
          fromUserId: userId,
          type: 'group_deleted',
          title: 'Group Deleted',
          body: `${req.user.username} deleted the group "${group.name}"`,
          data: {
            groupId,
            groupName: group.name,
          },
          priority: 'high',
        });
      }
    });
    
    logger.warn(`Group ${groupId} deleted by user ${userId}`);
    
    new ApiResponse(res, 200, 'Group deleted successfully');
  });

  // Join group
  joinGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive || group.isBanned) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check if already member
    const existingMember = await GroupMember.findOne({
      where: { groupId, userId },
    });
    
    if (existingMember) {
      if (existingMember.invitationStatus === 'pending') {
        throw new ApiError(400, 'Join request already pending');
      }
      if (existingMember.invitationStatus === 'accepted') {
        throw new ApiError(400, 'Already a member of this group');
      }
      if (existingMember.isBanned) {
        throw new ApiError(403, 'You are banned from this group');
      }
    }
    
    let member;
    
    switch (group.type) {
      case 'public':
        // Join directly
        member = await GroupMember.create({
          groupId,
          userId,
          role: 'member',
          invitationStatus: 'accepted',
        });
        
        // Update members count
        await group.incrementMembers();
        
        // Notify admins
        await this.notifyGroupAdmins(groupId, userId, 'joined');
        break;
        
      case 'private':
        // Send join request
        member = await GroupMember.create({
          groupId,
          userId,
          role: 'member',
          invitationStatus: 'pending',
        });
        
        // Notify admins for approval
        await this.notifyGroupAdmins(groupId, userId, 'join_request');
        break;
        
      case 'secret':
        throw new ApiError(403, 'Cannot join secret groups. Invitation required.');
        
      default:
        throw new ApiError(400, 'Invalid group type');
    }
    
    new ApiResponse(res, group.type === 'public' ? 200 : 201, 
      group.type === 'public' ? 'Joined group successfully' : 'Join request sent',
      {
        member,
        requiresApproval: group.type === 'private',
      }
    );
  });

  // Leave group
  leaveGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check if member
    const member = await GroupMember.findOne({
      where: { groupId, userId, invitationStatus: 'accepted' },
    });
    
    if (!member) {
      throw new ApiError(400, 'You are not a member of this group');
    }
    
    // Creator cannot leave (must delete group or transfer ownership)
    if (group.createdBy === userId) {
      throw new ApiError(400, 'Group creator cannot leave. Delete group or transfer ownership.');
    }
    
    await member.destroy();
    
    // Update members count
    await group.decrementMembers();
    
    logger.info(`User ${userId} left group ${groupId}`);
    
    new ApiResponse(res, 200, 'Left group successfully');
  });

  // Get group members
  getGroupMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20, role, search } = req.query;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive) {
      throw new ApiError(404, 'Group not found');
    }
    
    if (!this.canViewGroup(group, userId)) {
      throw new ApiError(403, 'You do not have access to this group');
    }
    
    const offset = (page - 1) * limit;
    
    const where = {
      groupId,
      invitationStatus: 'accepted',
    };
    
    if (role) {
      where.role = role;
    }
    
    if (search) {
      where['$user.username$'] = { [Op.iLike]: `%${search}%` };
    }
    
    const { count, rows: members } = await GroupMember.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'fullName', 'profilePicture', 'bio'],
      }],
      order: [
        ['role', 'ASC'], // Admins first
        ['joinedAt', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });
    
    new ApiResponse(res, 200, 'Group members retrieved successfully', {
      members: members.map(m => ({
        ...m.toJSON(),
        isCreator: group.createdBy === m.userId,
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Update member role
  updateMemberRole = asyncHandler(async (req, res) => {
    const { groupId, memberId } = req.params;
    const userId = req.user.id;
    const { role } = req.body;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check if requester is admin
    const requesterMember = await GroupMember.findOne({
      where: {
        groupId,
        userId,
        role: 'admin',
      },
    });
    
    if (!requesterMember && group.createdBy !== userId) {
      throw new ApiError(403, 'Only admins can update member roles');
    }
    
    // Find member to update
    const member = await GroupMember.findOne({
      where: {
        groupId,
        userId: memberId,
        invitationStatus: 'accepted',
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username'],
      }],
    });
    
    if (!member) {
      throw new ApiError(404, 'Member not found');
    }
    
    // Cannot modify creator
    if (group.createdBy === memberId) {
      throw new ApiError(400, 'Cannot change role of group creator');
    }
    
    member.role = role;
    await member.save();
    
    // Notify member
    await notificationService.createNotification({
      userId: memberId,
      fromUserId: userId,
      type: 'group_role_updated',
      title: 'Group Role Updated',
      body: `Your role in "${group.name}" has been changed to ${role}`,
      data: {
        groupId,
        groupName: group.name,
        newRole: role,
      },
      priority: 'medium',
    });
    
    logger.info(`Group member ${memberId} role updated to ${role} by user ${userId}`);
    
    new ApiResponse(res, 200, 'Member role updated successfully');
  });

  // Remove member
  removeMember = asyncHandler(async (req, res) => {
    const { groupId, memberId } = req.params;
    const userId = req.user.id;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check if requester has permission
    const requesterMember = await GroupMember.findOne({
      where: {
        groupId,
        userId,
        role: { [Op.in]: ['admin', 'moderator'] },
      },
    });
    
    if (!requesterMember && group.createdBy !== userId) {
      throw new ApiError(403, 'Only admins/moderators can remove members');
    }
    
    // Cannot remove self (use leave endpoint instead)
    if (memberId === userId) {
      throw new ApiError(400, 'Use leave endpoint to leave group');
    }
    
    // Cannot remove creator
    if (group.createdBy === memberId) {
      throw new ApiError(400, 'Cannot remove group creator');
    }
    
    const member = await GroupMember.findOne({
      where: {
        groupId,
        userId: memberId,
      },
    });
    
    if (!member) {
      throw new ApiError(404, 'Member not found');
    }
    
    await member.destroy();
    
    // Update members count
    await group.decrementMembers();
    
    // Notify removed member
    await notificationService.createNotification({
      userId: memberId,
      fromUserId: userId,
      type: 'group_removed',
      title: 'Removed from Group',
      body: `You have been removed from "${group.name}"`,
      data: {
        groupId,
        groupName: group.name,
      },
      priority: 'high',
    });
    
    logger.info(`Member ${memberId} removed from group ${groupId} by user ${userId}`);
    
    new ApiResponse(res, 200, 'Member removed successfully');
  });

  // Get group posts
  getGroupPosts = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive) {
      throw new ApiError(404, 'Group not found');
    }
    
    if (!this.canViewGroup(group, userId)) {
      throw new ApiError(403, 'You do not have access to this group');
    }
    
    const offset = (page - 1) * limit;
    
    const where = {
      groupId,
      isPublished: true,
      isDeleted: false,
    };
    
    if (type) {
      where.type = type;
    }
    
    const { count, rows: posts } = await Post.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'profilePicture'],
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    
    // Enrich with like/bookmark info
    const Like = require('../models/Like');
    const Bookmark = require('../models/Bookmark');
    
    const enrichedPosts = await Promise.all(
      posts.map(async (post) => {
        const postData = post.toJSON();
        
        const [isLiked, isSaved] = await Promise.all([
          Like.findOne({ where: { userId, postId: post.id } }),
          Bookmark.findOne({ where: { userId, postId: post.id } }),
        ]);
        
        postData.isLiked = !!isLiked;
        postData.isSaved = !!isSaved;
        
        return postData;
      })
    );
    
    new ApiResponse(res, 200, 'Group posts retrieved successfully', {
      posts: enrichedPosts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  });

  // Create group post
  createGroupPost = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { content, type = 'text', mediaUrls = [], privacy = 'group' } = req.body;
    
    const group = await Group.findByPk(groupId);
    
    if (!group || !group.isActive) {
      throw new ApiError(404, 'Group not found');
    }
    
    // Check if member
    const member = await GroupMember.findOne({
      where: {
        groupId,
        userId,
        invitationStatus: 'accepted',
      },
    });
    
    if (!member) {
      throw new ApiError(403, 'Only group members can post');
    }
    
    // Check if member is muted
    if (member.isMuted && member.mutedUntil > new Date()) {
      throw new ApiError(403, 'You are muted from posting in this group');
    }
    
    // Create post
    const postController = require('./post.controller');
    req.body.privacy = 'group'; // Force group privacy
    req.body.groupId = groupId;
    
    return postController.createPost(req, res);
  });

  // Helper methods
  generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
  }

  canViewGroup(group, userId) {
    if (group.type === 'public') return true;
    
    // Check if user is member
    return GroupMember.findOne({
      where: {
        groupId: group.id,
        userId,
        invitationStatus: 'accepted',
      },
    }).then(member => !!member);
  }

  async enrichGroupData(group, userId) {
    const groupData = group.toJSON();
    
    // Add membership info
    if (userId) {
      const member = await GroupMember.findOne({
        where: {
          groupId: group.id,
          userId,
        },
      });
      
      groupData.membership = member ? {
        role: member.role,
        joinedAt: member.joinedAt,
        isMuted: member.isMuted,
        isBanned: member.isBanned,
        invitationStatus: member.invitationStatus,
      } : null;
      
      groupData.isMember = !!member && member.invitationStatus === 'accepted';
      groupData.isAdmin = !!member && member.role === 'admin';
      groupData.isModerator = !!member && (member.role === 'admin' || member.role === 'moderator');
      groupData.isCreator = group.createdBy === userId;
    }
    
    return groupData;
  }

  async notifyGroupAdmins(groupId, userId, action) {
    const admins = await GroupMember.findAll({
      where: {
        groupId,
        role: 'admin',
        userId: { [Op.ne]: userId },
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id'],
      }],
    });
    
    const group = await Group.findByPk(groupId);
    const user = await User.findByPk(userId, {
      attributes: ['id', 'username'],
    });
    
    admins.forEach(admin => {
      let title, body;
      
      switch (action) {
        case 'joined':
          title = 'New Group Member';
          body = `${user.username} joined "${group.name}"`;
          break;
        case 'join_request':
          title = 'New Join Request';
          body = `${user.username} wants to join "${group.name}"`;
          break;
      }
      
      notificationService.createNotification({
        userId: admin.userId,
        fromUserId: userId,
        type: 'group_notification',
        title,
        body,
        data: {
          groupId,
          groupName: group.name,
          action,
          userId,
        },
        priority: 'medium',
      });
    });
  }
}

module.exports = new GroupController();