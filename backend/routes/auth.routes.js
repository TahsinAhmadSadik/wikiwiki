import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { executeTransaction } from '../lib/db.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  validate: { xForwardedForHeader: false },
  message: { success: false, message: 'Too many attempts, please try again later.' }
});

async function sendEmailJSEmail({ toEmail, templateParams, templateIdOverride, emailType = 'Transactional' }) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = templateIdOverride || process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey) {
    console.warn(`[EMAIL WARNING] Missing EmailJS credentials or template for ${emailType}.`);
    return;
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: toEmail,
        ...templateParams
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS API error (${response.status}): ${errorText}`);
  }

  console.log(`[EMAIL DISPATCHED] ${emailType} email successfully sent to ${toEmail}`);
}

// 1. REGISTER
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Username, email and password are required' });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ success: false, message: 'Password must be between 8 and 72 characters' });
    }

    const existingUser = await prisma.$queryRaw`
      SELECT user_id FROM users WHERE username = ${username} OR email = ${email} LIMIT 1;
    `;

    if (existingUser.length > 0) {
      return res.status(409).json({ success: false, message: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.$executeRaw`
      DELETE FROM pending_registrations WHERE email = ${email} OR username = ${username};
    `;

    await prisma.$executeRaw`
      INSERT INTO pending_registrations (username, email, password_hash, token_hash, expires_at)
      VALUES (${username}, ${email}, ${passwordHash}, ${tokenHash}, ${expiresAt});
    `;

    // Construct clean URL (strip accidental markdown brackets or trailing slashes)
    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173')
      .replace(/[\]\)\(\[]/g, '')
      .replace(/\/+$/, '');
    const verificationUrl = `${frontendBase}/verify-email?token=${rawToken}`;
    
    console.log('----------------------------------------------------');
    console.log(`[VERIFICATION LINK for ${email}]: ${verificationUrl}`);
    console.log('----------------------------------------------------');

    // Send Verification Email via EmailJS HTTPS API (Non-blocking)
    try {
      await sendEmailJSEmail({
        toEmail: email,
        templateParams: {
          verification_url: verificationUrl
        }
      });
    } catch (mailErr) {
      console.error('[EMAIL DISPATCH FAILED]:', mailErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Verification email dispatched. Please check your inbox (and spam folder) to complete registration.'
    });
  } catch (error) {
    console.error('Registration dispatch error:', error);
    res.status(500).json({ success: false, message: 'Failed to process registration' });
  }
});

// 2. VERIFY EMAIL
router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Verification token is required' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const records = await prisma.$queryRaw`
      SELECT pending_id, username, email, password_hash, expires_at
      FROM pending_registrations WHERE token_hash = ${tokenHash} LIMIT 1;
    `;

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link' });
    }

    const pending = records[0];
    if (new Date(pending.expires_at) < new Date()) {
      await prisma.$executeRaw`DELETE FROM pending_registrations WHERE pending_id = ${pending.pending_id};`;
      return res.status(400).json({ success: false, message: 'Verification link has expired. Please sign up again.' });
    }

    const conflict = await prisma.$queryRaw`
      SELECT user_id FROM users WHERE username = ${pending.username} OR email = ${pending.email} LIMIT 1;
    `;

    if (conflict.length > 0) {
      await prisma.$executeRaw`DELETE FROM pending_registrations WHERE pending_id = ${pending.pending_id};`;
      return res.status(409).json({ success: false, message: 'Username or email is already registered.' });
    }

    await executeTransaction(async (client) => {
      await client.query(
        `INSERT INTO users (username, email, password_hash, global_role, has_onboarded)
         VALUES ($1, $2, $3, 'contributor', FALSE);`,
        [pending.username, pending.email, pending.password_hash]
      );

      await client.query(
        `DELETE FROM pending_registrations WHERE pending_id = $1;`,
        [pending.pending_id]
      );
    });

    res.status(201).json({
      success: true,
      message: 'Email verified successfully! Your account is active. You can now log in.'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ success: false, message: 'Email verification failed' });
  }
});

// 3. LOGIN
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const users = await prisma.$queryRaw`
      SELECT 
        user_id::INT AS user_id, 
        username, 
        email, 
        password_hash, 
        global_role, 
        is_banned, 
        token_version, 
        COALESCE(has_onboarded, FALSE) AS has_onboarded
      FROM users WHERE email = ${email} LIMIT 1;
    `;

    if (users.length === 0) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const user = users[0];
    if (user.is_banned) return res.status(403).json({ success: false, message: 'This account has been banned' });

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const token = jwt.sign(
      { user_id: user.user_id, token_version: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        global_role: user.global_role,
        has_onboarded: Boolean(user.has_onboarded)
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// 4. LOGOUT
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const updateKey = Number(process.env.TOKEN_UPDATE_KEY) || 1;

    await prisma.$executeRaw`
      UPDATE users SET token_version = token_version + ${updateKey} WHERE user_id = ${req.user.user_id};
    `;
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

// 5. FORGOT PASSWORD
// 5. FORGOT PASSWORD
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email address is required' });

    // Include username so it can be passed to the email template
    const users = await prisma.$queryRaw`
      SELECT user_id, username, email, is_banned 
      FROM users 
      WHERE email = ${email} 
      LIMIT 1;
    `;

    if (users.length === 0 || users[0].is_banned) {
      return res.status(200).json({
        success: true,
        message: 'If an active account exists with that email, a reset link has been dispatched.'
      });
    }

    const user = users[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.$executeRaw`
      UPDATE password_resets 
      SET used_at = CURRENT_TIMESTAMP 
      WHERE user_id = ${user.user_id} AND used_at IS NULL;
    `;

    await prisma.$executeRaw`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (${user.user_id}, ${tokenHash}, ${expiresAt});
    `;

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173')
      .replace(/[\]\)\(\[]/g, '')
      .replace(/\/+$/, '');
    const resetUrl = `${frontendBase}/reset-password?token=${rawToken}`;

    console.log('----------------------------------------------------');
    console.log(`[PASSWORD RESET LINK for ${user.email}]: ${resetUrl}`);
    console.log('----------------------------------------------------');

    // Strictly enforce EMAILJS_RESET_TEMPLATE_ID to prevent sending the verification template
    const resetTemplateId = process.env.EMAILJS_RESET_TEMPLATE_ID;

    if (!resetTemplateId) {
      console.warn('[EMAIL WARNING] EMAILJS_RESET_TEMPLATE_ID is not configured in environment.');
    } else {
      try {
        await sendEmailJSEmail({
          toEmail: user.email,
          emailType: 'Password reset',
          templateIdOverride: resetTemplateId,
          templateParams: {
            username: user.username,
            reset_url: resetUrl,
            // Fallback key if the EmailJS template uses {{verification_url}}
            verification_url: resetUrl
          }
        });
      } catch (mailErr) {
        console.error('[PASSWORD RESET EMAIL FAILED]:', mailErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'If an active account exists with that email, a reset link has been dispatched.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process password reset request' });
  }
});

// 6. RESET PASSWORD
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, message: 'Token and new password are required' });

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ success: false, message: 'Password must be between 8 and 72 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRecords = await prisma.$queryRaw`
      SELECT reset_id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ${tokenHash} LIMIT 1;
    `;

    if (resetRecords.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });

    const resetRecord = resetRecords[0];
    if (resetRecord.used_at !== null || new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'This reset link has expired or has already been used' });
    }

    const newPasswordHash = await bcrypt.hash(password, 12);

    await executeTransaction(async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE user_id = $2;`,
        [newPasswordHash, resetRecord.user_id]
      );
      await client.query(
        `UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE reset_id = $1;`,
        [resetRecord.reset_id]
      );
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new credentials.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

// 7. GET ONBOARDING DATA
router.get('/onboarding-data', optionalAuth, async (req, res) => {
  try {
    const categories = await prisma.$queryRaw`
      SELECT category_id::INT AS category_id, name, description 
      FROM categories 
      ORDER BY name ASC;
    `;

    const wikis = await prisma.$queryRaw`
      SELECT 
        wiki_id::INT AS wiki_id, 
        title, 
        slug, 
        description, 
        total_views::INT AS total_views 
      FROM wiki_spaces 
      ORDER BY total_views DESC 
      LIMIT 12;
    `;

    res.status(200).json({ success: true, categories, wikis });
  } catch (error) {
    console.error('Failed to fetch onboarding data:', error);
    res.status(500).json({ success: false, message: 'Could not load interest options' });
  }
});

// 8. ONBOARDING SUBMISSION
router.post('/onboarding', authenticateToken, async (req, res) => {
  try {
    const { category_ids = [], wiki_ids = [] } = req.body;
    const userId = Number(req.user.user_id);

    await executeTransaction(async (client) => {
      for (const catId of category_ids) {
        await client.query(
          `INSERT INTO user_category_follows (user_id, category_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, category_id) DO NOTHING;`,
          [userId, Number(catId)]
        );
      }

      for (const wId of wiki_ids) {
        await client.query(
          `INSERT INTO user_wiki_follows (user_id, wiki_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, wiki_id) DO NOTHING;`,
          [userId, Number(wId)]
        );
      }

      await client.query(
        `UPDATE users SET has_onboarded = TRUE WHERE user_id = $1;`,
        [userId]
      );
    });

    res.status(200).json({ 
      success: true, 
      has_onboarded: true, 
      message: 'Interests saved successfully' 
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ success: false, message: 'Failed to record selected interests' });
  }
});

export default router;