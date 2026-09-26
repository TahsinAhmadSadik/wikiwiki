import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 1. GET USER'S READING LISTS WITH ITEM COUNTS
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);

    const lists = await prisma.$queryRaw`
      SELECT 
        rl.list_id::INT AS list_id,
        rl.title,
        rl.description,
        rl.is_private,
        rl.created_at,
        COUNT(rli.article_id)::INT AS article_count
      FROM reading_lists rl
      LEFT JOIN reading_list_items rli ON rl.list_id = rli.list_id
      WHERE rl.user_id = ${userId}
      GROUP BY rl.list_id, rl.title, rl.description, rl.is_private, rl.created_at
      ORDER BY rl.created_at DESC;
    `;

    res.status(200).json({ success: true, lists });
  } catch (error) {
    console.error('Fetch reading lists error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load reading lists' });
  }
});

// 2. CHECK WHICH LISTS CONTAIN A GIVEN ARTICLE
router.get('/article-status/:articleId', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const articleId = Number(req.params.articleId);

    const lists = await prisma.$queryRaw`
      SELECT 
        rl.list_id::INT AS list_id,
        rl.title,
        CASE WHEN rli.article_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_article
      FROM reading_lists rl
      LEFT JOIN reading_list_items rli ON rl.list_id = rli.list_id AND rli.article_id = ${articleId}
      WHERE rl.user_id = ${userId}
      ORDER BY rl.title ASC;
    `;

    res.status(200).json({ success: true, lists });
  } catch (error) {
    console.error('Check article list status error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to check list status' });
  }
});

// 3. CREATE NEW READING LIST
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const { title, description = '', is_private = true } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'List title is required' });
    }

    const created = await prisma.$queryRaw`
      INSERT INTO reading_lists (user_id, title, description, is_private)
      VALUES (${userId}, ${title.trim()}, ${description.trim()}, ${Boolean(is_private)})
      RETURNING list_id::INT AS list_id, title, description, is_private, created_at;
    `;

    res.status(201).json({ success: true, list: created[0] });
  } catch (error) {
    console.error('Create reading list error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create reading list' });
  }
});

// 4. TOGGLE ARTICLE IN READING LIST
router.post('/:listId/toggle-article', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const listId = Number(req.params.listId);
    const articleId = Number(req.body.article_id);

    if (!articleId) {
      return res.status(400).json({ success: false, message: 'Article ID is required' });
    }

    const listCheck = await prisma.$queryRaw`
      SELECT list_id FROM reading_lists WHERE list_id = ${listId} AND user_id = ${userId} LIMIT 1;
    `;

    if (listCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Reading list not found or unauthorized' });
    }

    const existing = await prisma.$queryRaw`
      SELECT article_id FROM reading_list_items WHERE list_id = ${listId} AND article_id = ${articleId} LIMIT 1;
    `;

    if (existing.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM reading_list_items WHERE list_id = ${listId} AND article_id = ${articleId};
      `;
      return res.status(200).json({ success: true, saved: false, message: 'Removed from reading list' });
    } else {
      await prisma.$executeRaw`
        INSERT INTO reading_list_items (list_id, article_id) VALUES (${listId}, ${articleId});
      `;
      return res.status(200).json({ success: true, saved: true, message: 'Saved to reading list' });
    }
  } catch (error) {
    console.error('Toggle article error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update reading list' });
  }
});

// 5. GET DETAILS AND ARTICLES IN A SPECIFIC READING LIST
router.get('/:listId', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const listId = Number(req.params.listId);

    const lists = await prisma.$queryRaw`
      SELECT list_id::INT AS list_id, title, description, is_private, created_at
      FROM reading_lists
      WHERE list_id = ${listId} AND (user_id = ${userId} OR is_private = FALSE)
      LIMIT 1;
    `;

    if (lists.length === 0) {
      return res.status(404).json({ success: false, message: 'Reading list not found' });
    }

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        a.read_count::INT AS read_count,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        rli.added_at
      FROM reading_list_items rli
      INNER JOIN articles a ON rli.article_id = a.article_id
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      WHERE rli.list_id = ${listId} AND a.is_published = TRUE
      ORDER BY rli.added_at DESC;
    `;

    res.status(200).json({ success: true, list: lists[0], articles });
  } catch (error) {
    console.error('Get list articles error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load reading list items' });
  }
});

// 6. DELETE READING LIST
router.delete('/:listId', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const listId = Number(req.params.listId);

    await prisma.$executeRaw`
      DELETE FROM reading_list_items WHERE list_id = ${listId};
    `;

    const result = await prisma.$executeRaw`
      DELETE FROM reading_lists WHERE list_id = ${listId} AND user_id = ${userId};
    `;

    if (result === 0) {
      return res.status(404).json({ success: false, message: 'List not found or unauthorized' });
    }

    res.status(200).json({ success: true, message: 'Reading list deleted' });
  } catch (error) {
    console.error('Delete reading list error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to delete reading list' });
  }
});

export default router;