const nodemailer = require('nodemailer');
const config = require('./index');
const logger = require('../utils/logger');

let transporter;

const initEmail = () => {
  try {
    transporter = nodemailer.createTransport({
      host: config.EMAIL_HOST,
      port: config.EMAIL_PORT,
      secure: config.EMAIL_PORT === 465,
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: config.NODE_ENV === 'production',
      },
    });

    // Verify connection
    transporter.verify((error) => {
      if (error) {
        logger.error('Email transporter verification failed:', error);
      } else {
        logger.info('Email transporter ready to send messages.');
      }
    });

    return transporter;
  } catch (error) {
    logger.error('Failed to initialize email transporter:', error);
    throw error;
  }
};

const sendEmail = async (options) => {
  if (!transporter) {
    initEmail();
  }

  const mailOptions = {
    from: config.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: options.attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
};

// Email templates
const emailTemplates = {
  welcome: (user) => ({
    subject: 'Welcome to Post Master!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Welcome to Post Master, ${user.username}!</h1>
        <p>Thank you for joining our community. We're excited to have you on board.</p>
        <p>Start connecting with friends, sharing moments, and discovering amazing content.</p>
        <a href="${config.FRONTEND_URL}/dashboard" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
          Go to Dashboard
        </a>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px;">
          If you didn't create this account, please ignore this email.
        </p>
      </div>
    `,
  }),

  verification: (user, token) => ({
    subject: 'Verify Your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Verify Your Email</h1>
        <p>Hello ${user.username},</p>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${config.FRONTEND_URL}/verify-email?token=${token}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
          Verify Email
        </a>
        <p>Or copy and paste this link in your browser:</p>
        <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all;">
          ${config.FRONTEND_URL}/verify-email?token=${token}
        </p>
        <p>This link will expire in 24 hours.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px;">
          If you didn't request this email, please ignore it.
        </p>
      </div>
    `,
  }),

  passwordReset: (user, token) => ({
    subject: 'Reset Your Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Reset Your Password</h1>
        <p>Hello ${user.username},</p>
        <p>We received a request to reset your password. Click the button below to proceed:</p>
        <a href="${config.FRONTEND_URL}/reset-password?token=${token}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
          Reset Password
        </a>
        <p>Or copy and paste this link in your browser:</p>
        <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all;">
          ${config.FRONTEND_URL}/reset-password?token=${token}
        </p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px;">
          For security reasons, this link can only be used once.
        </p>
      </div>
    `,
  }),

  newLogin: (user, deviceInfo) => ({
    subject: 'New Login Detected',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">New Login Detected</h1>
        <p>Hello ${user.username},</p>
        <p>A new login was detected on your account:</p>
        <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p><strong>Device:</strong> ${deviceInfo.device || 'Unknown'}</p>
          <p><strong>Browser:</strong> ${deviceInfo.browser || 'Unknown'}</p>
          <p><strong>Location:</strong> ${deviceInfo.location || 'Unknown'}</p>
          <p><strong>IP Address:</strong> ${deviceInfo.ip || 'Unknown'}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p>If this was you, you can ignore this email.</p>
        <p>If you don't recognize this activity, please secure your account immediately:</p>
        <a href="${config.FRONTEND_URL}/security" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">
          Secure Account
        </a>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 14px;">
          For your security, we recommend enabling two-factor authentication.
        </p>
      </div>
    `,
  }),
};

module.exports = {
  transporter: initEmail(),
  sendEmail,
  emailTemplates,
};