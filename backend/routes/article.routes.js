import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// CREATE ARTICLE (POST /api/articles)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { wiki_id, category_id, title, template_type = 'standard', content, edit_summary } = req.body;
    const userId = req.user.user_id;

    if (!wiki_id || !title || !content) {
      return res.status(400).json({ success: false, message: 'Wiki ID, title, and content blocks are required' });
    }

    const slug = title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');

    const existing = await prisma.$queryRaw`
      SELECT article_id FROM articles WHERE wiki_id = ${Number(wiki_id)} AND slug = ${slug} LIMIT 1;
    `;
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An article with this title already exists in this wiki' });
    }

    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${Number(wiki_id)} AND user_id = ${userId} LIMIT 1;
    `;
    const canPublishDirectly = isGlobal || membership.length > 0;

    const result = await prisma.$transaction(async (tx) => {
      const articleRows = await tx.$queryRaw`
        INSERT INTO articles (
          wiki_id,
          category_id,
          title,
          slug,
          template_type,
          is_published
        )
        VALUES (
          ${Number(wiki_id)},
          ${category_id ? Number(category_id) : null},
          ${title.trim()},
          ${slug},
          ${template_type},
          ${canPublishDirectly}
        )
        RETURNING article_id::INT AS article_id, wiki_id::INT AS wiki_id, slug, title;
      `;
      const article = articleRows[0];

      await tx.$executeRaw`
        INSERT INTO article_versions (
          article_id,
          editor_id,
          version_number,
          content,
          edit_summary,
          is_published,
          approver_id
        )
        VALUES (
          ${article.article_id},
          ${userId},
          1,
          ${JSON.stringify(content)}::jsonb,
          ${edit_summary || 'Initial creation'},
          ${canPublishDirectly},
          ${canPublishDirectly ? userId : null}
        );
      `;

      return article;
    });

    res.status(201).json({
      success: true,
      message: canPublishDirectly 
        ? 'Article published successfully!' 
        : 'Article draft submitted! It is awaiting review from wiki authors.',
      article: result
    });
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ success: false, message: 'Failed to create article' });
  }
});

// FETCH FOR EDITING (MUST BE ABOVE /:wikiSlug/:articleSlug TO AVOID ROUTE SHADOWING)
router.get('/edit/:articleId', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);

    if (!articleId || isNaN(articleId)) {
      return res.status(400).json({ success: false, message: 'Valid article ID is required' });
    }

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.wiki_id::INT AS wiki_id,
        a.category_id::INT AS category_id,
        a.title,
        a.slug,
        a.template_type,
        a.is_locked,
        w.title AS wiki_title,
        w.slug AS wiki_slug
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      WHERE a.article_id = ${articleId}
      LIMIT 1;
    `;

    if (articles.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    const article = articles[0];
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    if (article.is_locked && !isGlobal) {
      return res.status(403).json({ 
        success: false, 
        message: 'This article is locked and cannot be edited by contributors.' 
      });
    }

    const versions = await prisma.$queryRaw`
      SELECT 
        version_id::INT AS version_id,
        version_number,
        content,
        edit_summary
      FROM article_versions
      WHERE article_id = ${articleId}
      ORDER BY version_number DESC
      LIMIT 1;
    `;

    res.status(200).json({
      success: true,
      article,
      latestVersion: versions[0] || null
    });
  } catch (error) {
    console.error('Fetch article for editing error:', error);
    res.status(500).json({ success: false, message: 'Failed to load article for editing' });
  }
});

// COMMIT NEW VERSION (POST /api/articles/:articleId/versions)
router.post('/:articleId/versions', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const { content, edit_summary } = req.body;
    const userId = req.user.user_id;

    if (!content) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const articles = await prisma.$queryRaw`
      SELECT article_id::INT AS article_id, wiki_id::INT AS wiki_id, is_locked
      FROM articles WHERE article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    const article = articles[0];

    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    if (article.is_locked && !isGlobal) {
      return res.status(403).json({ success: false, message: 'This article is locked from editing' });
    }

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;
    const canPublishDirectly = isGlobal || membership.length > 0;

    const maxVer = await prisma.$queryRaw`
      SELECT COALESCE(MAX(version_number), 0)::INT AS next_num
      FROM article_versions
      WHERE article_id = ${articleId};
    `;
    const nextVersion = maxVer[0].next_num + 1;

    await prisma.$executeRaw`
      INSERT INTO article_versions (
        article_id,
        editor_id,
        version_number,
        content,
        edit_summary,
        is_published,
        approver_id
      )
      VALUES (
        ${articleId},
        ${userId},
        ${nextVersion},
        ${JSON.stringify(content)}::jsonb,
        ${edit_summary || 'Update version ' + nextVersion},
        ${canPublishDirectly},
        ${canPublishDirectly ? userId : null}
      );
    `;

    res.status(201).json({
      success: true,
      message: canPublishDirectly
        ? `Version ${nextVersion} published successfully.`
        : `Version ${nextVersion} submitted for review.`
    });
  } catch (error) {
    console.error('Commit version error:', error);
    res.status(500).json({ success: false, message: 'Failed to commit version' });
  }
});

// GET ARTICLE BY SLUG (PUBLIC READER - MUST BE AT THE BOTTOM)
router.get('/:wikiSlug/:articleSlug', optionalAuth, async (req, res) => {
  try {
    const { wikiSlug, articleSlug } = req.params;

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.wiki_id::INT AS wiki_id,
        a.title,
        a.slug,
        a.template_type,
        a.is_locked,
        a.is_published,
        a.read_count::INT AS read_count,
        a.created_at,
        w.title AS wiki_title,
        w.slug AS wiki_slug
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      WHERE w.slug = ${wikiSlug} AND a.slug = ${articleSlug}
      LIMIT 1;
    `;

    if (articles.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    const article = articles[0];

    const versions = await prisma.$queryRaw`
      SELECT 
        av.version_id::INT AS version_id,
        av.version_number,
        av.content,
        av.edit_summary,
        av.created_at,
        u.username AS author_name
      FROM article_versions av
      LEFT JOIN users u ON av.editor_id = u.user_id
      WHERE av.article_id = ${article.article_id} AND av.is_published = TRUE
      ORDER BY av.version_number DESC
      LIMIT 1;
    `;

    // Increment read counts
    await prisma.$executeRaw`
      UPDATE articles SET read_count = read_count + 1 WHERE article_id = ${article.article_id};
    `;
    await prisma.$executeRaw`
      UPDATE wiki_spaces SET total_views = total_views + 1 WHERE wiki_id = ${article.wiki_id};
    `;

    res.status(200).json({
      success: true,
      article,
      latestVersion: versions[0] || null
    });
  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch article' });
  }
});

// GET PENDING REVISIONS FOR MANAGED WIKIS (For Authors, Co-Authors, and Global Admins)
router.get('/pending-reviews', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    let pending;
    if (isGlobal) {
      pending = await prisma.$queryRaw`
        SELECT 
          av.version_id::INT AS version_id,
          av.version_number,
          av.content,
          av.edit_summary,
          av.created_at,
          a.article_id::INT AS article_id,
          a.title AS article_title,
          a.slug AS article_slug,
          w.wiki_id::INT AS wiki_id,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          u.username AS contributor_name,
          u.email AS contributor_email
        FROM article_versions av
        INNER JOIN articles a ON av.article_id = a.article_id
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN users u ON av.editor_id = u.user_id
        WHERE av.is_published = FALSE
        ORDER BY av.created_at ASC;
      `;
    } else {
      pending = await prisma.$queryRaw`
        SELECT 
          av.version_id::INT AS version_id,
          av.version_number,
          av.content,
          av.edit_summary,
          av.created_at,
          a.article_id::INT AS article_id,
          a.title AS article_title,
          a.slug AS article_slug,
          w.wiki_id::INT AS wiki_id,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          u.username AS contributor_name,
          u.email AS contributor_email
        FROM article_versions av
        INNER JOIN articles a ON av.article_id = a.article_id
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN users u ON av.editor_id = u.user_id
        INNER JOIN wiki_memberships wm ON w.wiki_id = wm.wiki_id
        WHERE wm.user_id = ${userId} AND av.is_published = FALSE
        ORDER BY av.created_at ASC;
      `;
    }

    res.status(200).json({ success: true, pending });
  } catch (error) {
    console.error('Pending reviews fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending reviews' });
  }
});

// REVIEW VERSION: APPROVE OR REJECT REVISION
router.post('/versions/:versionId/review', authenticateToken, async (req, res) => {
  try {
    const versionId = Number(req.params.versionId);
    const { action, approval_feedback } = req.body;
    const userId = req.user.user_id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    }

    const versionRecords = await prisma.$queryRaw`
      SELECT 
        av.version_id::INT AS version_id,
        av.article_id::INT AS article_id,
        av.is_published,
        a.wiki_id::INT AS wiki_id
      FROM article_versions av
      INNER JOIN articles a ON av.article_id = a.article_id
      WHERE av.version_id = ${versionId}
      LIMIT 1;
    `;

    if (versionRecords.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const ver = versionRecords[0];
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${ver.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;

    if (!isGlobal && membership.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have authoring permissions to review revisions for this wiki'
      });
    }

    if (action === 'approve') {
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE article_versions
          SET is_published = TRUE,
              approver_id = ${userId},
              approval_feedback = ${approval_feedback || 'Approved by author'}
          WHERE version_id = ${versionId};
        `,
        prisma.$executeRaw`
          UPDATE articles
          SET is_published = TRUE
          WHERE article_id = ${ver.article_id};
        `
      ]);

      return res.status(200).json({
        success: true,
        message: 'Revision approved! The new version is now published live.'
      });
    } else {
      await prisma.$executeRaw`
        DELETE FROM article_versions WHERE version_id = ${versionId};
      `;

      return res.status(200).json({
        success: true,
        message: 'Revision rejected and discarded from review queue.'
      });
    }
  } catch (error) {
    console.error('Review revision error:', error);
    res.status(500).json({ success: false, message: 'Failed to process revision review' });
  }
});

export default router;