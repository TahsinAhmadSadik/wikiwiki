import express from 'express';
import { prisma } from '../lib/prisma.js';
import { withTransaction } from '../lib/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 1. SUBMIT REPORT
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { article_id, version_id, reason } = req.body;
    const reporterId = req.user.user_id;

    if (!article_id || !reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Article ID and reason are required' });
    }

    // Check for existing pending report by this user on this article
    const existing = await prisma.$queryRaw`
      SELECT report_id 
      FROM reports 
      WHERE article_id = ${Number(article_id)} 
        AND reporter_id = ${reporterId} 
        AND status = 'pending'
      LIMIT 1;
    `;

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have an unresolved report pending for this article.'
      });
    }

await withTransaction(async (client) => {
  await client.query(
    `
      INSERT INTO reports (
        article_id,
        version_id,
        reporter_id,
        reason,
        status
      )
      VALUES ($1, $2, $3, $4, 'pending')
    `,
    [
      Number(article_id),
      version_id ? Number(version_id) : null,
      reporterId,
      reason.trim()
    ]
  );
});

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Administrators and wiki authors will review the issue.'
    });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to submit report' });
  }
});

// 2. GET PENDING REPORTS
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    let reports;
    if (isGlobal) {
      reports = await prisma.$queryRaw`
        SELECT 
          r.report_id::INT AS report_id,
          r.article_id::INT AS article_id,
          r.version_id::INT AS version_id,
          r.reason,
          r.status,
          r.created_at,
          u.username AS reporter_name,
          a.title AS article_title,
          a.slug AS article_slug,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          av.version_number::INT AS version_number,
          ed.user_id::INT AS editor_id,
          ed.username AS editor_name,
          ed.demerit_points::INT AS editor_demerits
        FROM reports r
        INNER JOIN articles a ON r.article_id = a.article_id
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN users u ON r.reporter_id = u.user_id
        LEFT JOIN article_versions av ON r.version_id = av.version_id
        LEFT JOIN users ed ON av.editor_id = ed.user_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC;
      `;
    } else {
      reports = await prisma.$queryRaw`
        SELECT 
          r.report_id::INT AS report_id,
          r.article_id::INT AS article_id,
          r.version_id::INT AS version_id,
          r.reason,
          r.status,
          r.created_at,
          u.username AS reporter_name,
          a.title AS article_title,
          a.slug AS article_slug,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          av.version_number::INT AS version_number,
          ed.user_id::INT AS editor_id,
          ed.username AS editor_name,
          ed.demerit_points::INT AS editor_demerits
        FROM reports r
        INNER JOIN articles a ON r.article_id = a.article_id
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN users u ON r.reporter_id = u.user_id
        INNER JOIN wiki_memberships wm ON w.wiki_id = wm.wiki_id
        LEFT JOIN article_versions av ON r.version_id = av.version_id
        LEFT JOIN users ed ON av.editor_id = ed.user_id
        WHERE wm.user_id = ${userId} AND r.status = 'pending'
        ORDER BY r.created_at ASC;
      `;
    }

    res.status(200).json({ success: true, reports });
  } catch (error) {
    console.error('Fetch reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to load reports' });
  }
});

// 3. RESOLVE REPORT (CALLS STORED PROCEDURE)
router.post('/:reportId/resolve', authenticateToken, async (req, res) => {
  try {
    const reportId = Number(req.params.reportId);
    const resolverId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    const { action, demerit_points = 0 } = req.body;

    if (!['resolved', 'dismissed'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be "resolved" or "dismissed"' });
    }

    const reportRows = await prisma.$queryRaw`
      SELECT r.report_id, a.wiki_id
      FROM reports r
      INNER JOIN articles a ON r.article_id = a.article_id
      WHERE r.report_id = ${reportId}
      LIMIT 1;
    `;

    if (reportRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const report = reportRows[0];

    if (!isGlobal) {
      const membership = await prisma.$queryRaw`
        SELECT role FROM wiki_memberships WHERE wiki_id = ${report.wiki_id} AND user_id = ${resolverId} LIMIT 1;
      `;
      if (membership.length === 0) {
        return res.status(403).json({ success: false, message: 'Forbidden: You do not manage this wiki' });
      }
    }

    const demerits = action === 'resolved' ? Number(demerit_points) : 0;
await withTransaction(async (client) => {
  await client.query(
    `
      CALL sp_resolve_report_and_penalize(
        $1,
        $2,
        $3,
        $4
      )
    `,
    [
      reportId,
      resolverId,
      action,
      demerits
    ]
  );
});

    res.status(200).json({
      success: true,
      message: action === 'resolved'
        ? `Report resolved with ${demerits} demerit points issued.`
        : 'Report dismissed with no action taken.'
    });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resolve report via stored procedure'
    });
  }
});

export default router;