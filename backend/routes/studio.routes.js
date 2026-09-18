import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/library', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);

    // 1. Articles that have at least one PUBLISHED version authored/edited by this user
    const publishedArticles = await prisma.$queryRaw`
      SELECT DISTINCT
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        COALESCE(a.description, '') AS description,
        a.read_count::INT AS read_count,
        a.created_at,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        (
          SELECT COALESCE(MAX(av2.version_number), 1)::INT 
          FROM article_versions av2 
          WHERE av2.article_id = a.article_id AND av2.is_published = TRUE
        ) AS published_version
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      INNER JOIN article_versions av ON a.article_id = av.article_id
      WHERE av.editor_id = ${userId} AND av.is_published = TRUE
      ORDER BY a.created_at DESC;
    `;

    // 2. Revisions submitted by this user that are WAITING for Author/Co-Author confirmation
    const pendingRevisions = await prisma.$queryRaw`
      SELECT 
        av.version_id::INT AS version_id,
        av.version_number::INT AS version_number,
        av.edit_summary,
        av.approval_feedback,
        av.created_at,
        a.article_id::INT AS article_id,
        a.title AS article_title,
        a.slug AS article_slug,
        w.title AS wiki_title,
        w.slug AS wiki_slug
      FROM article_versions av
      INNER JOIN articles a ON av.article_id = a.article_id
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      WHERE av.editor_id = ${userId} AND av.is_published = FALSE
      ORDER BY av.created_at DESC;
    `;

    // 3. Reports filed on articles edited by this user
    const userReports = await prisma.$queryRaw`
      SELECT 
        r.report_id::INT AS report_id,
        r.status,
        r.reason,
        COALESCE(r.demerit_points, 0)::INT AS demerit_points,
        r.created_at,
        a.title AS article_title,
        a.slug AS article_slug,
        w.slug AS wiki_slug
      FROM reports r
      INNER JOIN articles a ON r.article_id = a.article_id
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      LEFT JOIN article_versions av ON r.version_id = av.version_id
      WHERE av.editor_id = ${userId}
      ORDER BY r.created_at DESC;
    `;

    res.status(200).json({
      success: true,
      published: publishedArticles,
      pending: pendingRevisions,
      reports: userReports
    });
  } catch (error) {
    console.error('Library data error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch library data' });
  }
});

export default router;