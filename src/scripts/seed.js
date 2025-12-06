const { Sequelize } = require('sequelize');
const config = require('./config');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Like = require('../models/Like');
const Follow = require('../models/Follow');
const Group = require('../models/Group');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const { faker } = require('@faker-js/faker');

/**
 * Database seeder for development and testing
 */
class DatabaseSeeder {
  constructor() {
    this.users = [];
    this.posts = [];
    this.comments = [];
    this.likes = [];
    this.follows = [];
    this.groups = [];
    this.events = [];
    this.notifications = [];
    this.messages = [];
  }

  /**
   * Run the seeder
   */
  async run(options = {}) {
    const {
      clear = false,
      count = {
        users: 50,
        posts: 200,
        comments: 500,
        likes: 1000,
        follows: 300,
        groups: 10,
        events: 20,
        notifications: 200,
        messages: 100,
      },
      silent = false,
    } = options;

    if (!silent) {
      logger.info('Starting database seeding...');
      console.log('='.repeat(50));
      console.log('🌱 DATABASE SEEDER');
      console.log('='.repeat(50));
    }

    try {
      // Clear existing data if requested
      if (clear) {
        await this.clearDatabase();
        if (!silent) console.log('✅ Database cleared');
      }

      // Seed data
      await this.seedUsers(count.users);
      if (!silent) console.log(`✅ ${count.users} users created`);

      await this.seedFollows(count.follows);
      if (!silent) console.log(`✅ ${count.follows} follows created`);

      await this.seedGroups(count.groups);
      if (!silent) console.log(`✅ ${count.groups} groups created`);

      await this.seedPosts(count.posts);
      if (!silent) console.log(`✅ ${count.posts} posts created`);

      await this.seedComments(count.comments);
      if (!silent) console.log(`✅ ${count.comments} comments created`);

      await this.seedLikes(count.likes);
      if (!silent) console.log(`✅ ${count.likes} likes created`);

      await this.seedEvents(count.events);
      if (!silent) console.log(`✅ ${count.events} events created`);

      await this.seedNotifications(count.notifications);
      if (!silent) console.log(`✅ ${count.notifications} notifications created`);

      await this.seedMessages(count.messages);
      if (!silent) console.log(`✅ ${count.messages} messages created`);

      // Create test users
      await this.createTestUsers();
      if (!silent) console.log('✅ Test users created');

      if (!silent) {
        console.log('='.repeat(50));
        console.log('🎉 SEEDING COMPLETE!');
        console.log('='.repeat(50));
        
        this.printStatistics();
        
        console.log('\n🔑 TEST ACCOUNTS:');
        console.log('Admin: admin@example.com / admin123');
        console.log('User: user@example.com / user123');
        console.log('Moderator: mod@example.com / mod123');
      }

      logger.info('Database seeding completed successfully');
    } catch (error) {
      logger.error('Database seeding failed:', error);
      if (!silent) {
        console.error('❌ Seeding failed:', error.message);
      }
      throw error;
    }
  }

  /**
   * Clear all database tables
   */
  async clearDatabase() {
    const tables = [
      'Messages',
      'Notifications',
      'EventAttendees',
      'Events',
      'GroupMembers',
      'Groups',
      'Likes',
      'Comments',
      'Posts',
      'Follows',
      'Users',
    ];

    // Disable foreign key checks
    await User.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of tables) {
      try {
        await User.sequelize.query(`TRUNCATE TABLE "${table}" CASCADE`);
      } catch (error) {
        // Table might not exist, continue
      }
    }

    // Re-enable foreign key checks
    await User.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  /**
   * Seed users
   */
  async seedUsers(count) {
    const users = [];

    // Create admin user
    const admin = await User.create({
      username: 'admin',
      email: 'admin@example.com',
      password: 'admin123',
      fullName: 'Admin User',
      role: 'admin',
      isEmailVerified: true,
      profilePicture: faker.image.avatar(),
      bio: faker.lorem.sentence(),
      location: faker.location.city(),
      website: faker.internet.url(),
    });

    users.push(admin);

    // Create moderator user
    const moderator = await User.create({
      username: 'moderator',
      email: 'mod@example.com',
      password: 'mod123',
      fullName: 'Moderator User',
      role: 'moderator',
      isEmailVerified: true,
      profilePicture: faker.image.avatar(),
      bio: faker.lorem.sentence(),
      location: faker.location.city(),
    });

    users.push(moderator);

    // Create regular test user
    const testUser = await User.create({
      username: 'testuser',
      email: 'user@example.com',
      password: 'user123',
      fullName: 'Test User',
      role: 'user',
      isEmailVerified: true,
      profilePicture: faker.image.avatar(),
      bio: faker.lorem.sentence(),
      location: faker.location.city(),
    });

    users.push(testUser);

    // Create fake users
    for (let i = 0; i < count - 3; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const username = faker.internet
        .userName({ firstName, lastName })
        .toLowerCase()
        .replace(/[^a-z0-9_.]/g, '_')
        .substring(0, 20);

      const user = await User.create({
        username: username + i,
        email: faker.internet.email({ firstName, lastName }),
        password: 'password123',
        fullName: `${firstName} ${lastName}`,
        role: 'user',
        isEmailVerified: faker.datatype.boolean(0.8),
        profilePicture: faker.image.avatar(),
        bio: faker.lorem.sentence(),
        location: faker.location.city(),
        website: faker.datatype.boolean(0.3) ? faker.internet.url() : null,
        lastLogin: faker.date.recent({ days: 30 }),
        createdAt: faker.date.past({ years: 1 }),
      });

      users.push(user);
    }

    this.users = users;
    return users;
  }

  /**
   * Seed follows
   */
  async seedFollows(count) {
    const follows = [];

    for (let i = 0; i < count; i++) {
      const follower = faker.helpers.arrayElement(this.users);
      const following = faker.helpers.arrayElement(
        this.users.filter(user => user.id !== follower.id)
      );

      // Check if follow already exists
      const existingFollow = await Follow.findOne({
        where: {
          followerId: follower.id,
          followingId: following.id,
        },
      });

      if (!existingFollow) {
        const follow = await Follow.create({
          followerId: follower.id,
          followingId: following.id,
          createdAt: faker.date.recent({ days: 90 }),
        });

        follows.push(follow);
      }
    }

    this.follows = follows;
    return follows;
  }

  /**
   * Seed groups
   */
  async seedGroups(count) {
    const groups = [];

    for (let i = 0; i < count; i++) {
      const owner = faker.helpers.arrayElement(this.users);
      const name = faker.company.name();
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');

      const group = await Group.create({
        name: name + ' Group',
        slug: slug + '-' + i,
        description: faker.lorem.paragraph(),
        ownerId: owner.id,
        privacy: faker.helpers.arrayElement(['public', 'private', 'secret']),
        coverImage: faker.image.urlLoremFlickr({ category: 'nature' }),
        avatar: faker.image.avatar(),
        category: faker.helpers.arrayElement([
          'Technology',
          'Business',
          'Entertainment',
          'Sports',
          'Education',
          'Health',
          'Food',
          'Travel',
          'Art',
          'Music',
        ]),
        tags: faker.helpers.arrayElements(
          ['tech', 'business', 'social', 'network', 'community', 'learning'],
          { min: 1, max: 5 }
        ),
        rules: faker.lorem.paragraphs(2),
        location: faker.location.city(),
        membersCount: 0,
        postsCount: 0,
        eventsCount: 0,
        isActive: true,
        isVerified: faker.datatype.boolean(0.2),
        createdAt: faker.date.past({ years: 1 }),
      });

      // Add owner as admin member
      await group.addMember(owner.id, { through: { role: 'admin' } });
      await group.increment('membersCount');

      // Add random members
      const memberCount = faker.number.int({ min: 5, max: 50 });
      const potentialMembers = this.users.filter(user => user.id !== owner.id);
      const selectedMembers = faker.helpers.arrayElements(
        potentialMembers,
        Math.min(memberCount, potentialMembers.length)
      );

      for (const member of selectedMembers) {
        await group.addMember(member.id, {
          through: {
            role: faker.helpers.arrayElement(['member', 'moderator']),
            joinedAt: faker.date.recent({ days: 90 }),
          },
        });
      }

      await group.increment('membersCount', { by: selectedMembers.length });
      groups.push(group);
    }

    this.groups = groups;
    return groups;
  }

  /**
   * Seed posts
   */
  async seedPosts(count) {
    const posts = [];
    const postTypes = ['text', 'image', 'video', 'poll', 'link', 'shared'];

    for (let i = 0; i < count; i++) {
      const author = faker.helpers.arrayElement(this.users);
      const postType = faker.helpers.arrayElement(postTypes);

      const postData = {
        userId: author.id,
        type: postType,
        content: faker.lorem.paragraphs(faker.number.int({ min: 1, max: 3 })),
        privacy: faker.helpers.arrayElement(['public', 'friends', 'private']),
        location: faker.datatype.boolean(0.3) ? faker.location.city() : null,
        tags: faker.helpers.arrayElements(
          ['life', 'love', 'happy', 'travel', 'food', 'tech', 'music', 'art'],
          { min: 0, max: 5 }
        ),
        mentions: faker.helpers
          .arrayElements(this.users, { min: 0, max: 3 })
          .map(user => user.id),
        hashtags: faker.helpers.arrayElements(
          ['photography', 'nature', 'sunset', 'beach', 'mountains', 'citylife'],
          { min: 0, max: 5 }
        ),
        viewsCount: faker.number.int({ min: 0, max: 10000 }),
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        reachCount: faker.number.int({ min: 100, max: 50000 }),
        isPublished: true,
        createdAt: faker.date.recent({ days: 90 }),
      };

      // Add type-specific data
      switch (postType) {
        case 'image':
          postData.mediaUrls = Array.from(
            { length: faker.number.int({ min: 1, max: 4 }) },
            () => faker.image.urlLoremFlickr({ category: 'nature' })
          );
          postData.thumbnailUrl = faker.image.urlLoremFlickr({
            category: 'nature',
          });
          break;

        case 'video':
          postData.mediaUrls = [faker.internet.url() + '/video.mp4'];
          postData.thumbnailUrl = faker.image.urlLoremFlickr({
            category: 'nature',
          });
          postData.videoDuration = faker.number.int({ min: 30, max: 600 });
          postData.aspectRatio = faker.number.float({ min: 0.5, max: 2.0 });
          break;

        case 'poll':
          postData.pollQuestion = faker.lorem.sentence();
          postData.pollOptions = Array.from(
            { length: faker.number.int({ min: 2, max: 5 }) },
            (_, index) => ({
              id: index,
              text: faker.lorem.words(3),
              votes: 0,
            })
          );
          postData.pollEndsAt = faker.date.future({ years: 0.1 });
          break;

        case 'link':
          postData.linkPreview = {
            url: faker.internet.url(),
            title: faker.lorem.sentence(),
            description: faker.lorem.sentence(),
            image: faker.image.urlLoremFlickr({ category: 'nature' }),
            domain: faker.internet.domainName(),
          };
          break;

        case 'shared':
          if (posts.length > 0) {
            const sharedPost = faker.helpers.arrayElement(posts);
            postData.sharedPostId = sharedPost.id;
            postData.content = faker.lorem.sentence();
          } else {
            postData.type = 'text';
          }
          break;
      }

      // Randomly assign to group
      if (this.groups.length > 0 && faker.datatype.boolean(0.2)) {
        const group = faker.helpers.arrayElement(this.groups);
        postData.groupId = group.id;
        postData.privacy = 'group';
      }

      const post = await Post.create(postData);
      posts.push(post);
    }

    this.posts = posts;
    return posts;
  }

  /**
   * Seed comments
   */
  async seedComments(count) {
    const comments = [];

    for (let i = 0; i < count; i++) {
      const author = faker.helpers.arrayElement(this.users);
      const post = faker.helpers.arrayElement(this.posts);

      const comment = await Comment.create({
        postId: post.id,
        userId: author.id,
        content: faker.lorem.paragraph(),
        likesCount: 0,
        isEdited: faker.datatype.boolean(0.1),
        mentions: faker.helpers
          .arrayElements(this.users, { min: 0, max: 2 })
          .map(user => user.id),
        createdAt: faker.date.recent({ days: 90 }),
      });

      // Update post comments count
      await post.increment('commentsCount');

      comments.push(comment);
    }

    this.comments = comments;
    return comments;
  }

  /**
   * Seed likes
   */
  async seedLikes(count) {
    const likes = [];

    for (let i = 0; i < count; i++) {
      const user = faker.helpers.arrayElement(this.users);
      const post = faker.helpers.arrayElement(this.posts);

      // Check if already liked
      const existingLike = await Like.findOne({
        where: {
          userId: user.id,
          postId: post.id,
        },
      });

      if (!existingLike) {
        const like = await Like.create({
          postId: post.id,
          userId: user.id,
          createdAt: faker.date.recent({ days: 90 }),
        });

        // Update post likes count
        await post.increment('likesCount');

        likes.push(like);
      }
    }

    this.likes = likes;
    return likes;
  }

  /**
   * Seed events
   */
  async seedEvents(count) {
    const events = [];

    for (let i = 0; i < count; i++) {
      const organizer = faker.helpers.arrayElement(this.users);
      const startDate = faker.date.future({ years: 0.5 });
      const endDate = new Date(
        startDate.getTime() +
          faker.number.int({ min: 1, max: 24 }) * 60 * 60 * 1000
      );

      const event = await Event.create({
        title: faker.lorem.words(3),
        description: faker.lorem.paragraphs(2),
        organizerId: organizer.id,
        startDate,
        endDate,
        location: faker.location.city(),
        isOnline: faker.datatype.boolean(0.3),
        onlineLink: faker.datatype.boolean(0.3) ? faker.internet.url() : null,
        maxAttendees: faker.number.int({ min: 10, max: 1000 }),
        attendeesCount: 0,
        category: faker.helpers.arrayElement([
          'Social',
          'Business',
          'Education',
          'Entertainment',
          'Sports',
          'Technology',
          'Art',
          'Music',
          'Food',
          'Charity',
        ]),
        tags: faker.helpers.arrayElements(
          ['networking', 'conference', 'workshop', 'party', 'meetup'],
          { min: 0, max: 5 }
        ),
        coverImage: faker.image.urlLoremFlickr({ category: 'event' }),
        privacy: faker.helpers.arrayElement(['public', 'private']),
        viewsCount: faker.number.int({ min: 0, max: 5000 }),
        isPublished: true,
        createdAt: faker.date.recent({ days: 60 }),
      });

      // Add organizer as attendee
      await event.addAttendee(organizer.id);
      await event.increment('attendeesCount');

      // Add random attendees
      const attendeeCount = faker.number.int({ min: 0, max: 50 });
      const potentialAttendees = this.users.filter(
        user => user.id !== organizer.id
      );
      const selectedAttendees = faker.helpers.arrayElements(
        potentialAttendees,
        Math.min(attendeeCount, potentialAttendees.length)
      );

      for (const attendee of selectedAttendees) {
        await event.addAttendee(attendee.id);
      }

      await event.increment('attendeesCount', { by: selectedAttendees.length });
      events.push(event);
    }

    this.events = events;
    return events;
  }

  /**
   * Seed notifications
   */
  async seedNotifications(count) {
    const notifications = [];
    const notificationTypes = [
      'like',
      'comment',
      'follow',
      'mention',
      'share',
      'message',
      'event',
      'group',
      'friend_request',
      'system',
    ];

    for (let i = 0; i < count; i++) {
      const user = faker.helpers.arrayElement(this.users);
      const type = faker.helpers.arrayElement(notificationTypes);

      const notificationData = {
        userId: user.id,
        type,
        data: {},
        isRead: faker.datatype.boolean(0.7),
        createdAt: faker.date.recent({ days: 30 }),
      };

      // Add type-specific data
      switch (type) {
        case 'like':
          const likePost = faker.helpers.arrayElement(this.posts);
          const liker = faker.helpers.arrayElement(this.users);
          notificationData.data = {
            postId: likePost.id,
            userId: liker.id,
            userName: liker.username,
            userAvatar: liker.profilePicture,
          };
          break;

        case 'comment':
          const commentPost = faker.helpers.arrayElement(this.posts);
          const commenter = faker.helpers.arrayElement(this.users);
          notificationData.data = {
            postId: commentPost.id,
            commentId: faker.string.uuid(),
            userId: commenter.id,
            userName: commenter.username,
            userAvatar: commenter.profilePicture,
            preview: faker.lorem.words(5),
          };
          break;

        case 'follow':
          const follower = faker.helpers.arrayElement(this.users);
          notificationData.data = {
            userId: follower.id,
            userName: follower.username,
            userAvatar: follower.profilePicture,
          };
          break;

        case 'mention':
          const mentionPost = faker.helpers.arrayElement(this.posts);
          const mentioner = faker.helpers.arrayElement(this.users);
          notificationData.data = {
            postId: mentionPost.id,
            userId: mentioner.id,
            userName: mentioner.username,
            userAvatar: mentioner.profilePicture,
          };
          break;

        case 'event':
          const event = faker.helpers.arrayElement(this.events);
          notificationData.data = {
            eventId: event.id,
            eventTitle: event.title,
            notificationType: faker.helpers.arrayElement([
              'reminder',
              'update',
              'invitation',
            ]),
          };
          break;
      }

      const notification = await Notification.create(notificationData);
      notifications.push(notification);
    }

    this.notifications = notifications;
    return notifications;
  }

  /**
   * Seed messages
   */
  async seedMessages(count) {
    const messages = [];

    // Create some conversations first
    const conversations = [];
    for (let i = 0; i < 20; i++) {
      const user1 = faker.helpers.arrayElement(this.users);
      const user2 = faker.helpers.arrayElement(
        this.users.filter(user => user.id !== user1.id)
      );

      const conversation = await Message.sequelize.models.Conversation.create({
        isGroup: false,
        lastMessageAt: faker.date.recent({ days: 7 }),
        createdAt: faker.date.past({ years: 0.5 }),
      });

      await conversation.addUser(user1);
      await conversation.addUser(user2);

      conversations.push(conversation);
    }

    // Create group conversations
    for (let i = 0; i < 5; i++) {
      const participants = faker.helpers.arrayElements(this.users, {
        min: 3,
        max: 10,
      });

      const conversation = await Message.sequelize.models.Conversation.create({
        isGroup: true,
        name: faker.company.name() + ' Chat',
        avatar: faker.image.avatar(),
        lastMessageAt: faker.date.recent({ days: 7 }),
        createdAt: faker.date.past({ years: 0.5 }),
      });

      for (const participant of participants) {
        await conversation.addUser(participant);
      }

      conversations.push(conversation);
    }

    // Create messages
    for (let i = 0; i < count; i++) {
      const conversation = faker.helpers.arrayElement(conversations);
      const sender = faker.helpers.arrayElement(
        this.users.filter(user =>
          conversation.users?.some(u => u.id === user.id)
        )
      );

      const message = await Message.create({
        conversationId: conversation.id,
        senderId: sender.id,
        content: faker.lorem.sentence(),
        type: 'text',
        isRead: faker.datatype.boolean(0.8),
        createdAt: faker.date.recent({ days: 7 }),
      });

      // Update conversation last message
      conversation.lastMessageAt = message.createdAt;
      await conversation.save();

      messages.push(message);
    }

    this.messages = messages;
    return messages;
  }

  /**
   * Create test users with known credentials
   */
  async createTestUsers() {
    const testUsers = [
      {
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        fullName: 'Admin User',
        role: 'admin',
        isEmailVerified: true,
      },
      {
        username: 'user',
        email: 'user@example.com',
        password: 'user123',
        fullName: 'Test User',
        role: 'user',
        isEmailVerified: true,
      },
      {
        username: 'moderator',
        email: 'mod@example.com',
        password: 'mod123',
        fullName: 'Moderator User',
        role: 'moderator',
        isEmailVerified: true,
      },
    ];

    for (const userData of testUsers) {
      const existingUser = await User.findOne({
        where: { email: userData.email },
      });

      if (!existingUser) {
        await User.create(userData);
      }
    }
  }

  /**
   * Print seeding statistics
   */
  printStatistics() {
    console.log('\n📊 SEEDING STATISTICS:');
    console.log('Users:', this.users.length);
    console.log('Posts:', this.posts.length);
    console.log('Comments:', this.comments.length);
    console.log('Likes:', this.likes.length);
    console.log('Follows:', this.follows.length);
    console.log('Groups:', this.groups.length);
    console.log('Events:', this.events.length);
    console.log('Notifications:', this.notifications.length);
    console.log('Messages:', this.messages.length);

    // Calculate some metrics
    const avgPostsPerUser = (this.posts.length / this.users.length).toFixed(1);
    const avgLikesPerPost = (this.likes.length / this.posts.length).toFixed(1);
    const avgCommentsPerPost = (
      this.comments.length / this.posts.length
    ).toFixed(1);

    console.log('\n📈 METRICS:');
    console.log('Avg posts per user:', avgPostsPerUser);
    console.log('Avg likes per post:', avgLikesPerPost);
    console.log('Avg comments per post:', avgCommentsPerPost);

    // Post type distribution
    const postTypes = {};
    this.posts.forEach(post => {
      postTypes[post.type] = (postTypes[post.type] || 0) + 1;
    });

    console.log('\n📝 POST TYPE DISTRIBUTION:');
    for (const [type, count] of Object.entries(postTypes)) {
      const percentage = ((count / this.posts.length) * 100).toFixed(1);
      console.log(`${type}: ${count} (${percentage}%)`);
    }
  }
}

/**
 * Command line interface
 */
if (require.main === module) {
  const yargs = require('yargs/yargs');
  const { hideBin } = require('yargs/helpers');

  const argv = yargs(hideBin(process.argv))
    .option('clear', {
      type: 'boolean',
      default: false,
      description: 'Clear database before seeding',
    })
    .option('users', {
      type: 'number',
      default: 50,
      description: 'Number of users to create',
    })
    .option('posts', {
      type: 'number',
      default: 200,
      description: 'Number of posts to create',
    })
    .option('comments', {
      type: 'number',
      default: 500,
      description: 'Number of comments to create',
    })
    .option('likes', {
      type: 'number',
      default: 1000,
      description: 'Number of likes to create',
    })
    .option('follows', {
      type: 'number',
      default: 300,
      description: 'Number of follows to create',
    })
    .option('groups', {
      type: 'number',
      default: 10,
      description: 'Number of groups to create',
    })
    .option('events', {
      type: 'number',
      default: 20,
      description: 'Number of events to create',
    })
    .option('notifications', {
      type: 'number',
      default: 200,
      description: 'Number of notifications to create',
    })
    .option('messages', {
      type: 'number',
      default: 100,
      description: 'Number of messages to create',
    })
    .option('silent', {
      type: 'boolean',
      default: false,
      description: 'Run silently without output',
    })
    .help()
    .alias('help', 'h')
    .argv;

  const seeder = new DatabaseSeeder();
  seeder
    .run({
      clear: argv.clear,
      count: {
        users: argv.users,
        posts: argv.posts,
        comments: argv.comments,
        likes: argv.likes,
        follows: argv.follows,
        groups: argv.groups,
        events: argv.events,
        notifications: argv.notifications,
        messages: argv.messages,
      },
      silent: argv.silent,
    })
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseSeeder;