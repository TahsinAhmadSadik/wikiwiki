import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

function extractFirstParagraph(content) {
  if (!content) return '';
  const blocks = Array.isArray(content) ? content : content.blocks;
  if (!Array.isArray(blocks)) return '';
  const p = blocks.find((b) => b.type === 'paragraph' && (b.data?.text || b.text));
  if (!p) {
    const anyText = blocks.find((b) => b.data?.text || b.text);
    return anyText ? (anyText.data?.text || anyText.text || '').trim().slice(0, 300) : '';
  }
  return (p.data?.text || p.text || '').trim().slice(0, 300);
}

function extractFirstImage(content) {
  if (!content) return null;
  const blocks = Array.isArray(content) ? content : content.blocks;
  if (!Array.isArray(blocks)) return null;
  const imgBlock = blocks.find((b) => b.type === 'image' && (b.data?.url || b.url));
  return imgBlock ? (imgBlock.data?.url || imgBlock.url || null) : null;
}

// 1. SUBMIT REPORT
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { article_id, version_id, reason } = req.body;
    const reporterId = Number(req.user.user_id);

    if (!article_id || !reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Article ID and reason are required' });
    }

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

    await prisma.$executeRaw`
      INSERT INTO reports (article_id, version_id, reporter_id, reason, status)
      VALUES (
        ${Number(article_id)},
        ${version_id ? Number(version_id) : null},
        ${reporterId},
        ${reason.trim()},
        'pending'
      );
    `;

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully. Administrators and wiki authors will review the issue.'
    });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to submit report' });
  }
});

// 2. GET PENDING REPORTS (Clean query branches without nested raw promises)
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
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
          COALESCE(ed.username, 'Contributor') AS editor_name,
          COALESCE(ed.demerit_points, 0)::INT AS editor_demerits,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'version_id', av2.version_id,
                  'version_number', av2.version_number,
                  'edit_summary', COALESCE(av2.edit_summary, 'No summary'),
                  'is_published', av2.is_published,
                  'created_at', av2.created_at
                ) ORDER BY av2.version_number DESC
              ),
              '[]'::json
            )
            FROM article_versions av2
            WHERE av2.article_id = r.article_id
          ) AS available_versions
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
          COALESCE(ed.username, 'Contributor') AS editor_name,
          COALESCE(ed.demerit_points, 0)::INT AS editor_demerits,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'version_id', av2.version_id,
                  'version_number', av2.version_number,
                  'edit_summary', COALESCE(av2.edit_summary, 'No summary'),
                  'is_published', av2.is_published,
                  'created_at', av2.created_at
                ) ORDER BY av2.version_number DESC
              ),
              '[]'::json
            )
            FROM article_versions av2
            WHERE av2.article_id = r.article_id
          ) AS available_versions
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

// 3. RESOLVE REPORT (Calls Stored Procedure with Optional Rollback)
router.post('/:reportId/resolve', authenticateToken, async (req, res) => {
  try {
    const reportId = Number(req.params.reportId);
    const resolverId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    const { action, demerit_points = 0, rollback_version_id = null } = req.body;

    if (!['resolved', 'dismissed'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be "resolved" or "dismissed"' });
    }

    const reportRows = await prisma.$queryRaw`
      SELECT r.report_id, r.article_id, a.wiki_id
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
    const rollbackVerId = (action === 'resolved' && rollback_version_id) ? Number(rollback_version_id) : null;

    await prisma.$executeRaw`
      CALL sp_resolve_report_and_penalize(
          ${reportId}::BIGINT,
          ${resolverId}::BIGINT,
          ${action}::TEXT,
          ${demerits}::BIGINT,
          ${rollbackVerId}::BIGINT
      );
    `;

    if (rollbackVerId) {
      const verData = await prisma.$queryRaw`
        SELECT content FROM article_versions WHERE version_id = ${rollbackVerId} LIMIT 1;
      `;
      if (verData.length > 0) {
        const excerpt = extractFirstParagraph(verData[0].content);
        const thumbnail = extractFirstImage(verData[0].content);
        await prisma.$executeRaw`
          UPDATE articles
          SET description = ${excerpt}, thumbnail_url = ${thumbnail}
          WHERE article_id = ${report.article_id};
        `;
      }
    }

    let successMsg = action === 'resolved'
      ? `Report resolved with ${demerits} demerit points issued.`
      : 'Report dismissed with no action taken.';

    if (rollbackVerId) {
      successMsg += ' Article successfully rolled back to chosen version.';
    }

    res.status(200).json({ success: true, message: successMsg });
  } catch (error) {
    console.error('Resolve report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resolve report via stored procedure'
    });
  }
});

export default router;