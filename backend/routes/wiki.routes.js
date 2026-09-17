import express from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth, authenticateToken } from '../middleware/auth.js';
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


// 5. GET WIKI DETAILS BY SLUG WITH STATS, ARTICLES & SIMILAR WIKIS (MODULE 02)
router.get('/public/:slug', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user?.user_id || null;

    // Fetch core wiki metadata & category
    const wikis = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title,
        w.slug,
        w.description,
        w.total_views::INT AS total_views,
        w.category_id::INT AS category_id,
        w.created_at,
        c.name AS category_name,
        (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE) AS article_count,
        (SELECT COUNT(*)::INT FROM user_wiki_follows uwf WHERE uwf.wiki_id = w.wiki_id) AS follower_count,
        (SELECT COUNT(*)::INT FROM wiki_memberships wm WHERE wm.wiki_id = w.wiki_id) AS author_count
      FROM wiki_spaces w
      LEFT JOIN categories c ON w.category_id = c.category_id
      WHERE w.slug = ${slug}
      LIMIT 1;
    `;

    if (wikis.length === 0) {
      return res.status(404).json({ success: false, message: 'Wiki space not found' });
    }

    const wiki = wikis[0];

    // Check user membership role and follow status if authenticated
    let userRole = null;
    let isFollowingWiki = false;
    let isFollowingCategory = false;

    if (userId) {
      const membership = await prisma.$queryRaw`
        SELECT role FROM wiki_memberships WHERE wiki_id = ${wiki.wiki_id} AND user_id = ${userId} LIMIT 1;
      `;
      if (membership.length > 0) userRole = membership[0].role;

      const wikiFollow = await prisma.$queryRaw`
        SELECT user_id FROM user_wiki_follows WHERE wiki_id = ${wiki.wiki_id} AND user_id = ${userId} LIMIT 1;
      `;
      isFollowingWiki = wikiFollow.length > 0;

      if (wiki.category_id) {
        const catFollow = await prisma.$queryRaw`
          SELECT user_id FROM user_category_follows WHERE category_id = ${wiki.category_id} AND user_id = ${userId} LIMIT 1;
        `;
        isFollowingCategory = catFollow.length > 0;
      }
    }

    // Fetch published articles in this wiki
    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        a.read_count::INT AS read_count,
        a.created_at,
        (
          SELECT COALESCE(MAX(av.version_number), 1)::INT 
          FROM article_versions av 
          WHERE av.article_id = a.article_id AND av.is_published = TRUE
        ) AS published_version
      FROM articles a
      WHERE a.wiki_id = ${wiki.wiki_id} AND a.is_published = TRUE
      ORDER BY a.read_count DESC, a.created_at DESC;
    `;

    // Fetch similar wikis sharing the category
    let similarWikis = [];
    if (wiki.category_id) {
      similarWikis = await prisma.$queryRaw`
        SELECT 
          w.wiki_id::INT AS wiki_id,
          w.title,
          w.slug,
          w.description,
          w.total_views::INT AS total_views,
          (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE) AS article_count
        FROM wiki_spaces w
        WHERE w.category_id = ${wiki.category_id} AND w.wiki_id <> ${wiki.wiki_id}
        ORDER BY w.total_views DESC
        LIMIT 4;
      `;
    }

    res.status(200).json({
      success: true,
      wiki: {
        ...wiki,
        userRole,
        isFollowingWiki,
        isFollowingCategory
      },
      articles,
      similarWikis
    });
  } catch (error) {
    console.error('Fetch wiki hub error:', error);
    res.status(500).json({ success: false, message: 'Failed to load wiki space' });
  }
});

// 6. TOGGLE FOLLOW/UNFOLLOW WIKI
router.post('/:wikiId/follow', authenticateToken, async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);
    const userId = req.user.user_id;

    const existing = await prisma.$queryRaw`
      SELECT user_id FROM user_wiki_follows WHERE wiki_id = ${wikiId} AND user_id = ${userId} LIMIT 1;
    `;

    if (existing.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM user_wiki_follows WHERE wiki_id = ${wikiId} AND user_id = ${userId};
      `;
      return res.status(200).json({ success: true, following: false, message: 'Unfollowed wiki' });
    } else {
      await prisma.$executeRaw`
        INSERT INTO user_wiki_follows (user_id, wiki_id) VALUES (${userId}, ${wikiId});
      `;
      return res.status(200).json({ success: true, following: true, message: 'Following wiki' });
    }
  } catch (error) {
    console.error('Toggle wiki follow error:', error);
    res.status(500).json({ success: false, message: 'Failed to update follow state' });
  }
});

// 7. TOGGLE FOLLOW/UNFOLLOW CATEGORY
router.post('/categories/:categoryId/follow', authenticateToken, async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    const userId = req.user.user_id;

    const existing = await prisma.$queryRaw`
      SELECT user_id FROM user_category_follows WHERE category_id = ${categoryId} AND user_id = ${userId} LIMIT 1;
    `;

    if (existing.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM user_category_follows WHERE category_id = ${categoryId} AND user_id = ${userId};
      `;
      return res.status(200).json({ success: true, following: false, message: 'Unfollowed category' });
    } else {
      await prisma.$executeRaw`
        INSERT INTO user_category_follows (user_id, category_id) VALUES (${userId}, ${categoryId});
      `;
      return res.status(200).json({ success: true, following: true, message: 'Following category' });
    }
  } catch (error) {
    console.error('Toggle category follow error:', error);
    res.status(500).json({ success: false, message: 'Failed to update category follow' });
  }
});

export default router;