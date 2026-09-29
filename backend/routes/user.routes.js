import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { executeTransaction } from '../lib/db.js';
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
        profile_pic_url,
        global_role,
        COALESCE(demerit_points, 0)::INT AS demerit_points,
        is_banned,
        COALESCE(has_onboarded, FALSE) AS has_onboarded,
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

// 2. UPDATE PROFILE
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { bio, profile_pic_url } = req.body;
    const userId = Number(req.user.user_id);

    if (bio && bio.length > 500) {
      return res.status(400).json({ success: false, message: 'Bio cannot exceed 500 characters' });
    }

    const currentUser = await prisma.$queryRaw`
      SELECT bio, profile_pic_url FROM users WHERE user_id = ${userId} LIMIT 1;
    `;
    if (currentUser.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const targetBio = bio !== undefined ? bio : currentUser[0].bio;
    const targetPic = profile_pic_url !== undefined ? (profile_pic_url || null) : currentUser[0].profile_pic_url;

    const updated = await prisma.$queryRaw`
      UPDATE users
      SET bio = ${targetBio},
          profile_pic_url = ${targetPic}
      WHERE user_id = ${userId}
      RETURNING user_id::INT AS user_id, username, email, bio, profile_pic_url, global_role, COALESCE(has_onboarded, FALSE) AS has_onboarded;
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
      SELECT password_hash, token_version FROM users WHERE user_id = ${userId} LIMIT 1;
    `;

    const user = users[0];
    const passwordMatches = await bcrypt.compare(current_password, user.password_hash);
    if (!passwordMatches) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    const nextTokenVersion = user.token_version + 1;

    await prisma.$executeRaw`
      UPDATE users SET password_hash = ${newHash}, token_version = ${nextTokenVersion} WHERE user_id = ${userId};
    `;

    const newToken = jwt.sign(
      { user_id: userId, token_version: nextTokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({ success: true, message: 'Password changed successfully', token: newToken });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// 4. UNFOLLOW
router.delete('/follows/category/:categoryId', authenticateToken, async (req, res) => {
  try {
    await prisma.$executeRaw`
      DELETE FROM user_category_follows WHERE user_id = ${req.user.user_id} AND category_id = ${Number(req.params.categoryId)};
    `;
    res.status(200).json({ success: true, message: 'Category removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove category follow' });
  }
});

router.delete('/follows/wiki/:wikiId', authenticateToken, async (req, res) => {
  try {
    await prisma.$executeRaw`
      DELETE FROM user_wiki_follows WHERE user_id = ${req.user.user_id} AND wiki_id = ${Number(req.params.wikiId)};
    `;
    res.status(200).json({ success: true, message: 'Wiki removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove wiki follow' });
  }
});

// 5. DELETE ACCOUNT (Atomic Cascading Deletion Across All Foreign Key Dependencies)
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const rawEmail = req.body?.confirm_email || req.body?.body?.confirm_email || req.query?.confirm_email;
    const userId = Number(req.user.user_id);

    if (!rawEmail || !rawEmail.trim()) {
      return res.status(400).json({ success: false, message: 'Email confirmation is required' });
    }

    const users = await prisma.$queryRaw`
      SELECT user_id::INT AS user_id, email FROM users WHERE user_id = ${userId} LIMIT 1;
    `;

    if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = users[0];

    if (user.email.toLowerCase() !== rawEmail.trim().toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Provided email does not match your account email' });
    }

    // Explicit BEGIN -> COMMIT / ROLLBACK transaction executing cascading cleanups
    await executeTransaction(async (client) => {
      // 1. Clean up Reading Lists and nested items
      await client.query(`
        DELETE FROM reading_list_items 
        WHERE list_id IN (SELECT list_id FROM reading_lists WHERE user_id = $1);
      `, [userId]);
      await client.query(`DELETE FROM reading_lists WHERE user_id = $1;`, [userId]);

      // 2. Clean up memberships and followings
      await client.query(`DELETE FROM wiki_memberships WHERE user_id = $1;`, [userId]);
      await client.query(`DELETE FROM user_category_follows WHERE user_id = $1;`, [userId]);
      await client.query(`DELETE FROM user_wiki_follows WHERE user_id = $1;`, [userId]);

      // 3. Nullify audit & authoring references to avoid foreign key violations
      await client.query(`UPDATE media SET uploader_id = NULL WHERE uploader_id = $1;`, [userId]);
      await client.query(`UPDATE wiki_spaces SET creator_id = NULL WHERE creator_id = $1;`, [userId]);
      await client.query(`UPDATE article_versions SET editor_id = NULL WHERE editor_id = $1;`, [userId]);
      await client.query(`UPDATE article_versions SET approver_id = NULL WHERE approver_id = $1;`, [userId]);
      await client.query(`UPDATE reports SET reporter_id = NULL WHERE reporter_id = $1;`, [userId]);
      await client.query(`UPDATE reports SET resolver_id = NULL WHERE resolver_id = $1;`, [userId]);
      await client.query(`UPDATE article_rollback_logs SET user_id = NULL WHERE user_id = $1;`, [userId]);

      // 4. Delete resets and registration attempts
      await client.query(`DELETE FROM password_resets WHERE user_id = $1;`, [userId]);
      await client.query(`DELETE FROM pending_registrations WHERE email = $1;`, [user.email]);

      // 5. Finally delete the user account
      await client.query(`DELETE FROM users WHERE user_id = $1;`, [userId]);
    });

    res.status(200).json({ success: true, message: 'Account successfully deleted' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
});

export default router;