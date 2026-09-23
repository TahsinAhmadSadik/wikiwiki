import express from 'express';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// GET /api/stats/wiki-velocity (Trending Wiki Spaces on Homepage)
router.get('/wiki-velocity', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 4, 1), 20);

    const wikis = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title,
        w.slug,
        COALESCE(w.description, '') AS description,
        COALESCE(w.cover_image_url, m.file_url) AS cover_image_url,
        w.total_views::INT AS total_views,
        (
          SELECT COUNT(*)::INT 
          FROM articles a 
          WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE
        ) AS total_articles,
        (
          SELECT COUNT(*)::INT 
          FROM user_wiki_follows uwf 
          WHERE uwf.wiki_id = w.wiki_id
        ) AS follower_count,
        ROUND(
          (
            COALESCE(w.total_views, 0) * 0.4 + 
            (SELECT COUNT(*) FROM user_wiki_follows uwf WHERE uwf.wiki_id = w.wiki_id) * 15 +
            (SELECT COUNT(*) FROM articles a WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE) * 10
          )::NUMERIC, 
          1
        )::FLOAT AS velocity_score
      FROM wiki_spaces w
      LEFT JOIN media m ON w.media_id = m.media_id
      ORDER BY velocity_score DESC, w.total_views DESC
      LIMIT ${limit};
    `;

    res.status(200).json({ success: true, data: wikis });
  } catch (error) {
    console.error('Fetch wiki velocity error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate trending wiki velocity' });
  }
});

// GET /api/stats/top-reads (Stat 1 on Homepage)
router.get('/top-reads', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 20);

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        a.thumbnail_url,
        a.read_count::INT AS read_count,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        c.name AS category_name
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      LEFT JOIN categories c ON a.category_id = c.category_id
      WHERE a.is_published = TRUE
      ORDER BY a.read_count DESC, a.created_at DESC
      LIMIT ${limit};
    `;

    res.status(200).json({ success: true, data: articles });
  } catch (error) {
    console.error('Fetch top reads error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch top reads' });
  }
});

// GET /api/stats/topic-performance (Stat 2 on Homepage via UDF)
router.get('/topic-performance', async (req, res) => {
  try {
    const categoryId = Number(req.query.category_id);
    const days = Number(req.query.days) || 30;
    const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 20);

    if (!categoryId || isNaN(categoryId)) {
      return res.status(400).json({ success: false, message: 'Valid category_id is required' });
    }

    let articles = [];
    try {
      // Primary execution via UDF with explicit type casting
      articles = await prisma.$queryRaw`
        SELECT * FROM fn_get_top_articles_by_time_and_topic(
          ${categoryId}::BIGINT, 
          ${days}::BIGINT, 
          ${limit}::BIGINT
        );
      `;
    } catch (udfErr) {
      console.warn('UDF execution failed, running inline query fallback:', udfErr.message);

      // Direct fallback query in case UDF signature has not been updated in DB
      articles = await prisma.$queryRaw`
        WITH RECURSIVE category_tree AS (
          SELECT category_id FROM categories WHERE category_id = ${categoryId}
          UNION ALL
          SELECT c.category_id 
          FROM categories c
          INNER JOIN category_tree ct ON COALESCE(c.parent_id, c.parent_category_id) = ct.category_id
        )
        SELECT 
          a.article_id::INT AS article_id,
          a.title,
          a.slug,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          cat.name AS category_name,
          a.read_count::INT AS read_count,
          (
            SELECT COALESCE(MAX(av.version_number), 1)::INT 
            FROM article_versions av 
            WHERE av.article_id = a.article_id AND av.is_published = TRUE
          ) AS published_version,
          a.created_at
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN categories cat ON COALESCE(a.category_id, w.category_id) = cat.category_id
        WHERE a.is_published = TRUE
          AND COALESCE(a.category_id, w.category_id) IN (SELECT category_id FROM category_tree)
          AND (${days}::INT <= 0 OR a.created_at >= (CURRENT_TIMESTAMP - (${days}::INT || ' days')::INTERVAL))
        ORDER BY a.read_count DESC, a.created_at DESC
        LIMIT ${limit};
      `;
    }

    res.status(200).json({ success: true, data: articles });
  } catch (error) {
    console.error('Fetch topic performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to execute topic performance query' });
  }
});

// GET /api/stats/cross-topic-leaderboard (Stat 3 on Homepage via Window Function)
router.get('/cross-topic-leaderboard', async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const rankLimit = Math.min(Math.max(Number(req.query.rank_limit) || 2, 1), 10);

    const rankings = await prisma.$queryRaw`
      WITH RankedArticles AS (
        SELECT 
          a.article_id::INT AS article_id,
          a.title,
          a.slug,
          a.thumbnail_url,
          a.read_count::INT AS read_count,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          c.name AS category_name,
          DENSE_RANK() OVER (
            PARTITION BY COALESCE(a.category_id, w.category_id) 
            ORDER BY a.read_count DESC, a.created_at DESC
          )::INT AS category_rank
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
        WHERE a.is_published = TRUE
          AND (${days}::INT <= 0 OR a.created_at >= (CURRENT_TIMESTAMP - (${days}::INT || ' days')::INTERVAL))
      )
      SELECT * 
      FROM RankedArticles 
      WHERE category_rank <= ${rankLimit}
      ORDER BY category_name ASC, category_rank ASC;
    `;

    res.status(200).json({ success: true, data: rankings });
  } catch (error) {
    console.error('Fetch cross topic leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to execute cross-topic window query' });
  }
});


// GET /api/stats/topic-read-distribution
router.get('/topic-read-distribution', async (req, res) => {
  try {
    const distribution = await prisma.$queryRaw`
      SELECT
        c.name AS category_name,
        SUM(a.read_count)::INT AS total_reads
      FROM articles a
      INNER JOIN wiki_spaces w
        ON a.wiki_id = w.wiki_id
      INNER JOIN categories c
        ON c.category_id = COALESCE(a.category_id, w.category_id)
      WHERE a.is_published = TRUE
      GROUP BY c.category_id, c.name
      ORDER BY total_reads DESC;
    `;

    res.status(200).json({
      success: true,
      data: distribution
    });
  } catch (error) {
    console.error('Fetch topic read distribution error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch topic read distribution'
    });
  }
});


















export default router;