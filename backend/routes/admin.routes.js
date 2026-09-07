import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// 1. SET GLOBAL ADMIN BY EMAIL (Site Owner Only)
router.patch('/roles', authenticateToken, requireRole('owner'), async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !['admin', 'contributor'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Valid user email and role (admin or contributor) are required'
      });
    }

    const users = await prisma.$queryRaw`
      SELECT user_id::INT AS user_id, email, global_role
      FROM users
      WHERE LOWER(email) = ${email.trim().toLowerCase()}
      LIMIT 1;
    `;

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const target = users[0];
    if (target.global_role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot modify the site owner' });
    }

    await prisma.$executeRaw`
      UPDATE users
      SET global_role = ${role}::global_role_enum
      WHERE user_id = ${target.user_id};
    `;

    res.status(200).json({
      success: true,
      message: `Updated ${target.email} role to ${role}`
    });
  } catch (error) {
    console.error('Admin role assignment error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user role' });
  }
});

// 2. GLOBAL PLATFORM STATS (Owner and Global Admin Only)
router.get('/stats', authenticateToken, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const usersCount = await prisma.$queryRaw`SELECT COUNT(*)::INT AS count FROM users;`;
    const wikisCount = await prisma.$queryRaw`SELECT COUNT(*)::INT AS count FROM wiki_spaces;`;
    const articlesCount = await prisma.$queryRaw`SELECT COUNT(*)::INT AS count FROM articles;`;
    const pendingReports = await prisma.$queryRaw`SELECT COUNT(*)::INT AS count FROM reports WHERE status = 'pending';`;

    res.status(200).json({
      success: true,
      stats: {
        total_users: usersCount[0].count,
        total_wikis: wikisCount[0].count,
        total_articles: articlesCount[0].count,
        pending_reports: pendingReports[0].count
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load global statistics' });
  }
});

export default router;