const express = require('express');
const router = express.Router();
const authController = require('../../controllers/auth.controller');
const validate = require('../../middleware/validate');
const auth = require('../../middleware/auth');
const rateLimiter = require('../../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
  deactivateSchema
} = require('../../schemas/user.schema');

// Public routes
router.post(
  '/register',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), // 5 attempts per 15 minutes
  validate(registerSchema),
  authController.register
);

router.post(
  '/login',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 attempts per 15 minutes
  validate(loginSchema),
  authController.login
);

router.post(
  '/refresh-token',
  validate(refreshTokenSchema),
  authController.refreshToken
);

router.get(
  '/verify-email/:token',
  authController.verifyEmail
);

router.post(
  '/forgot-password',
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }), // 3 attempts per hour
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password/:token',
  validate(resetPasswordSchema),
  authController.resetPassword
);

// Protected routes (require authentication)
router.use(auth.authenticate); // Apply auth middleware to all routes below

router.post(
  '/logout',
  authController.logout
);

router.get(
  '/me',
  authController.getMe
);

router.put(
  '/me',
  validate(updateProfileSchema),
  authController.updateMe
);

router.put(
  '/change-password',
  validate(changePasswordSchema),
  authController.changePassword
);

router.delete(
  '/deactivate',
  validate(deactivateSchema),
  authController.deactivateAccount
);

module.exports = router;