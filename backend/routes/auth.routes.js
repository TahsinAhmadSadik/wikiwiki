import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  message: { success: false, message: 'Too many attempts, please try again later.' }
});

// 1. REGISTER: Validates input, stages pending signup, sends email via Resend
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email and password are required'
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: 'Password must be between 8 and 72 characters'
      });
    }

    // Check if username or email is already an active user in the DB
    const existingUser = await prisma.$queryRaw`
      SELECT user_id
      FROM users
      WHERE username = ${username}
         OR email = ${email}
      LIMIT 1;
    `;

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Generate random 32-byte hex token and hash it
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Clean up any previous unverified registration attempts for this email or username
    await prisma.$executeRaw`
      DELETE FROM pending_registrations
      WHERE email = ${email} OR username = ${username};
    `;

    // Stage pending registration
    await prisma.$executeRaw`
      INSERT INTO pending_registrations (
        username,
        email,
        password_hash,
        token_hash,
        expires_at
      )
      VALUES (
        ${username},
        ${email},
        ${passwordHash},
        ${tokenHash},
        ${expiresAt}
      );
    `;

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${rawToken}`;

    // Always log to terminal for local dev and teammate testing
    console.log('----------------------------------------------------');
    console.log(`[VERIFICATION LINK for ${email}]:`);
    console.log(verificationUrl);
    console.log('----------------------------------------------------');


    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Wiki Support <onboarding@resend.dev>',
      to: email,
      subject: 'Verify your email to complete registration',
      html: `
        <h2>Welcome to the Wiki!</h2>
        <p>Please confirm your email address to complete creating your account.</p>
        <p><a href="${verificationUrl}">Click here to verify and activate your account</a></p>
        <p>This link expires in 24 hours.</p>
      `
    });

    res.status(200).json({
      success: true,
      message: 'Verification email dispatched. Please verify your email to complete registration.'
    });

  } catch (error) {
    console.error('Registration dispatch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to dispatch verification email'
    });
  }
});

// 2. VERIFY EMAIL: Verifies token, inserts into `users`, and deletes pending record
router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const records = await prisma.$queryRaw`
      SELECT pending_id, username, email, password_hash, expires_at
      FROM pending_registrations
      WHERE token_hash = ${tokenHash}
      LIMIT 1;
    `;

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link' });
    }

    const pending = records[0];

    if (new Date(pending.expires_at) < new Date()) {
      await prisma.$executeRaw`
        DELETE FROM pending_registrations WHERE pending_id = ${pending.pending_id};
      `;
      return res.status(400).json({ success: false, message: 'Verification link has expired. Please sign up again.' });
    }

    // Check again if taken while verification was pending
    const conflict = await prisma.$queryRaw`
      SELECT user_id FROM users
      WHERE username = ${pending.username} OR email = ${pending.email}
      LIMIT 1;
    `;

    if (conflict.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM pending_registrations WHERE pending_id = ${pending.pending_id};
      `;
      return res.status(409).json({ success: false, message: 'Username or email is already registered.' });
    }

    // Insert user into real `users` table and delete from `pending_registrations`
    await prisma.$transaction([
      prisma.$executeRaw`
        INSERT INTO users (
          username,
          email,
          password_hash,
          global_role
        )
        VALUES (
          ${pending.username},
          ${pending.email},
          ${pending.password_hash},
          'contributor'
        );
      `,
      prisma.$executeRaw`
        DELETE FROM pending_registrations WHERE pending_id = ${pending.pending_id};
      `
    ]);

    res.status(201).json({
      success: true,
      message: 'Email verified successfully! Your account is active. You can now log in.'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed'
    });
  }
});


router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // 2. Find user by email
    const users = await prisma.$queryRaw`
      SELECT
        user_id,
        username,
        email,
        password_hash,
        global_role,
        is_banned,
        token_version
      FROM users
      WHERE email = ${email}
      LIMIT 1;
    `;

    // 3. Check whether user exists
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

    // 4. Check whether user is banned
    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        message: 'This account has been banned'
      });
    }

    // 5. Compare password with stored bcrypt hash
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // 6. Create JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        token_version: user.token_version
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '1h'
      }
    );

    // 7. Send response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        global_role: user.global_role
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await prisma.$executeRaw`
      UPDATE users
      SET token_version = token_version + 1
      WHERE user_id = ${req.user.user_id};
    `;

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});


// 1. FORGOT PASSWORD (Dispatches reset token)
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const users = await prisma.$queryRaw`
      SELECT user_id, email, is_banned
      FROM users
      WHERE email = ${email}
      LIMIT 1;
    `;

    // Standard security practice: return success even if user doesn't exist to prevent account enumeration
    if (users.length === 0 || users[0].is_banned) {
      return res.status(200).json({
        success: true,
        message: 'If an active account exists with that email, a reset link has been dispatched.'
      });
    }

    const user = users[0];

    // Generate random 32-byte hex token and store its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

    // Invalidate any existing unused reset tokens for this user
    await prisma.$executeRaw`
      UPDATE password_resets
      SET used_at = CURRENT_TIMESTAMP
      WHERE user_id = ${user.user_id} AND used_at IS NULL;
    `;

    // Insert new reset token
    await prisma.$executeRaw`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (${user.user_id}, ${tokenHash}, ${expiresAt});
    `;

    // Generate reset URL (Front-end URL)
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;

    // temporary logging in console
    console.log('----------------------------------------------------');
    console.log(`[PASSWORD RESET LINK for ${user.email}]:`);
    console.log(resetUrl);
    console.log('----------------------------------------------------');


    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'Wiki Support <onboarding@resend.dev>', // or your verified domain
      to: user.email,
      subject: 'Reset your Wiki account password',
      html: `
        <p>You requested a password reset for your Wiki account.</p>
        <p><a href="${resetUrl}">Click here to reset your password</a></p>
        <p>This link expires in 15 minutes.</p>
      `,
    });

    res.status(200).json({
      success: true,
      message: 'If an active account exists with that email, a reset link has been dispatched.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process password reset request' });
  }
});

// 2. RESET PASSWORD (Verifies token, updates password, increments token_version)
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: 'Password must be between 8 and 72 characters'
      });
    }

    // Hash the raw token sent from the client to compare against database
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetRecords = await prisma.$queryRaw`
      SELECT reset_id, user_id, expires_at, used_at
      FROM password_resets
      WHERE token_hash = ${tokenHash}
      LIMIT 1;
    `;

    if (resetRecords.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
    }

    const resetRecord = resetRecords[0];

    // Verify expiration and whether token was already consumed
    if (resetRecord.used_at !== null || new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: 'This reset link has expired or has already been used' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(password, 12);

    // Update password, increment token_version (invalidating active sessions), and mark token used
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE users
        SET password_hash = ${newPasswordHash},
            token_version = token_version + 1
        WHERE user_id = ${resetRecord.user_id};
      `,
      prisma.$executeRaw`
        UPDATE password_resets
        SET used_at = CURRENT_TIMESTAMP
        WHERE reset_id = ${resetRecord.reset_id};
      `
    ]);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You can now log in with your new credentials.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

export default router;