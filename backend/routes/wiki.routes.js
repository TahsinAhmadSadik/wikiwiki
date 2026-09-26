import express from 'express';
import { prisma } from '../lib/prisma.js';
import { executeTransaction } from '../lib/db.js';
import { optionalAuth, authenticateToken } from '../middleware/auth.js';
import { authorizeWikiAccess } from '../middleware/wikiAuth.js';

const router = express.Router();

// 1. GET DIRECTORY
router.get('/directory', async (req, res) => {
  try {
    const wikis = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title,
        w.slug,
        w.description,
        w.category_id::INT AS category_id,
        COALESCE(w.cover_image_url, m.file_url) AS cover_image_url,
        w.total_views::INT AS total_views,
        c.name AS category_name,
        (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE) AS article_count
      FROM wiki_spaces w
      LEFT JOIN categories c ON w.category_id = c.category_id
      LEFT JOIN media m ON w.media_id = m.media_id
      ORDER BY w.title ASC;
    `;
    res.status(200).json({ success: true, wikis });
  } catch (error) {
    console.error('Fetch directory error:', error);
    res.status(500).json({ success: false, message: 'Failed to load wiki directory' });
  }
});

// 2. GET MANAGED WIKIS
router.get('/managed', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    let wikis;
    if (isGlobal) {
      wikis = await prisma.$queryRaw`
        SELECT 
          w.wiki_id::INT AS wiki_id,
          w.title,
          w.slug,
          w.description,
          COALESCE(w.cover_image_url, m.file_url) AS cover_image_url,
          w.total_views::INT AS total_views,
          w.created_at,
          'admin' AS user_role,
          (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id) AS article_count,
          (SELECT COUNT(*)::INT FROM user_wiki_follows f WHERE f.wiki_id = w.wiki_id) AS follower_count
        FROM wiki_spaces w
        LEFT JOIN media m ON w.media_id = m.media_id
        ORDER BY w.created_at DESC;
      `;
    } else {
      wikis = await prisma.$queryRaw`
        SELECT 
          w.wiki_id::INT AS wiki_id,
          w.title,
          w.slug,
          w.description,
          COALESCE(w.cover_image_url, m.file_url) AS cover_image_url,
          w.total_views::INT AS total_views,
          w.created_at,
          wm.role AS user_role,
          (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id) AS article_count,
          (SELECT COUNT(*)::INT FROM user_wiki_follows f WHERE f.wiki_id = w.wiki_id) AS follower_count
        FROM wiki_spaces w
        INNER JOIN wiki_memberships wm ON w.wiki_id = wm.wiki_id
        LEFT JOIN media m ON w.media_id = m.media_id
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

// 3. CREATE WIKI SPACE (Explicit Transaction: INSERT wiki_spaces + INSERT wiki_memberships)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, category_id, cover_image_url, media_id } = req.body;
    const userId = Number(req.user.user_id);

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

    // Explicit BEGIN -> COMMIT / ROLLBACK transaction
    const newWiki = await executeTransaction(async (client) => {
      const createdRes = await client.query(
        `INSERT INTO wiki_spaces (
          title, slug, description, creator_id, category_id, cover_image_url, media_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING wiki_id, title, slug;`,
        [
          title.trim(),
          slug,
          description || null,
          userId,
          category_id ? Number(category_id) : null,
          cover_image_url || null,
          media_id ? Number(media_id) : null
        ]
      );
      const wiki = createdRes.rows[0];

      await client.query(
        `INSERT INTO wiki_memberships (user_id, wiki_id, role)
         VALUES ($1, $2, 'author'::wiki_role_enum);`,
        [userId, wiki.wiki_id]
      );

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

// 4. UPDATE COVER
router.patch('/:wikiId/cover', authenticateToken, async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);
    const { cover_image_url, media_id } = req.body;
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    const wikis = await prisma.$queryRaw`
      SELECT creator_id::INT AS creator_id FROM wiki_spaces WHERE wiki_id = ${wikiId} LIMIT 1;
    `;
    if (wikis.length === 0) return res.status(404).json({ success: false, message: 'Wiki space not found' });

    const isCreator = wikis[0].creator_id === userId;
    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${wikiId} AND user_id = ${userId} LIMIT 1;
    `;

    if (!isGlobal && !isCreator && membership.length === 0) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await prisma.$executeRaw`
      UPDATE wiki_spaces
      SET cover_image_url = ${cover_image_url || null},
          media_id = ${media_id ? Number(media_id) : null}
      WHERE wiki_id = ${wikiId};
    `;

    res.status(200).json({
      success: true,
      cover_image_url: cover_image_url || null,
      message: cover_image_url ? 'Wiki cover image updated.' : 'Wiki cover image removed.'
    });
  } catch (error) {
    console.error('Update wiki cover error:', error);
    res.status(500).json({ success: false, message: 'Failed to update wiki cover' });
  }
});

// 5. GET WIKI PUBLIC
router.get('/public/:slug', optionalAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user?.user_id ? Number(req.user.user_id) : null;

    const wikis = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title,
        w.slug,
        w.description,
        COALESCE(w.cover_image_url, m.file_url) AS cover_image_url,
        w.total_views::INT AS total_views,
        w.category_id::INT AS category_id,
        w.creator_id::INT AS creator_id,
        w.created_at,
        c.name AS category_name,
        (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE) AS article_count,
        (SELECT COUNT(*)::INT FROM user_wiki_follows uwf WHERE uwf.wiki_id = w.wiki_id) AS follower_count,
        (SELECT COUNT(*)::INT FROM wiki_memberships wm WHERE wm.wiki_id = w.wiki_id) AS author_count
      FROM wiki_spaces w
      LEFT JOIN categories c ON w.category_id = c.category_id
      LEFT JOIN media m ON w.media_id = m.media_id
      WHERE w.slug = ${slug}
      LIMIT 1;
    `;

    if (wikis.length === 0) return res.status(404).json({ success: false, message: 'Wiki space not found' });
    const wiki = wikis[0];

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

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        COALESCE(a.description, '') AS description,
        a.thumbnail_url,
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

    let similarWikis = [];
    if (wiki.category_id) {
      similarWikis = await prisma.$queryRaw`
        SELECT 
          w.wiki_id::INT AS wiki_id,
          w.title,
          w.slug,
          w.description,
          COALESCE(w.cover_image_url, m.file_url) AS cover_image_url,
          w.total_views::INT AS total_views,
          (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE) AS article_count
        FROM wiki_spaces w
        LEFT JOIN media m ON w.media_id = m.media_id
        WHERE w.category_id = ${wiki.category_id} AND w.wiki_id <> ${wiki.wiki_id}
        ORDER BY w.total_views DESC
        LIMIT 4;
      `;
    }

    res.status(200).json({
      success: true,
      wiki: { ...wiki, userRole, isFollowingWiki, isFollowingCategory },
      articles,
      similarWikis
    });
  } catch (error) {
    console.error('Fetch wiki hub error:', error);
    res.status(500).json({ success: false, message: 'Failed to load wiki space' });
  }
});

// 6. DELETE WIKI SPACE (Explicit Transaction: Cascading Deletions Across All Related Tables)
router.delete('/:wikiId', authenticateToken, async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    const wikis = await prisma.$queryRaw`
      SELECT wiki_id::INT AS wiki_id, title, creator_id::INT AS creator_id FROM wiki_spaces WHERE wiki_id = ${wikiId} LIMIT 1;
    `;

    if (wikis.length === 0) return res.status(404).json({ success: false, message: 'Wiki space not found' });
    const wiki = wikis[0];

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${wikiId} AND user_id = ${userId} AND role = 'author'::wiki_role_enum LIMIT 1;
    `;

    const isPrimaryAuthor = membership.length > 0 || wiki.creator_id === userId;
    if (!isGlobal && !isPrimaryAuthor) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Explicit BEGIN -> COMMIT / ROLLBACK transaction
    await executeTransaction(async (client) => {
      await client.query(`DELETE FROM article_media WHERE article_id IN (SELECT article_id FROM articles WHERE wiki_id = $1);`, [wikiId]);
      await client.query(`DELETE FROM reading_list_items WHERE article_id IN (SELECT article_id FROM articles WHERE wiki_id = $1);`, [wikiId]);
      await client.query(`DELETE FROM reports WHERE article_id IN (SELECT article_id FROM articles WHERE wiki_id = $1);`, [wikiId]);
      await client.query(`DELETE FROM article_versions WHERE article_id IN (SELECT article_id FROM articles WHERE wiki_id = $1);`, [wikiId]);
      await client.query(`DELETE FROM articles WHERE wiki_id = $1;`, [wikiId]);
      await client.query(`DELETE FROM user_wiki_follows WHERE wiki_id = $1;`, [wikiId]);
      await client.query(`DELETE FROM wiki_memberships WHERE wiki_id = $1;`, [wikiId]);
      await client.query(`DELETE FROM wiki_spaces WHERE wiki_id = $1;`, [wikiId]);
    });

    res.status(200).json({
      success: true,
      message: `Wiki space "${wiki.title}" and all nested articles have been permanently deleted.`
    });
  } catch (error) {
    console.error('Delete wiki error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete wiki space' });
  }
});

// 7. ASSIGN CO-AUTHOR
router.post('/:wikiId/members', authenticateToken, authorizeWikiAccess('author'), async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'User email is required' });

    const users = await prisma.$queryRaw`
      SELECT user_id::INT AS user_id, username, email, is_banned FROM users WHERE LOWER(email) = ${email.trim().toLowerCase()} LIMIT 1;
    `;
    if (users.length === 0) return res.status(404).json({ success: false, message: 'No registered user found with that email' });

    const targetUser = users[0];
    if (targetUser.is_banned) return res.status(400).json({ success: false, message: 'Cannot assign a banned user' });

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

// 8. GET MEMBERS
router.get('/:wikiId/members', authenticateToken, authorizeWikiAccess('co_author'), async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);
    const members = await prisma.$queryRaw`
      SELECT u.user_id::INT AS user_id, u.username, u.email, wm.role, wm.assigned_at
      FROM wiki_memberships wm INNER JOIN users u ON wm.user_id = u.user_id
      WHERE wm.wiki_id = ${wikiId} ORDER BY wm.role ASC, u.username ASC;
    `;
    res.status(200).json({ success: true, members });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load wiki members' });
  }
});

// 9. TOGGLE FOLLOW WIKI
router.post('/:wikiId/follow', authenticateToken, async (req, res) => {
  try {
    const wikiId = Number(req.params.wikiId);
    const userId = Number(req.user.user_id);

    const existing = await prisma.$queryRaw`
      SELECT user_id FROM user_wiki_follows WHERE wiki_id = ${wikiId} AND user_id = ${userId} LIMIT 1;
    `;

    if (existing.length > 0) {
      await prisma.$executeRaw`DELETE FROM user_wiki_follows WHERE wiki_id = ${wikiId} AND user_id = ${userId};`;
      return res.status(200).json({ success: true, following: false, message: 'Unfollowed wiki' });
    } else {
      await prisma.$executeRaw`INSERT INTO user_wiki_follows (user_id, wiki_id) VALUES (${userId}, ${wikiId});`;
      return res.status(200).json({ success: true, following: true, message: 'Following wiki' });
    }
  } catch (error) {
    console.error('Toggle wiki follow error:', error);
    res.status(500).json({ success: false, message: 'Failed to update follow state' });
  }
});

// 10. TOGGLE FOLLOW CATEGORY
router.post('/categories/:categoryId/follow', authenticateToken, async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    const userId = Number(req.user.user_id);

    const existing = await prisma.$queryRaw`
      SELECT user_id FROM user_category_follows WHERE category_id = ${categoryId} AND user_id = ${userId} LIMIT 1;
    `;

    if (existing.length > 0) {
      await prisma.$executeRaw`DELETE FROM user_category_follows WHERE category_id = ${categoryId} AND user_id = ${userId};`;
      return res.status(200).json({ success: true, following: false, message: 'Unfollowed category' });
    } else {
      await prisma.$executeRaw`INSERT INTO user_category_follows (user_id, category_id) VALUES (${userId}, ${categoryId});`;
      return res.status(200).json({ success: true, following: true, message: 'Following category' });
    }
  } catch (error) {
    console.error('Toggle category follow error:', error);
    res.status(500).json({ success: false, message: 'Failed to update category follow' });
  }
});

export default router;