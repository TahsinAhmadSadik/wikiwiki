import express from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/home/for-you (Personalized feed with automatic trending fallback)
router.get('/for-you', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.user_id ? Number(req.user.user_id) : null;

    let followedCategories = [];
    let followedWikis = [];

    if (userId) {
      followedCategories = await prisma.$queryRaw`
        SELECT c.category_id::INT AS category_id, c.name
        FROM categories c
        INNER JOIN user_category_follows ucf ON c.category_id = ucf.category_id
        WHERE ucf.user_id = ${userId};
      `;

      followedWikis = await prisma.$queryRaw`
        SELECT w.wiki_id::INT AS wiki_id, w.title, w.slug
        FROM wiki_spaces w
        INNER JOIN user_wiki_follows uwf ON w.wiki_id = uwf.wiki_id
        WHERE uwf.user_id = ${userId};
      `;
    }

    let articles = [];

    // 1. If user has active follows, retrieve articles from followed spaces and genres
    if (userId && (followedCategories.length > 0 || followedWikis.length > 0)) {
      articles = await prisma.$queryRaw`
        SELECT DISTINCT
          a.article_id::INT AS article_id,
          a.title,
          a.slug,
          COALESCE(a.description, '') AS description,
          a.read_count::INT AS read_count,
          a.created_at,
          w.wiki_id::INT AS wiki_id,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          c.name AS category_name,
          (
            SELECT COALESCE(MAX(av.version_number), 1)::INT 
            FROM article_versions av 
            WHERE av.article_id = a.article_id AND av.is_published = TRUE
          ) AS version_number
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        LEFT JOIN categories c ON a.category_id = c.category_id
        LEFT JOIN user_category_follows ucf ON c.category_id = ucf.category_id AND ucf.user_id = ${userId}
        LEFT JOIN user_wiki_follows uwf ON w.wiki_id = uwf.wiki_id AND uwf.user_id = ${userId}
        WHERE a.is_published = TRUE
          AND (ucf.user_id IS NOT NULL OR uwf.user_id IS NOT NULL)
        ORDER BY a.created_at DESC
        LIMIT 25;
      `;
    }

    // 2. Fallback: If user has no follows or matching articles, show latest published articles
    if (articles.length === 0) {
      articles = await prisma.$queryRaw`
        SELECT DISTINCT
          a.article_id::INT AS article_id,
          a.title,
          a.slug,
          COALESCE(a.description, '') AS description,
          a.read_count::INT AS read_count,
          a.created_at,
          w.wiki_id::INT AS wiki_id,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          c.name AS category_name,
          (
            SELECT COALESCE(MAX(av.version_number), 1)::INT 
            FROM article_versions av 
            WHERE av.article_id = a.article_id AND av.is_published = TRUE
          ) AS version_number
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        LEFT JOIN categories c ON a.category_id = c.category_id
        WHERE a.is_published = TRUE
        ORDER BY a.read_count DESC, a.created_at DESC
        LIMIT 10;
      `;
    }

    res.status(200).json({
      success: true,
      articles,
      followedCategories,
      followedWikis
    });
  } catch (error) {
    console.error('For you feed error:', error);
    res.status(500).json({ success: false, message: 'Failed to load personalized feed' });
  }
});

export default router;