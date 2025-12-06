const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const emailService = require('../services/emailService');

// Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRE,
  });
  
  const refreshToken = jwt.sign({ id: userId }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRE,
  });
  
  return { accessToken, refreshToken };
};

// Register user
const register = asyncHandler(async (req, res) => {
  const { username, email, password, fullName } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({
    where: {
      [Op.or]: [{ email }, { username }],
    },
  });

  if (existingUser) {
    throw new ApiError(400, 'User already exists with this email or username');
  }

  // Create user
  const user = await User.create({
    username,
    email,
    password,
    fullName,
  });

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Save refresh token
  user.refreshToken = refreshToken;
  await user.save();

  // Send verification email
  const verificationToken = jwt.sign(
    { id: user.id },
    config.JWT_SECRET + user.password,
    { expiresIn: '24h' }
  );
  
  await emailService.sendVerificationEmail(user.email, verificationToken);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken,
      },
    },
  });
});

// Login user
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user
  const user = await User.findOne({ where: { email } });
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated');
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user.id);

  // Save refresh token
  user.refreshToken = refreshToken;
  await user.save();

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: user.toJSON(),
      tokens: {
        accessToken,
        refreshToken,
      },
    },
  });
});

// Refresh token
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new ApiError(401, 'Refresh token is required');
  }

  const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET);
  const user = await User.findByPk(decoded.id);

  if (!user || user.refreshToken !== refreshToken) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id);

  // Update refresh token
  user.refreshToken = newRefreshToken;
  await user.save();

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: newRefreshToken,
    },
  });
});

// Logout
const logout = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await User.update({ refreshToken: null }, { where: { id: userId } });

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

// Get current user
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  res.json({
    success: true,
    data: {
      user: user.toJSON(),
    },
  });
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
};