const config = require('../config');
const logger = require('../utils/logger');
const { sendEmail, emailTemplates } = require('../config/email');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { queues } = require('../config/bull');

class EmailService {
  constructor() {
    this.fromEmail = config.EMAIL_FROM || 'noreply@postmaster.com';
    this.siteName = 'Post Master';
  }

  // Send email with template
  async sendTemplateEmail(to, templateName, data) {
    const template = emailTemplates[templateName];
    
    if (!template) {
      throw new ApiError(500, `Email template ${templateName} not found`);
    }

    const emailData = template(data);
    
    const mailOptions = {
      to,
      from: this.fromEmail,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text || this.htmlToText(emailData.html),
    };

    try {
      await sendEmail(mailOptions);
      logger.info(`Email sent to ${to} with template ${templateName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      throw new ApiError(500, 'Failed to send email');
    }
  }

  // Send welcome email
  async sendWelcomeEmail(user) {
    return this.sendTemplateEmail(user.email, 'welcome', user);
  }

  // Send verification email
  async sendVerificationEmail(user, token) {
    return this.sendTemplateEmail(user.email, 'verification', { user, token });
  }

  // Send password reset email
  async sendPasswordResetEmail(user, token) {
    return this.sendTemplateEmail(user.email, 'passwordReset', { user, token });
  }

  // Send email change confirmation
  async sendEmailChangeConfirmation(user, newEmail, token) {
    const subject = 'Confirm Your Email Change';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Confirm Email Change</h1>
        <p>Hello ${user.username},</p>
        <p>You requested to change your email from ${user.email} to ${newEmail}.</p>
        <p>Click the button below to confirm this change:</p>
        <a href="${config.FRONTEND_URL}/confirm-email-change?token=${token}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
          Confirm Email Change
        </a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this change, please ignore this email and secure your account.</p>
      </div>
    `;

    return this.sendEmail(newEmail, subject, html);
  }

  // Send login alert
  async sendLoginAlert(user, deviceInfo) {
    return this.sendTemplateEmail(user.email, 'newLogin', { user, deviceInfo });
  }

  // Send notification email
  async sendNotificationEmail(user, notification) {
    const subject = notification.title;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">${notification.title}</h1>
        <p>${notification.body}</p>
        ${notification.data?.url ? `
          <a href="${notification.data.url}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
            View Details
          </a>
        ` : ''}
      </div>
    `;

    return this.sendEmail(user.email, subject, html);
  }

  // Send custom email
  async sendCustomEmail(to, subject, html, text) {
    const mailOptions = {
      to,
      from: this.fromEmail,
      subject,
      html,
      text: text || this.htmlToText(html),
    };

    try {
      await sendEmail(mailOptions);
      logger.info(`Custom email sent to ${to}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send custom email to ${to}:`, error);
      throw new ApiError(500, 'Failed to send email');
    }
  }

  // Send bulk emails (queue based)
  async sendBulkEmails(users, subject, html, batchSize = 100) {
    const batches = [];
    
    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const promises = batch.map(user => 
        this.sendCustomEmail(user.email, subject, html).catch(error => {
          logger.error(`Failed to send email to ${user.email}:`, error);
          return null;
        })
      );

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between batches
    }

    logger.info(`Bulk email sent to ${users.length} users`);
  }

  // Queue email job
  async queueEmail(type, data) {
    return queues.email.add({ type, data });
  }

  // Verify email address
  async verifyEmailAddress(email) {
    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email)) {
      return { valid: false, reason: 'Invalid email format' };
    }

    // Check if email domain exists (optional - can be heavy)
    // For now, just check format
    return { valid: true };
  }

  // Get email stats
  async getEmailStats() {
    // This would query email service provider API
    // For now, return placeholder stats
    return {
      sentToday: 0,
      sentThisMonth: 0,
      bounceRate: 0,
      openRate: 0,
      clickRate: 0,
    };
  }

  // Unsubscribe user from emails
  async unsubscribeUser(email, reason = '') {
    try {
      const user = await User.findOne({ where: { email } });
      
      if (user) {
        user.emailPreferences = {
          ...user.emailPreferences,
          marketing: false,
          notifications: false,
          unsubscribeReason: reason,
          unsubscribedAt: new Date(),
        };
        
        await user.save();
        logger.info(`User ${email} unsubscribed from emails`);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to unsubscribe user:', error);
      return false;
    }
  }

  // Resubscribe user to emails
  async resubscribeUser(email) {
    try {
      const user = await User.findOne({ where: { email } });
      
      if (user) {
        user.emailPreferences = {
          ...user.emailPreferences,
          marketing: true,
          notifications: true,
          unsubscribeReason: null,
          unsubscribedAt: null,
        };
        
        await user.save();
        logger.info(`User ${email} resubscribed to emails`);
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to resubscribe user:', error);
      return false;
    }
  }

  // HTML to text converter (basic)
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Generate email template
  generateEmailTemplate(templateName, data) {
    const templates = {
      announcement: (data) => ({
        subject: `Announcement: ${data.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4F46E5;">${data.title}</h1>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${data.content}
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              This is an important announcement from ${this.siteName}.
            </p>
          </div>
        `,
      }),

      passwordChanged: (data) => ({
        subject: 'Password Changed Successfully',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4F46E5;">Password Changed</h1>
            <p>Hello ${data.user.username},</p>
            <p>Your password was successfully changed on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}.</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
              <p><strong>Device:</strong> ${data.deviceInfo.device || 'Unknown'}</p>
              <p><strong>Location:</strong> ${data.deviceInfo.location || 'Unknown'}</p>
              <p><strong>IP Address:</strong> ${data.deviceInfo.ip || 'Unknown'}</p>
            </div>
            <p>If you didn't make this change, please secure your account immediately.</p>
            <a href="${config.FRONTEND_URL}/security" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
              Secure Account
            </a>
          </div>
        `,
      }),

      accountDeactivated: (data) => ({
        subject: 'Account Deactivated',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #4F46E5;">Account Deactivated</h1>
            <p>Hello ${data.user.username},</p>
            <p>Your account has been deactivated as requested.</p>
            <p><strong>Reason:</strong> ${data.reason || 'Not specified'}</p>
            <p><strong>Deactivation Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p>Your account will be permanently deleted after 30 days unless you reactivate it.</p>
            <p>To reactivate your account, simply log in within the next 30 days.</p>
            <p>We're sorry to see you go. If you have any feedback, please let us know.</p>
          </div>
        `,
      }),
    };

    const template = templates[templateName];
    return template ? template(data) : null;
  }
}

module.exports = new EmailService();