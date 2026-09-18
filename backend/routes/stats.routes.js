import express from 'express';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// 1. STAT 1: ALL-TIME TOP READ ARTICLES
router.get('/top-reads', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 6;

    const data = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        COALESCE(a.description, '') AS description,
        a.read_count::INT AS read_count,
        a.created_at,
        w.wiki_id::INT AS wiki_id,
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

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Fetch top reads error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch top read articles' });
  }
});

// 2. STAT 2: TOPIC OVER TIME (INVOKES fn_get_top_articles_by_time_and_topic UDF)
router.get('/topic-performance', async (req, res) => {
  try {
    const categoryId = Number(req.query.category_id);
    const days = Number(req.query.days) || 0;
    const limit = Number(req.query.limit) || 6;

    if (!categoryId || isNaN(categoryId)) {
      return res.status(400).json({ success: false, message: 'Valid category_id is required' });
    }

    const data = await prisma.$queryRaw`
      SELECT 
        f.article_id::INT AS article_id,
        f.title,
        f.slug,
        COALESCE(a.description, '') AS description,
        f.read_count::INT AS read_count,
        f.wiki_title,
        f.wiki_slug,
        f.category_name,
        f.published_version::INT AS published_version
      FROM fn_get_top_articles_by_time_and_topic(
        ${categoryId}::INT,
        ${days}::INT,
        ${limit}::INT
      ) f
      LEFT JOIN articles a ON f.article_id = a.article_id
      ORDER BY f.read_count DESC;
    `;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Topic performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to evaluate topic performance' });
  }
});

// 3. STAT 3: CROSS-TOPIC LEADERBOARD (WINDOW FUNCTION DENSE_RANK)
router.get('/cross-topic-leaderboard', async (req, res) => {
  try {
    const days = Number(req.query.days) || 0;
    const rankLimit = Number(req.query.rank_limit) || 3;

    const data = await prisma.$queryRaw`
      WITH RankedArticles AS (
        SELECT 
          a.article_id::INT AS article_id,
          a.title,
          a.slug,
          COALESCE(a.description, '') AS description,
          a.read_count::INT AS read_count,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          c.name AS category_name,
          DENSE_RANK() OVER (
            PARTITION BY a.category_id 
            ORDER BY a.read_count DESC, a.created_at DESC
          )::INT AS category_rank
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN categories c ON a.category_id = c.category_id
        WHERE a.is_published = TRUE
          AND (${days}::INT = 0 OR a.created_at >= CURRENT_TIMESTAMP - (${days}::TEXT || ' days')::INTERVAL)
      )
      SELECT *
      FROM RankedArticles
      WHERE category_rank <= ${rankLimit}
      ORDER BY category_name ASC, category_rank ASC;
    `;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Cross-topic leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute cross-topic leaderboard' });
  }
});

// 4. STAT 4: WIKI VELOCITY INDEX
router.get('/wiki-velocity', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 4;

    const data = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title,
        w.slug,
        w.description,
        w.total_views::INT AS total_views,
        COUNT(DISTINCT a.article_id)::INT AS total_articles,
        COUNT(DISTINCT uwf.user_id)::INT AS follower_count,
        ROUND(
          (w.total_views::NUMERIC * 0.4) + 
          (COUNT(DISTINCT a.article_id)::NUMERIC * 15.0) + 
          (COUNT(DISTINCT uwf.user_id)::NUMERIC * 25.0),
          1
        )::FLOAT AS velocity_score
      FROM wiki_spaces w
      LEFT JOIN articles a ON w.wiki_id = a.wiki_id AND a.is_published = TRUE
      LEFT JOIN user_wiki_follows uwf ON w.wiki_id = uwf.wiki_id
      GROUP BY w.wiki_id, w.title, w.slug, w.description, w.total_views
      ORDER BY velocity_score DESC, w.total_views DESC
      LIMIT ${limit};
    `;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Wiki velocity error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute wiki velocity' });
  }
});

// 5. STAT 5: CONTENT INTEGRITY & HEALTH SCORE
router.get('/content-health', async (req, res) => {
  try {
    const data = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title AS wiki_title,
        COUNT(DISTINCT a.article_id)::INT AS total_articles,
        COUNT(DISTINCT r.report_id)::INT AS total_reports,
        COUNT(DISTINCT CASE WHEN r.status = 'resolved' THEN r.report_id END)::INT AS resolved_penalties,
        GREATEST(
          0,
          ROUND(
            100.0 - (COUNT(DISTINCT CASE WHEN r.status = 'resolved' THEN r.report_id END)::NUMERIC * 15.0),
            1
          )
        )::FLOAT AS integrity_score
      FROM wiki_spaces w
      LEFT JOIN articles a ON w.wiki_id = a.wiki_id
      LEFT JOIN reports r ON a.article_id = r.article_id
      GROUP BY w.wiki_id, w.title
      ORDER BY integrity_score DESC;
    `;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Content health error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute content health score' });
  }
});

export default router;