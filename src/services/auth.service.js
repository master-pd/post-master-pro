const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const cacheService = require('./cache.service');
const emailService = require('./email.service');
const config = require('../config');

class AuthService {
  /**
   * Register a new user
   */
  async register(userData) {
    const { username, email, password, fullName } = userData;

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      throw new Error('User already exists with this email or username');
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password,
      fullName
    });

    // Generate verification token
    const verificationToken = this.generateToken();
    const verificationUrl = `${config.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    // Store verification token in cache (24 hours)
    await cacheService.set(
      `verify:${verificationToken}`,
      user.id,
      24 * 60 * 60
    );

    // Send verification email
    await emailService.sendVerificationEmail(user.email, verificationUrl);

    // Generate tokens
    const tokens = this.generateTokens(user.id);

    // Store refresh token in cache (7 days)
    await cacheService.set(
      `refresh:${user.id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    return {
      user: user.toJSON(),
      tokens
    };
  }

  /**
   * Login user
   */
  async login(email, password) {
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const tokens = this.generateTokens(user.id);

    // Store refresh token in cache
    await cacheService.set(
      `refresh:${user.id}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    return {
      user: user.toJSON(),
      tokens
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
      
      // Check if token exists in cache
      const storedToken = await cacheService.get(`refresh:${decoded.userId}`);
      if (!storedToken || storedToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      // Generate new tokens
      const newTokens = this.generateTokens(decoded.userId);

      // Update refresh token in cache
      await cacheService.set(
        `refresh:${decoded.userId}`,
        newTokens.refreshToken,
        7 * 24 * 60 * 60
      );

      return newTokens;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(token) {
    const userId = await cacheService.get(`verify:${token}`);
    if (!userId) {
      throw new Error('Invalid or expired verification token');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.isEmailVerified) {
      throw new Error('Email already verified');
    }

    user.isEmailVerified = true;
    await user.save();

    // Delete verification token from cache
    await cacheService.del(`verify:${token}`);

    return true;
  }

  /**
   * Request password reset
   */
  async forgotPassword(email) {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Don't reveal that user doesn't exist
      return true;
    }

    // Generate reset token
    const resetToken = this.generateToken();
    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Store reset token in cache (1 hour)
    await cacheService.set(
      `reset:${resetToken}`,
      user.id,
      60 * 60
    );

    // Send reset email
    await emailService.sendPasswordResetEmail(user.email, resetUrl);

    return true;
  }

  /**
   * Reset password
   */
  async resetPassword(token, newPassword) {
    const userId = await cacheService.get(`reset:${token}`);
    if (!userId) {
      throw new Error('Invalid or expired reset token');
    }

    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Delete reset token from cache
    await cacheService.del(`reset:${token}`);

    // Invalidate all refresh tokens for this user
    await cacheService.del(`refresh:${userId}`);

    return true;
  }

  /**
   * Logout user
   */
  async logout(userId) {
    // Delete refresh token from cache
    await cacheService.del(`refresh:${userId}`);
    return true;
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

    // Invalidate all refresh tokens
    await cacheService.del(`refresh:${userId}`);

    return true;
  }

  /**
   * Generate JWT tokens
   */
  generateTokens(userId) {
    const accessToken = jwt.sign(
      { userId },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRE }
    );

    const refreshToken = jwt.sign(
      { userId },
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRE }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Generate random token
   */
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      return decoded;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  /**
   * Generate email verification token
   */
  generateEmailVerificationToken(userId) {
    const token = this.generateToken();
    
    // Store in cache for 24 hours
    cacheService.set(`verify:${token}`, userId, 24 * 60 * 60);
    
    return token;
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email) {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new Error('User not found');
    }

    if (user.isEmailVerified) {
      throw new Error('Email already verified');
    }

    const verificationToken = this.generateEmailVerificationToken(user.id);
    const verificationUrl = `${config.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await emailService.sendVerificationEmail(user.email, verificationUrl);

    return true;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(token) {
    try {
      const decoded = this.verifyAccessToken(token);
      const user = await User.findByPk(decoded.userId);
      
      return {
        authenticated: !!user && user.isActive,
        user: user ? user.toJSON() : null
      };
    } catch (error) {
      return { authenticated: false, user: null };
    }
  }

  /**
   * Get user from token
   */
  async getUserFromToken(token) {
    try {
      const decoded = this.verifyAccessToken(token);
      const user = await User.findByPk(decoded.userId, {
        attributes: { exclude: ['password'] }
      });
      
      return user;
    } catch (error) {
      return null;
    }
  }

  /**
   * Invalidate all user sessions
   */
  async invalidateAllSessions(userId) {
    await cacheService.del(`refresh:${userId}`);
    return true;
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    const errors = [];

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
      errors.push('Password must contain at least one number');
    }
    if (!hasSpecialChars) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate temporary access token (for specific operations)
   */
  generateTemporaryToken(userId, expiresIn = '15m') {
    return jwt.sign(
      { userId, type: 'temporary' },
      config.JWT_SECRET,
      { expiresIn }
    );
  }

  /**
   * Verify temporary token
   */
  verifyTemporaryToken(token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      if (decoded.type !== 'temporary') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      throw new Error('Invalid temporary token');
    }
  }
}

module.exports = new AuthService();