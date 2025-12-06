const { Op } = require('sequelize');
const elasticsearch = require('elasticsearch');
const User = require('../models/User');
const Post = require('../models/Post');
const Group = require('../models/Group');
const Event = require('../models/Event');
const cacheService = require('./cache.service');

class SearchService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    
    if (process.env.ENABLE_ELASTICSEARCH === 'true') {
      this.initElasticsearch();
    }
  }

  /**
   * Initialize Elasticsearch client
   */
  initElasticsearch() {
    try {
      this.client = new elasticsearch.Client({
        host: process.env.ELASTICSEARCH_HOST || 'http://localhost:9200',
        apiVersion: '7.10',
        log: process.env.NODE_ENV === 'development' ? 'trace' : 'error'
      });

      this.checkConnection();
    } catch (error) {
      console.error('Elasticsearch initialization failed:', error);
    }
  }

  /**
   * Check Elasticsearch connection
   */
  async checkConnection() {
    try {
      await this.client.ping();
      this.isConnected = true;
      console.log('Elasticsearch connected successfully');
    } catch (error) {
      console.error('Elasticsearch connection failed:', error);
      this.isConnected = false;
    }
  }

  /**
   * Create Elasticsearch index
   */
  async createIndex(indexName, mapping) {
    if (!this.isConnected) return;

    try {
      const exists = await this.client.indices.exists({ index: indexName });
      
      if (!exists) {
        await this.client.indices.create({
          index: indexName,
          body: mapping
        });
        console.log(`Index ${indexName} created`);
      }
    } catch (error) {
      console.error(`Error creating index ${indexName}:`, error);
    }
  }

  /**
   * Index a post in Elasticsearch
   */
  async indexPost(post) {
    if (!this.isConnected) return;

    try {
      await this.createIndex('posts', {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            content: { type: 'text', analyzer: 'standard' },
            type: { type: 'keyword' },
            privacy: { type: 'keyword' },
            hashtags: { type: 'keyword' },
            mentions: { type: 'keyword' },
            tags: { type: 'keyword' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' }
          }
        }
      });

      await this.client.index({
        index: 'posts',
        id: post.id,
        body: {
          id: post.id,
          userId: post.userId,
          content: post.content,
          type: post.type,
          privacy: post.privacy,
          hashtags: post.hashtags || [],
          mentions: post.mentions || [],
          tags: post.tags || [],
          createdAt: post.createdAt,
          updatedAt: post.updatedAt
        }
      });

      // Refresh index to make documents searchable
      await this.client.indices.refresh({ index: 'posts' });
    } catch (error) {
      console.error('Error indexing post:', error);
    }
  }

  /**
   * Index a user in Elasticsearch
   */
  async indexUser(user) {
    if (!this.isConnected) return;

    try {
      await this.createIndex('users', {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            username: { type: 'text', analyzer: 'standard' },
            email: { type: 'keyword' },
            fullName: { type: 'text', analyzer: 'standard' },
            bio: { type: 'text', analyzer: 'standard' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' }
          }
        }
      });

      await this.client.index({
        index: 'users',
        id: user.id,
        body: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName || '',
          bio: user.bio || '',
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });

      await this.client.indices.refresh({ index: 'users' });
    } catch (error) {
      console.error('Error indexing user:', error);
    }
  }

  /**
   * Search posts
   */
  async searchPosts(query, options = {}) {
    const { page = 1, limit = 10, filters = {} } = options;
    const cacheKey = `search:posts:${query}:${page}:${limit}:${JSON.stringify(filters)}`;

    // Try cache first
    const cachedResults = await cacheService.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    if (this.isConnected) {
      // Use Elasticsearch
      return await this.elasticsearchSearchPosts(query, options, cacheKey);
    } else {
      // Fallback to database search
      return await this.databaseSearchPosts(query, options, cacheKey);
    }
  }

  /**
   * Search posts using Elasticsearch
   */
  async elasticsearchSearchPosts(query, options, cacheKey) {
    const { page = 1, limit = 10, filters = {} } = options;
    const from = (page - 1) * limit;

    try {
      const body = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: query,
                  fields: ['content^2', 'hashtags', 'tags'],
                  fuzziness: 'AUTO'
                }
              }
            ],
            filter: [
              { term: { privacy: 'public' } }
            ]
          }
        },
        sort: [
          { _score: { order: 'desc' } },
          { createdAt: { order: 'desc' } }
        ],
        from,
        size: limit
      };

      // Apply additional filters
      if (filters.userId) {
        body.query.bool.filter.push({ term: { userId: filters.userId } });
      }
      if (filters.type) {
        body.query.bool.filter.push({ term: { type: filters.type } });
      }

      const result = await this.client.search({
        index: 'posts',
        body
      });

      const postIds = result.hits.hits.map(hit => hit._source.id);
      
      // Get posts from database with full data
      const posts = await Post.findAll({
        where: { id: { [Op.in]: postIds } },
        include: [{
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'fullName', 'profilePicture']
        }]
      });

      // Sort posts according to Elasticsearch ranking
      const sortedPosts = postIds.map(id => 
        posts.find(post => post.id === id)
      ).filter(Boolean);

      const response = {
        posts: sortedPosts,
        pagination: {
          total: result.hits.total.value,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.hits.total.value / limit)
        }
      };

      // Cache for 1 minute
      await cacheService.set(cacheKey, response, 60);

      return response;
    } catch (error) {
      console.error('Elasticsearch search error:', error);
      // Fallback to database search
      return await this.databaseSearchPosts(query, options, cacheKey);
    }
  }

  /**
   * Search posts using database
   */
  async databaseSearchPosts(query, options, cacheKey) {
    const { page = 1, limit = 10, filters = {} } = options;
    const offset = (page - 1) * limit;

    const where = {
      [Op.or]: [
        { content: { [Op.iLike]: `%${query}%` } },
        { tags: { [Op.contains]: [query] } },
        { hashtags: { [Op.contains]: [query] } }
      ],
      isPublished: true,
      isDeleted: false,
      privacy: 'public'
    };

    // Apply filters
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.type) {
      where.type = filters.type;
    }

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

    const response = {
      posts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    // Cache for 1 minute
    await cacheService.set(cacheKey, response, 60);

    return response;
  }

  /**
   * Search users
   */
  async searchUsers(query, options = {}) {
    const { page = 1, limit = 20, excludeId = null } = options;
    const cacheKey = `search:users:${query}:${page}:${limit}:${excludeId || 'none'}`;

    const cachedResults = await cacheService.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    if (this.isConnected) {
      // Use Elasticsearch
      return await this.elasticsearchSearchUsers(query, options, cacheKey);
    } else {
      // Fallback to database search
      return await this.databaseSearchUsers(query, options, cacheKey);
    }
  }

  /**
   * Search users using Elasticsearch
   */
  async elasticsearchSearchUsers(query, options, cacheKey) {
    const { page = 1, limit = 20, excludeId = null } = options;
    const from = (page - 1) * limit;

    try {
      const body = {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: query,
                  fields: ['username^3', 'fullName^2', 'bio'],
                  fuzziness: 'AUTO'
                }
              }
            ],
            filter: [
              { term: { isActive: true } }
            ]
          }
        },
        sort: [
          { _score: { order: 'desc' } },
          { createdAt: { order: 'desc' } }
        ],
        from,
        size: limit
      };

      if (excludeId) {
        body.query.bool.must_not = [{ term: { id: excludeId } }];
      }

      const result = await this.client.search({
        index: 'users',
        body
      });

      const userIds = result.hits.hits.map(hit => hit._source.id);
      
      // Get users from database with full data
      const users = await User.findAll({
        where: { id: { [Op.in]: userIds } },
        attributes: { exclude: ['password', 'refreshToken'] }
      });

      // Sort users according to Elasticsearch ranking
      const sortedUsers = userIds.map(id => 
        users.find(user => user.id === id)
      ).filter(Boolean);

      const response = {
        users: sortedUsers,
        pagination: {
          total: result.hits.total.value,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.hits.total.value / limit)
        }
      };

      // Cache for 1 minute
      await cacheService.set(cacheKey, response, 60);

      return response;
    } catch (error) {
      console.error('Elasticsearch user search error:', error);
      // Fallback to database search
      return await this.databaseSearchUsers(query, options, cacheKey);
    }
  }

  /**
   * Search users using database
   */
  async databaseSearchUsers(query, options, cacheKey) {
    const { page = 1, limit = 20, excludeId = null } = options;
    const offset = (page - 1) * limit;

    const where = {
      [Op.or]: [
        { username: { [Op.iLike]: `%${query}%` } },
        { fullName: { [Op.iLike]: `%${query}%` } },
        { email: { [Op.iLike]: `%${query}%` } },
        { bio: { [Op.iLike]: `%${query}%` } }
      ],
      isActive: true
    };

    if (excludeId) {
      where.id = { [Op.ne]: excludeId };
    }

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

    const response = {
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    // Cache for 1 minute
    await cacheService.set(cacheKey, response, 60);

    return response;
  }

  /**
   * Search groups
   */
  async searchGroups(query, options = {}) {
    const { page = 1, limit = 20 } = options;
    const cacheKey = `search:groups:${query}:${page}:${limit}`;

    const cachedResults = await cacheService.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    const offset = (page - 1) * limit;

    const where = {
      [Op.or]: [
        { name: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
        { tags: { [Op.contains]: [query] } }
      ],
      isActive: true
    };

    const { count, rows: groups } = await Group.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'owner',
        attributes: ['id', 'username', 'fullName', 'profilePicture']
      }],
      offset,
      limit: parseInt(limit),
      order: [
        ['membersCount', 'DESC'],
        ['createdAt', 'DESC']
      ]
    });

    const response = {
      groups,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    // Cache for 1 minute
    await cacheService.set(cacheKey, response, 60);

    return response;
  }

  /**
   * Search events
   */
  async searchEvents(query, options = {}) {
    const { page = 1, limit = 20 } = options;
    const cacheKey = `search:events:${query}:${page}:${limit}`;

    const cachedResults = await cacheService.get(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    const offset = (page - 1) * limit;

    const where = {
      [Op.or]: [
        { title: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
        { location: { [Op.iLike]: `%${query}%` } },
        { tags: { [Op.contains]: [query] } }
      ],
      isPublished: true,
      startDate: { [Op.gte]: new Date() } // Only upcoming events
    };

    const { count, rows: events } = await Event.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'organizer',
        attributes: ['id', 'username', 'fullName', 'profilePicture']
      }],
      offset,
      limit: parseInt(limit),
      order: [['startDate', 'ASC']]
    });

    const response = {
      events,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    };

    // Cache for 1 minute
    await cacheService.set(cacheKey, response, 60);

    return response;
  }

  /**
   * Global search across all entities
   */
  async globalSearch(query, options = {}) {
    const { page = 1, limit = 10, types = ['users', 'posts', 'groups', 'events'] } = options;
    
    const searchPromises = [];

    if (types.includes('users')) {
      searchPromises.push(
        this.searchUsers(query, { page, limit: Math.ceil(limit / types.length) })
          .then(result => ({ type: 'users', data: result.users, total: result.pagination.total }))
      );
    }

    if (types.includes('posts')) {
      searchPromises.push(
        this.searchPosts(query, { page, limit: Math.ceil(limit / types.length) })
          .then(result => ({ type: 'posts', data: result.posts, total: result.pagination.total }))
      );
    }

    if (types.includes('groups')) {
      searchPromises.push(
        this.searchGroups(query, { page, limit: Math.ceil(limit / types.length) })
          .then(result => ({ type: 'groups', data: result.groups, total: result.pagination.total }))
      );
    }

    if (types.includes('events')) {
      searchPromises.push(
        this.searchEvents(query, { page, limit: Math.ceil(limit / types.length) })
          .then(result => ({ type: 'events', data: result.events, total: result.pagination.total }))
      );
    }

    const results = await Promise.allSettled(searchPromises);

    const finalResults = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);

    return {
      query,
      results: finalResults,
      total: finalResults.reduce((sum, result) => sum + result.total, 0)
    };
  }

  /**
   * Delete document from Elasticsearch
   */
  async deleteDocument(index, id) {
    if (!this.isConnected) return;

    try {
      await this.client.delete({
        index,
        id
      });
    } catch (error) {
      console.error(`Error deleting document from ${index}:`, error);
    }
  }

  /**
   * Update document in Elasticsearch
   */
  async updateDocument(index, id, body) {
    if (!this.isConnected) return;

    try {
      await this.client.update({
        index,
        id,
        body: { doc: body }
      });
    } catch (error) {
      console.error(`Error updating document in ${index}:`, error);
    }
  }
}

module.exports = new SearchService();