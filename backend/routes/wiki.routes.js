import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { authorizeWikiAccess } from '../middleware/wikiAuth.js';

const router = express.Router();

// GET ALL WIKIS THE CURRENT USER MANAGES (Author, Co-author, or All if Global Admin/Owner)
router.get('/managed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    let wikis;
    if (isGlobal) {
      // Global Admins and Owner see all wikis
      wikis = await prisma.$queryRaw`
        SELECT 
          w.wiki_id::INT AS wiki_id,
          w.title,
          w.slug,
          w.description,
          w.total_views::INT AS total_views,
          w.created_at,
          'admin' AS user_role,
          (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id) AS article_count,
          (SELECT COUNT(*)::INT FROM user_wiki_follows f WHERE f.wiki_id = w.wiki_id) AS follower_count
        FROM wiki_spaces w
        ORDER BY w.created_at DESC;
      `;
    } else {
      // Contributors see only wikis where they are Author or Co-Author
      wikis = await prisma.$queryRaw`
        SELECT 
          w.wiki_id::INT AS wiki_id,
          w.title,
          w.slug,
          w.description,
          w.total_views::INT AS total_views,
          w.created_at,
          wm.role AS user_role,
          (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id) AS article_count,
          (SELECT COUNT(*)::INT FROM user_wiki_follows f WHERE f.wiki_id = w.wiki_id) AS follower_count
        FROM wiki_spaces w
        INNER JOIN wiki_memberships wm ON w.wiki_id = wm.wiki_id
        WHERE wm.user_id = ${userId}
        ORDER BY w.created_at DESC;
      `;
    }

    res.status(200).json({ success: true, wikis });
  } catch (error) {
    console.error('Fetch managed wikis error:', error);
    res.status(500).json({ success: false, message: 'Failed to load managed wikis' });
  }
});

// CREATE WIKI: Contributor creates wiki -> becomes Author in wiki_memberships
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, category_id } = req.body;
    const userId = req.user.user_id;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Wiki title is required' });
    }

    const slug = title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

    const existing = await prisma.$queryRaw`
      SELECT wiki_id FROM wiki_spaces WHERE slug = ${slug} LIMIT 1;
    `;
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'A wiki with this title already exists' });
    }

    // Insert wiki and add user as 'author' in wiki_memberships
    const newWiki = await prisma.$transaction(async (tx) => {
      const created = await tx.$queryRaw`
        INSERT INTO wiki_spaces (title, slug, description, creator_id, category_id)
        VALUES (${title.trim()}, ${slug}, ${description || null}, ${userId}, ${category_id ? Number(category_id) : null})
        RETURNING wiki_id::INT AS wiki_id, title, slug;
      `;

      const wiki = created[0];

      await tx.$executeRaw`
        INSERT INTO wiki_memberships (user_id, wiki_id, role)
        VALUES (${userId}, ${wiki.wiki_id}, 'author'::wiki_role_enum);
      `;

      return wiki;
    });

    res.status(201).json({
      success: true,
      message: 'Wiki space created successfully. You are now the primary author.',
      wiki: newWiki
    });
  } catch (error) {
    console.error('Create wiki error:', error);
    res.status(500).json({ success: false, message: 'Failed to create wiki space' });
  }
});

// ASSIGN CO-AUTHOR BY EMAIL: Primary Author or Global Admin adds another user
router.post('/:wikiId/members', authenticateToken, authorizeWikiAccess('author'), async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'User email is required' });
    }

    const users = await prisma.$queryRaw`
      SELECT user_id::INT AS user_id, username, email, is_banned
      FROM users
      WHERE LOWER(email) = ${email.trim().toLowerCase()}
      LIMIT 1;
    `;

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'No registered user found with that email' });
    }

    const targetUser = users[0];
    if (targetUser.is_banned) {
      return res.status(400).json({ success: false, message: 'Cannot assign a banned user' });
    }

    await prisma.$executeRaw`
      INSERT INTO wiki_memberships (user_id, wiki_id, role)
      VALUES (${targetUser.user_id}, ${wikiId}, 'co_author'::wiki_role_enum)
      ON CONFLICT (user_id, wiki_id)
      DO UPDATE SET role = 'co_author'::wiki_role_enum;
    `;

    res.status(200).json({
      success: true,
      message: `${targetUser.username} (${targetUser.email}) is now a Co-Author of this wiki.`
    });
  } catch (error) {
    console.error('Assign co-author error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign co-author' });
  }
});

// GET WIKI MEMBERS LIST
router.get('/:wikiId/members', authenticateToken, authorizeWikiAccess('co_author'), async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);

    const members = await prisma.$queryRaw`
      SELECT 
        u.user_id::INT AS user_id,
        u.username,
        u.email,
        wm.role,
        wm.assigned_at
      FROM wiki_memberships wm
      INNER JOIN users u ON wm.user_id = u.user_id
      WHERE wm.wiki_id = ${wikiId}
      ORDER BY wm.role ASC, u.username ASC;
    `;

    res.status(200).json({ success: true, members });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load wiki members' });
  }
});

export default router;