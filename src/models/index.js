const sequelize = require('../config/database');
const User = require('./User');
const Post = require('./Post');
const Comment = require('./Comment');
const Like = require('./Like');
const Follow = require('./Follow');
const Message = require('./Message');
const Conversation = require('./Conversation');
const ConversationMember = require('./ConversationMember');
const Notification = require('./Notification');
const Story = require('./Story');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const Event = require('./Event');
const Reaction = require('./Reaction');
const Share = require('./Share');
const Bookmark = require('./Bookmark');
const Report = require('./Report');
const View = require('./View');
const Hashtag = require('./Hashtag');
const PostHashtag = require('./PostHashtag');

// Define associations
const defineAssociations = () => {
  // User associations
  User.hasMany(Post, { foreignKey: 'userId', as: 'posts' });
  User.hasMany(Comment, { foreignKey: 'userId', as: 'comments' });
  User.hasMany(Like, { foreignKey: 'userId', as: 'likes' });
  User.hasMany(Share, { foreignKey: 'userId', as: 'shares' });
  User.hasMany(Bookmark, { foreignKey: 'userId', as: 'bookmarks' });
  User.hasMany(Report, { foreignKey: 'userId', as: 'reports' });
  User.hasMany(View, { foreignKey: 'userId', as: 'views' });
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
  User.hasMany(Story, { foreignKey: 'userId', as: 'stories' });
  User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });
  User.hasMany(Group, { foreignKey: 'createdBy', as: 'createdGroups' });
  User.hasMany(Event, { foreignKey: 'createdBy', as: 'createdEvents' });
  
  // Follow associations
  User.belongsToMany(User, {
    through: Follow,
    as: 'followers',
    foreignKey: 'followingId',
    otherKey: 'followerId',
  });
  
  User.belongsToMany(User, {
    through: Follow,
    as: 'following',
    foreignKey: 'followerId',
    otherKey: 'followingId',
  });

  // Post associations
  Post.belongsTo(User, { foreignKey: 'userId', as: 'author' });
  Post.hasMany(Comment, { foreignKey: 'postId', as: 'comments' });
  Post.hasMany(Like, { foreignKey: 'postId', as: 'likes' });
  Post.hasMany(Share, { foreignKey: 'postId', as: 'shares' });
  Post.hasMany(Bookmark, { foreignKey: 'postId', as: 'bookmarks' });
  Post.hasMany(Report, { foreignKey: 'postId', as: 'reports' });
  Post.hasMany(View, { foreignKey: 'postId', as: 'views' });
  Post.belongsTo(Post, { foreignKey: 'sharedPostId', as: 'originalPost' });
  
  // Comment associations
  Comment.belongsTo(User, { foreignKey: 'userId', as: 'author' });
  Comment.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
  Comment.hasMany(Like, { foreignKey: 'commentId', as: 'likes' });
  Comment.belongsTo(Comment, { foreignKey: 'parentId', as: 'parent' });
  Comment.hasMany(Comment, { foreignKey: 'parentId', as: 'replies' });

  // Like associations
  Like.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Like.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
  Like.belongsTo(Comment, { foreignKey: 'commentId', as: 'comment' });

  // Message associations
  Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
  Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });

  // Conversation associations
  Conversation.belongsToMany(User, {
    through: ConversationMember,
    as: 'members',
    foreignKey: 'conversationId',
    otherKey: 'userId',
  });
  
  Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });
  Conversation.belongsTo(Message, { foreignKey: 'lastMessageId', as: 'lastMessage' });
  Conversation.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

  // ConversationMember associations
  ConversationMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  ConversationMember.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });

  // Notification associations
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Notification.belongsTo(User, { foreignKey: 'fromUserId', as: 'fromUser' });

  // Story associations
  Story.belongsTo(User, { foreignKey: 'userId', as: 'author' });
  Story.hasMany(View, { foreignKey: 'storyId', as: 'views' });

  // Group associations
  Group.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  Group.belongsToMany(User, {
    through: GroupMember,
    as: 'members',
    foreignKey: 'groupId',
    otherKey: 'userId',
  });
  
  Group.hasMany(Post, { foreignKey: 'groupId', as: 'posts' });

  // GroupMember associations
  GroupMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  GroupMember.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });

  // Event associations
  Event.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  Event.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
  
  // Hashtag associations
  Hashtag.belongsToMany(Post, {
    through: PostHashtag,
    as: 'posts',
    foreignKey: 'hashtagId',
    otherKey: 'postId',
  });

  // PostHashtag associations
  PostHashtag.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
  PostHashtag.belongsTo(Hashtag, { foreignKey: 'hashtagId', as: 'hashtag' });

  // View associations
  View.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  View.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
  View.belongsTo(Story, { foreignKey: 'storyId', as: 'story' });
};

// Initialize associations
defineAssociations();

module.exports = {
  sequelize,
  User,
  Post,
  Comment,
  Like,
  Follow,
  Message,
  Conversation,
  ConversationMember,
  Notification,
  Story,
  Group,
  GroupMember,
  Event,
  Reaction,
  Share,
  Bookmark,
  Report,
  View,
  Hashtag,
  PostHashtag,
};