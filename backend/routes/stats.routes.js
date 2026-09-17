import express from 'express';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// ----------------------------------------------------------------------------
// STAT 1: All-Time Best Articles by Read Count
// ----------------------------------------------------------------------------
router.get('/top-reads', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        a.read_count::INT AS read_count,
        a.created_at,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        c.name AS category_name,
        (
          SELECT COALESCE(MAX(av.version_number), 1)::INT 
          FROM article_versions av 
          WHERE av.article_id = a.article_id AND av.is_published = TRUE
        ) AS published_version
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      LEFT JOIN categories c ON a.category_id = c.category_id
      WHERE a.is_published = TRUE
      ORDER BY a.read_count DESC, a.created_at DESC
      LIMIT ${limit};
    `;

    res.status(200).json({ success: true, data: articles });
  } catch (error) {
    console.error('Top reads error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch top read articles' });
  }
});

// ----------------------------------------------------------------------------
// STAT 2: Given a Topic, Show Best Articles Across Different Time Periods
// (Uses PostgreSQL UDF: fn_get_top_articles_by_time_and_topic)
// ----------------------------------------------------------------------------
router.get('/topic-performance', async (req, res) => {
  try {
    const categoryId = Number(req.query.category_id);
    const days = Number(req.query.days) || 0; // 0 = all-time, 7 = weekly, 30 = monthly
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    if (!categoryId || isNaN(categoryId)) {
      return res.status(400).json({ success: false, message: 'Valid category_id is required' });
    }

    const articles = await prisma.$queryRaw`
      SELECT * 
      FROM fn_get_top_articles_by_time_and_topic(${categoryId}, ${days}, ${limit});
    `;

    res.status(200).json({ success: true, data: articles });
  } catch (error) {
    console.error('Topic performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch topic performance metrics' });
  }
});

// ----------------------------------------------------------------------------
// STAT 3: Given a Time Period, Show Best Articles Across Different Topics
// (Uses SQL Window Function: DENSE_RANK partition by category)
// ----------------------------------------------------------------------------
router.get('/cross-topic-leaderboard', async (req, res) => {
  try {
    const days = Number(req.query.days) || 30; // Default past 30 days
    const rankLimit = Math.min(Number(req.query.rank_limit) || 3, 5);

    const matrix = await prisma.$queryRaw`
      WITH RankedArticles AS (
        SELECT 
          a.article_id::INT AS article_id,
          a.title,
          a.slug,
          a.read_count::INT AS read_count,
          a.created_at,
          c.category_id::INT AS category_id,
          c.name AS category_name,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          DENSE_RANK() OVER (
            PARTITION BY a.category_id 
            ORDER BY a.read_count DESC, a.created_at DESC
          )::INT AS category_rank
        FROM articles a
        INNER JOIN categories c ON a.category_id = c.category_id
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        WHERE a.is_published = TRUE
          AND (${days} <= 0 OR a.created_at >= (CURRENT_TIMESTAMP - (${days} || ' days')::INTERVAL))
      )
      SELECT *
      FROM RankedArticles
      WHERE category_rank <= ${rankLimit}
      ORDER BY category_name ASC, category_rank ASC;
    `;

    res.status(200).json({ success: true, data: matrix });
  } catch (error) {
    console.error('Cross-topic leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate cross-topic rankings' });
  }
});

// ----------------------------------------------------------------------------
// STAT 4: Wiki Space Velocity & Community Engagement Index
// ----------------------------------------------------------------------------
router.get('/wiki-velocity', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 8, 20);

    const wikis = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title,
        w.slug,
        w.description,
        w.total_views::INT AS total_views,
        COUNT(DISTINCT a.article_id)::INT AS total_articles,
        COUNT(DISTINCT uwf.user_id)::INT AS total_followers,
        ROUND(
          (w.total_views::NUMERIC / GREATEST(COUNT(DISTINCT a.article_id), 1)) + 
          (COUNT(DISTINCT uwf.user_id) * 4), 
          2
        )::FLOAT AS velocity_score
      FROM wiki_spaces w
      LEFT JOIN articles a ON w.wiki_id = a.wiki_id AND a.is_published = TRUE
      LEFT JOIN user_wiki_follows uwf ON w.wiki_id = uwf.wiki_id
      GROUP BY w.wiki_id, w.title, w.slug, w.description, w.total_views
      ORDER BY velocity_score DESC, total_views DESC
      LIMIT ${limit};
    `;

    res.status(200).json({ success: true, data: wikis });
  } catch (error) {
    console.error('Wiki velocity error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate wiki velocity' });
  }
});

// ----------------------------------------------------------------------------
// STAT 5: Content Health & Quality Integrity Score
// ----------------------------------------------------------------------------
router.get('/content-health', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 30);

    const health = await prisma.$queryRaw`
      SELECT 
        w.wiki_id::INT AS wiki_id,
        w.title,
        w.slug,
        COUNT(DISTINCT a.article_id)::INT AS article_count,
        COUNT(DISTINCT r.report_id)::INT AS total_reports,
        COUNT(DISTINCT CASE WHEN r.status = 'resolved' THEN r.report_id END)::INT AS resolved_reports,
        COUNT(DISTINCT CASE WHEN r.status = 'pending' THEN r.report_id END)::INT AS pending_reports,
        CASE 
          WHEN COUNT(DISTINCT a.article_id) = 0 THEN 100.0
          ELSE ROUND(
            GREATEST(0, 100 - ((COUNT(DISTINCT r.report_id)::NUMERIC / COUNT(DISTINCT a.article_id)) * 12)), 
            1
          )::FLOAT
        END AS integrity_score
      FROM wiki_spaces w
      LEFT JOIN articles a ON w.wiki_id = a.wiki_id
      LEFT JOIN reports r ON a.article_id = r.article_id
      GROUP BY w.wiki_id, w.title, w.slug
      HAVING COUNT(DISTINCT a.article_id) > 0
      ORDER BY integrity_score DESC, article_count DESC
      LIMIT ${limit};
    `;

    res.status(200).json({ success: true, data: health });
  } catch (error) {
    console.error('Content health error:', error);
    res.status(500).json({ success: false, message: 'Failed to evaluate content health metrics' });
  }
});

export default router;