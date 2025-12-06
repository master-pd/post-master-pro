const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const emailService = require('../services/email.service');
const cacheService = require('../services/cache.service');
const config = require('../config');

/**
 * @desc    Register new user
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
const register = asyncHandler(async (req, res, next) => {
  const { username, email, password, fullName } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    where: {
      [Sequelize.Op.or]: [{ email }, { username }]
    }
  });

  if (existingUser) {
    throw new ApiError(400, 'User already exists with this email or username');
  }

  // Create user
  const user = await User.create({
    username,
    email,
    password,
    fullName
  });

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Save verification token (in production, store in database)
  await cacheService.set(
    `verify:${verificationToken}`,
    user.id,
    24 * 60 * 60 // 24 hours
  );

  // Send verification email
  const verificationUrl = `${config.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  await emailService.sendVerificationEmail(user.email, verificationUrl);

  // Generate tokens
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Store refresh token in cache
  await cacheService.set(`refresh:${user.id}`, refreshToken, 7 * 24 * 60 * 60);

  const response = new ApiResponse(
    201,
    {
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken
      }
    },
    'Registration successful. Please verify your email.'
  );

  res.status(201).json(response);
});

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Find user
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // Check if user is active
  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated');
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate tokens
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // Store refresh token in cache
  await cacheService.set(`refresh:${user.id}`, refreshToken, 7 * 24 * 60 * 60);

  // Set cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  const response = new ApiResponse(
    200,
    {
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken
      }
    },
    'Login successful'
  );

  res.status(200).json(response);
});

/**
 * @desc    Refresh access token
 * @route   POST /api/v1/auth/refresh-token
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    throw new ApiError(401, 'Refresh token is required');
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
    
    // Check if token exists in cache
    const storedToken = await cacheService.get(`refresh:${decoded.userId}`);
    if (!storedToken || storedToken !== refreshToken) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);

    // Update refresh token in cache
    await cacheService.set(
      `refresh:${decoded.userId}`,
      newRefreshToken,
      7 * 24 * 60 * 60
    );

    const response = new ApiResponse(
      200,
      {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      },
      'Token refreshed successfully'
    );

    res.status(200).json(response);
  } catch (error) {
    throw new ApiError(401, 'Invalid refresh token');
  }
});

/**
 * @desc    Verify email
 * @route   GET /api/v1/auth/verify-email/:token
 * @access  Public
 */
const verifyEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.params;

  const userId = await cacheService.get(`verify:${token}`);
  if (!userId) {
    throw new ApiError(400, 'Invalid or expired verification token');
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (user.isEmailVerified) {
    throw new ApiError(400, 'Email already verified');
  }

  user.isEmailVerified = true;
  await user.save();

  // Delete verification token from cache
  await cacheService.del(`verify:${token}`);

  const response = new ApiResponse(
    200,
    null,
    'Email verified successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Forgot password
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) {
    // Don't reveal that user doesn't exist
    const response = new ApiResponse(
      200,
      null,
      'If an account exists with this email, you will receive a password reset link'
    );
    return res.status(200).json(response);
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

  // Store reset token in cache
  await cacheService.set(
    `reset:${resetToken}`,
    user.id,
    60 * 60 // 1 hour
  );

  // Send reset email
  const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${resetToken}`;
  await emailService.sendPasswordResetEmail(user.email, resetUrl);

  const response = new ApiResponse(
    200,
    null,
    'Password reset email sent'
  );

  res.status(200).json(response);
});

/**
 * @desc    Reset password
 * @route   POST /api/v1/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;

  const userId = await cacheService.get(`reset:${token}`);
  if (!userId) {
    throw new ApiError(400, 'Invalid or expired reset token');
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Update password
  user.password = password;
  await user.save();

  // Delete reset token from cache
  await cacheService.del(`reset:${token}`);

  // Invalidate all refresh tokens for this user
  await cacheService.del(`refresh:${userId}`);

  const response = new ApiResponse(
    200,
    null,
    'Password reset successful'
  );

  res.status(200).json(response);
});

/**
 * @desc    Logout user
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res, next) => {
  const { userId } = req.user;

  // Delete refresh token from cache
  await cacheService.del(`refresh:${userId}`);

  // Clear cookie
  res.clearCookie('refreshToken');

  const response = new ApiResponse(
    200,
    null,
    'Logged out successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findByPk(req.user.userId, {
    attributes: { exclude: ['password'] }
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const response = new ApiResponse(
    200,
    { user: user.toJSON() },
    'Profile retrieved successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Update current user profile
 * @route   PUT /api/v1/auth/me
 * @access  Private
 */
const updateMe = asyncHandler(async (req, res, next) => {
  const { userId } = req.user;
  const { fullName, bio, profilePicture } = req.body;

  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Update fields
  if (fullName !== undefined) user.fullName = fullName;
  if (bio !== undefined) user.bio = bio;
  if (profilePicture !== undefined) user.profilePicture = profilePicture;

  await user.save();

  const response = new ApiResponse(
    200,
    { user: user.toJSON() },
    'Profile updated successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Change password
 * @route   PUT /api/v1/auth/change-password
 * @access  Private
 */
const changePassword = asyncHandler(async (req, res, next) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;

  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Verify current password
  const isPasswordValid = await user.comparePassword(currentPassword);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Invalidate all refresh tokens
  await cacheService.del(`refresh:${userId}`);

  const response = new ApiResponse(
    200,
    null,
    'Password changed successfully'
  );

  res.status(200).json(response);
});

/**
 * @desc    Deactivate account
 * @route   DELETE /api/v1/auth/deactivate
 * @access  Private
 */
const deactivateAccount = asyncHandler(async (req, res, next) => {
  const { userId } = req.user;
  const { password } = req.body;

  const user = await User.findByPk(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Password is incorrect');
  }

  // Deactivate account
  user.isActive = false;
  await user.save();

  // Invalidate all tokens
  await cacheService.del(`refresh:${userId}`);

  const response = new ApiResponse(
    200,
    null,
    'Account deactivated successfully'
  );

  res.status(200).json(response);
});

// Helper functions
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRE }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRE }
  );
};

module.exports = {
  register,
  login,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  logout,
  getMe,
  updateMe,
  changePassword,
  deactivateAccount
};