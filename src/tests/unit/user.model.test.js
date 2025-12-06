const User = require('../../models/User');
const { sequelize } = require('../../config/database');

describe('User Model', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterEach(async () => {
    await User.destroy({ where: {}, force: true });
  });

  describe('User Creation', () => {
    it('should create a user successfully', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        fullName: 'Test User',
      });

      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.fullName).toBe('Test User');
      expect(user.isEmailVerified).toBe(false);
      expect(user.isActive).toBe(true);
      expect(user.role).toBe('user');
    });

    it('should hash password before saving', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(user.password).not.toBe('Password123!');
      expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt hash pattern
    });

    it('should not include password in toJSON', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
      });

      const userJson = user.toJSON();
      expect(userJson).not.toHaveProperty('password');
    });
  });

  describe('Password Comparison', () => {
    it('should compare password correctly', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
      });

      const isMatch = await user.comparePassword('Password123!');
      expect(isMatch).toBe(true);

      const isNotMatch = await user.comparePassword('WrongPassword');
      expect(isNotMatch).toBe(false);
    });
  });

  describe('Validations', () => {
    it('should validate email format', async () => {
      await expect(
        User.create({
          username: 'testuser',
          email: 'invalid-email',
          password: 'Password123!',
        })
      ).rejects.toThrow();
    });

    it('should enforce unique username', async () => {
      await User.create({
        username: 'testuser',
        email: 'test1@example.com',
        password: 'Password123!',
      });

      await expect(
        User.create({
          username: 'testuser',
          email: 'test2@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow();
    });

    it('should enforce unique email', async () => {
      await User.create({
        username: 'user1',
        email: 'test@example.com',
        password: 'Password123!',
      });

      await expect(
        User.create({
          username: 'user2',
          email: 'test@example.com',
          password: 'Password123!',
        })
      ).rejects.toThrow();
    });
  });

  describe('Instance Methods', () => {
    it('should update last login', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
      });

      const initialLastLogin = user.lastLogin;
      user.lastLogin = new Date();
      await user.save();

      expect(user.lastLogin).not.toBe(initialLastLogin);
    });

    it('should deactivate account', async () => {
      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(user.isActive).toBe(true);
      
      user.isActive = false;
      await user.save();

      expect(user.isActive).toBe(false);
    });
  });
});