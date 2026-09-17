import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 1. GET CURRENT USER PROFILE & PREFERENCES
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const users = await prisma.$queryRaw`
      SELECT 
        user_id::INT AS user_id,
        username,
        email,
        bio,
        global_role,
        COALESCE(demerit_points, 0)::INT AS demerit_points,
        is_banned,
        has_onboarded,
        created_at
      FROM users
      WHERE user_id = ${req.user.user_id}
      LIMIT 1;
    `;

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const followedCategories = await prisma.$queryRaw`
      SELECT c.category_id::INT AS category_id, c.name
      FROM categories c
      INNER JOIN user_category_follows ucf ON c.category_id = ucf.category_id
      WHERE ucf.user_id = ${req.user.user_id};
    `;

    const followedWikis = await prisma.$queryRaw`
      SELECT w.wiki_id::INT AS wiki_id, w.title, w.slug
      FROM wiki_spaces w
      INNER JOIN user_wiki_follows uwf ON w.wiki_id = uwf.wiki_id
      WHERE uwf.user_id = ${req.user.user_id};
    `;

    res.status(200).json({
      success: true,
      user: users[0],
      interests: {
        categories: followedCategories,
        wikis: followedWikis,
      },
    });
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to load profile data' });
  }
});

// 2. UPDATE PROFILE (Bio only)
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { bio } = req.body;
    const userId = req.user.user_id;

    if (bio && bio.length > 500) {
      return res.status(400).json({ success: false, message: 'Bio cannot exceed 500 characters' });
    }

    const updated = await prisma.$queryRaw`
      UPDATE users
      SET bio = ${bio ?? null}
      WHERE user_id = ${userId}
      RETURNING user_id::INT AS user_id, username, email, bio, global_role;
    `;

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updated[0],
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// 3. CHANGE PASSWORD
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.user_id;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    if (new_password.length < 8 || new_password.length > 72) {
      return res.status(400).json({ success: false, message: 'Password must be between 8 and 72 characters' });
    }

    const users = await prisma.$queryRaw`
      SELECT password_hash, token_version
      FROM users
      WHERE user_id = ${userId}
      LIMIT 1;
    `;

    const user = users[0];
    const passwordMatches = await bcrypt.compare(current_password, user.password_hash);

    if (!passwordMatches) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    const nextTokenVersion = user.token_version + 1;

    await prisma.$executeRaw`
      UPDATE users
      SET password_hash = ${newHash},
          token_version = ${nextTokenVersion}
      WHERE user_id = ${userId};
    `;

    const newToken = jwt.sign(
      { user_id: userId, token_version: nextTokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      token: newToken,
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// 4. UNFOLLOW CATEGORY OR WIKI
router.delete('/follows/category/:categoryId', authenticateToken, async (req, res) => {
  try {
    await prisma.$executeRaw`
      DELETE FROM user_category_follows
      WHERE user_id = ${req.user.user_id} AND category_id = ${Number(req.params.categoryId)};
    `;
    res.status(200).json({ success: true, message: 'Category removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove category follow' });
  }
});

router.delete('/follows/wiki/:wikiId', authenticateToken, async (req, res) => {
  try {
    await prisma.$executeRaw`
      DELETE FROM user_wiki_follows
      WHERE user_id = ${req.user.user_id} AND wiki_id = ${Number(req.params.wikiId)};
    `;
    res.status(200).json({ success: true, message: 'Wiki removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove wiki follow' });
  }
});

// 5. DELETE ACCOUNT
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const { confirm_email } = req.body;
    const userId = req.user.user_id;

    if (!confirm_email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email confirmation is required' 
      });
    }

    const users = await prisma.$queryRaw`
      SELECT user_id, email
      FROM users
      WHERE user_id = ${userId}
      LIMIT 1;
    `;

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    if (user.email.toLowerCase() !== confirm_email.trim().toLowerCase()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Provided email does not match your account email' 
      });
    }

    // Clean up follows and resets before deleting the user record
    await prisma.$transaction([
      prisma.$executeRaw`DELETE FROM user_category_follows WHERE user_id = ${userId};`,
      prisma.$executeRaw`DELETE FROM user_wiki_follows WHERE user_id = ${userId};`,
      prisma.$executeRaw`DELETE FROM password_resets WHERE user_id = ${userId};`,
      prisma.$executeRaw`DELETE FROM users WHERE user_id = ${userId};`
    ]);

    res.status(200).json({
      success: true,
      message: 'Account successfully deleted'
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
});

export default router;