import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/home/for-you (Authenticated Only)
router.get('/for-you', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const articles = await prisma.$queryRaw`
      SELECT DISTINCT
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        a.read_count::INT AS read_count,
        a.created_at,
        w.wiki_id::INT AS wiki_id,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        c.name AS category_name,
        u.username AS author_name,
        av.version_number::INT AS version_number,
        COALESCE(
          (av.content->'blocks'->0->'data'->>'text'),
          (av.content->'blocks'->0->>'text'),
          'No preview available.'
        ) AS excerpt
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      INNER JOIN categories c ON a.category_id = c.category_id
      INNER JOIN article_versions av ON a.article_id = av.article_id AND av.is_published = TRUE
      LEFT JOIN users u ON av.editor_id = u.user_id
      LEFT JOIN user_category_follows ucf ON c.category_id = ucf.category_id AND ucf.user_id = ${userId}
      LEFT JOIN user_wiki_follows uwf ON w.wiki_id = uwf.wiki_id AND uwf.user_id = ${userId}
      WHERE a.is_published = TRUE
        AND (ucf.user_id IS NOT NULL OR uwf.user_id IS NOT NULL)
      ORDER BY a.created_at DESC
      LIMIT 25;
    `;

    res.status(200).json({ success: true, articles });
  } catch (error) {
    console.error('For you feed error:', error);
    res.status(500).json({ success: false, message: 'Failed to load personalized feed' });
  }
});

export default router;