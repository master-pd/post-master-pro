const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('../config');
const constants = require('../utils/constants');
const packageJson = require('../../package.json');

/**
 * Swagger definition
 */
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: constants.APP_NAME,
    version: packageJson.version,
    description: 'Complete Social Media Backend API Documentation',
    termsOfService: 'https://example.com/terms/',
    contact: {
      name: 'API Support',
      email: 'support@example.com',
      url: 'https://example.com/support',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: `${config.BASE_URL}/api/v1`,
      description: `${config.NODE_ENV.charAt(0).toUpperCase() + config.NODE_ENV.slice(1)} Server`,
    },
    {
      url: 'http://localhost:5000/api/v1',
      description: 'Local Development Server',
    },
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization',
    },
    {
      name: 'Users',
      description: 'User management and profiles',
    },
    {
      name: 'Posts',
      description: 'Post creation, retrieval, and management',
    },
    {
      name: 'Comments',
      description: 'Post comments management',
    },
    {
      name: 'Likes',
      description: 'Post likes management',
    },
    {
      name: 'Groups',
      description: 'Group management',
    },
    {
      name: 'Events',
      description: 'Event management',
    },
    {
      name: 'Messages',
      description: 'Chat and messaging',
    },
    {
      name: 'Notifications',
      description: 'Notifications management',
    },
    {
      name: 'Uploads',
      description: 'File uploads',
    },
    {
      name: 'Search',
      description: 'Search functionality',
    },
    {
      name: 'Analytics',
      description: 'Analytics and statistics',
    },
    {
      name: 'Admin',
      description: 'Admin panel operations',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token in format: Bearer <token>',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for external services',
      },
    },
    schemas: {
      // Common schemas
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'VALIDATION_FAILED',
              },
              message: {
                type: 'string',
                example: 'Validation failed',
              },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      Success: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          message: {
            type: 'string',
            example: 'Operation successful',
          },
          data: {
            type: 'object',
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 100 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          totalPages: { type: 'integer', example: 10 },
          hasNextPage: { type: 'boolean', example: true },
          hasPrevPage: { type: 'boolean', example: false },
          nextPage: { type: 'integer', example: 2, nullable: true },
          prevPage: { type: 'integer', example: null, nullable: true },
        },
      },

      // User schemas
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
          username: { type: 'string', example: 'john_doe' },
          email: { type: 'string', format: 'email', example: 'john@example.com' },
          fullName: { type: 'string', example: 'John Doe' },
          profilePicture: { type: 'string', format: 'uri', example: 'https://example.com/avatar.jpg' },
          bio: { type: 'string', example: 'Software Developer' },
          role: { type: 'string', enum: Object.values(constants.USER_ROLES), example: 'user' },
          isEmailVerified: { type: 'boolean', example: true },
          isActive: { type: 'boolean', example: true },
          lastLogin: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      UserStats: {
        type: 'object',
        properties: {
          postsCount: { type: 'integer', example: 50 },
          followersCount: { type: 'integer', example: 1000 },
          followingCount: { type: 'integer', example: 500 },
          totalLikes: { type: 'integer', example: 5000 },
          totalComments: { type: 'integer', example: 1000 },
          engagementRate: { type: 'number', format: 'float', example: 4.5 },
        },
      },

      // Post schemas
      Post: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: Object.values(constants.POST_TYPES) },
          content: { type: 'string' },
          mediaUrls: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
          },
          thumbnailUrl: { type: 'string', format: 'uri' },
          videoDuration: { type: 'integer' },
          aspectRatio: { type: 'number', format: 'float' },
          pollQuestion: { type: 'string' },
          pollOptions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                text: { type: 'string' },
                votes: { type: 'integer' },
                voted: { type: 'boolean' },
              },
            },
          },
          pollEndsAt: { type: 'string', format: 'date-time' },
          linkPreview: {
            type: 'object',
            properties: {
              url: { type: 'string', format: 'uri' },
              title: { type: 'string' },
              description: { type: 'string' },
              image: { type: 'string', format: 'uri' },
              domain: { type: 'string' },
            },
          },
          sharedPostId: { type: 'string', format: 'uuid' },
          privacy: { type: 'string', enum: Object.values(constants.POST_PRIVACY) },
          location: { type: 'string' },
          latitude: { type: 'number', format: 'float' },
          longitude: { type: 'number', format: 'float' },
          tags: { type: 'array', items: { type: 'string' } },
          mentions: { type: 'array', items: { type: 'string', format: 'uuid' } },
          hashtags: { type: 'array', items: { type: 'string' } },
          viewsCount: { type: 'integer' },
          likesCount: { type: 'integer' },
          commentsCount: { type: 'integer' },
          sharesCount: { type: 'integer' },
          savesCount: { type: 'integer' },
          reachCount: { type: 'integer' },
          isSponsored: { type: 'boolean' },
          sponsorId: { type: 'string', format: 'uuid' },
          scheduledAt: { type: 'string', format: 'date-time' },
          isPublished: { type: 'boolean' },
          isEdited: { type: 'boolean' },
          editedAt: { type: 'string', format: 'date-time' },
          isArchived: { type: 'boolean' },
          archivedAt: { type: 'string', format: 'date-time' },
          isDeleted: { type: 'boolean' },
          deletedAt: { type: 'string', format: 'date-time' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      // Group schemas
      Group: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          ownerId: { type: 'string', format: 'uuid' },
          privacy: { type: 'string', enum: Object.values(constants.GROUP_PRIVACY) },
          coverImage: { type: 'string', format: 'uri' },
          avatar: { type: 'string', format: 'uri' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          rules: { type: 'string' },
          location: { type: 'string' },
          latitude: { type: 'number', format: 'float' },
          longitude: { type: 'number', format: 'float' },
          membersCount: { type: 'integer' },
          postsCount: { type: 'integer' },
          eventsCount: { type: 'integer' },
          isActive: { type: 'boolean' },
          isVerified: { type: 'boolean' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      // Event schemas
      Event: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          organizerId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          location: { type: 'string' },
          latitude: { type: 'number', format: 'float' },
          longitude: { type: 'number', format: 'float' },
          isOnline: { type: 'boolean' },
          onlineLink: { type: 'string', format: 'uri' },
          maxAttendees: { type: 'integer' },
          attendeesCount: { type: 'integer' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          coverImage: { type: 'string', format: 'uri' },
          privacy: { type: 'string', enum: Object.values(constants.EVENT_PRIVACY) },
          viewsCount: { type: 'integer' },
          isPublished: { type: 'boolean' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      // Authentication schemas
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', format: 'password', example: 'Password123!' },
          rememberMe: { type: 'boolean', default: false },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', example: 'john_doe' },
          email: { type: 'string', format: 'email', example: 'john@example.com' },
          password: { type: 'string', format: 'password', example: 'Password123!' },
          fullName: { type: 'string', example: 'John Doe' },
          profilePicture: { type: 'string', format: 'uri' },
          bio: { type: 'string' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Login successful' },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              tokens: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                  refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                },
              },
            },
          },
        },
      },

      // File upload schemas
      FileUploadResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'File uploaded successfully' },
          data: {
            type: 'object',
            properties: {
              url: { type: 'string', format: 'uri', example: 'https://cloudinary.com/image.jpg' },
              publicId: { type: 'string', example: 'post_master/xyz123' },
              format: { type: 'string', example: 'jpg' },
              size: { type: 'integer', example: 1024000 },
              width: { type: 'integer', example: 1920 },
              height: { type: 'integer', example: 1080 },
              duration: { type: 'integer', example: 60 },
            },
          },
        },
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication token is missing or invalid',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'AUTH_001',
                message: 'Authentication required',
              },
            },
          },
        },
      },
      ForbiddenError: {
        description: 'User does not have permission',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'AUTH_004',
                message: 'Access forbidden',
              },
            },
          },
        },
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'RES_001',
                message: 'Resource not found',
              },
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation failed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'VAL_001',
                message: 'Validation failed',
                details: [
                  { field: 'email', message: 'Email is required' },
                  { field: 'password', message: 'Password must be at least 8 characters' },
                ],
              },
            },
          },
        },
      },
      RateLimitError: {
        description: 'Rate limit exceeded',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              success: false,
              error: {
                code: 'RATE_001',
                message: 'Too many requests',
              },
            },
          },
        },
      },
    },
    parameters: {
      PaginationPage: {
        name: 'page',
        in: 'query',
        description: 'Page number',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          default: 1,
        },
      },
      PaginationLimit: {
        name: 'limit',
        in: 'query',
        description: 'Number of items per page',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 10,
        },
      },
      PaginationSortBy: {
        name: 'sortBy',
        in: 'query',
        description: 'Field to sort by',
        required: false,
        schema: {
          type: 'string',
          enum: ['createdAt', 'updatedAt', 'name', 'title', 'viewsCount', 'likesCount'],
          default: 'createdAt',
        },
      },
      PaginationSortOrder: {
        name: 'sortOrder',
        in: 'query',
        description: 'Sort order',
        required: false,
        schema: {
          type: 'string',
          enum: ['ASC', 'DESC', 'asc', 'desc'],
          default: 'DESC',
        },
      },
      SearchQuery: {
        name: 'q',
        in: 'query',
        description: 'Search query',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
      },
      UserIdParam: {
        name: 'id',
        in: 'path',
        description: 'User ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      PostIdParam: {
        name: 'id',
        in: 'path',
        description: 'Post ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      GroupIdParam: {
        name: 'id',
        in: 'path',
        description: 'Group ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      EventIdParam: {
        name: 'id',
        in: 'path',
        description: 'Event ID',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
};

/**
 * Swagger options
 */
const options = {
  swaggerDefinition,
  apis: [
    './src/routes/v1/*.js',
    './src/controllers/*.js',
    './src/schemas/*.js',
    './src/docs/api-docs.md',
  ],
};

/**
 * Generate swagger specs
 */
const swaggerSpec = swaggerJsdoc(options);

/**
 * Setup Swagger UI
 */
const setupSwagger = (app) => {
  // Swagger UI route
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: `${constants.APP_NAME} API Documentation`,
    customCss: '.swagger-ui .topbar { display: none }',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      persistAuthorization: true,
      displayOperationId: true,
      displayRequestDuration: true,
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      tryItOutEnabled: true,
    },
  }));

  // Serve swagger.json
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log(`📚 Swagger docs available at ${config.BASE_URL}/api-docs`);
};

module.exports = setupSwagger;