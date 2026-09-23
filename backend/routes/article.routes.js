import express from 'express';
import { prisma } from '../lib/prisma.js';
import { withTransaction } from '../lib/db.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

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

function extractMediaIds(content) {
  if (!content) return [];
  const blocks = Array.isArray(content) ? content : content.blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b) => b.type === 'image' && b.data?.media_id)
    .map((b) => Number(b.data.media_id))
    .filter((id) => !isNaN(id) && id > 0);
}

// CREATE ARTICLE (POST /api/articles)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { wiki_id, category_id, title, template_type = 'standard', content, edit_summary } = req.body;
    const userId = Number(req.user.user_id);

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

    const wikiInfo = await prisma.$queryRaw`
      SELECT category_id::INT AS category_id, slug 
      FROM wiki_spaces 
      WHERE wiki_id = ${Number(wiki_id)} 
      LIMIT 1;
    `;
    const resolvedCategoryId = category_id 
      ? Number(category_id) 
      : (wikiInfo[0]?.category_id ? Number(wikiInfo[0].category_id) : null);
    const wikiSlug = wikiInfo[0]?.slug || null;

    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${Number(wiki_id)} AND user_id = ${userId} LIMIT 1;
    `;
    const canPublishDirectly = isGlobal || membership.length > 0;
    const excerpt = extractFirstParagraph(content);
    const thumbnail = extractFirstImage(content);
    const mediaIds = extractMediaIds(content);

const result = await withTransaction(async (client) => {
  const articleResult = await client.query(
    `
      INSERT INTO articles (
        wiki_id,
        category_id,
        title,
        slug,
        description,
        thumbnail_url,
        template_type,
        is_published
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING article_id::INT AS article_id,
                wiki_id::INT AS wiki_id,
                slug,
                title
    `,
    [
      Number(wiki_id),
      resolvedCategoryId,
      title.trim(),
      slug,
      excerpt,
      thumbnail,
      template_type,
      canPublishDirectly
    ]
  );

  const article = articleResult.rows[0];

  await client.query(
    `
      INSERT INTO article_versions (
        article_id,
        editor_id,
        version_number,
        content,
        edit_summary,
        is_published,
        approver_id
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
    `,
    [
      article.article_id,
      userId,
      1,
      JSON.stringify(content),
      edit_summary || 'Initial creation',
      canPublishDirectly,
      canPublishDirectly ? userId : null
    ]
  );

  for (const mId of mediaIds) {
    await client.query(
      `
        INSERT INTO article_media (article_id, media_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [article.article_id, mId]
    );
  }

  return article;
});

    res.status(201).json({
      success: true,
      canPublishDirectly,
      message: canPublishDirectly 
        ? 'Article published successfully!' 
        : 'Article draft submitted! It is awaiting review from wiki authors.',
      article: {
        ...result,
        wiki_slug: wikiSlug
      }
    });
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ success: false, message: 'Failed to create article' });
  }
});

// FETCH FOR EDITING
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
        COALESCE(a.category_id, w.category_id)::INT AS category_id,
        a.title,
        a.slug,
        COALESCE(a.description, '') AS description,
        a.thumbnail_url,
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
        version_number::INT AS version_number,
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

// COMMIT NEW VERSION
router.post('/:articleId/versions', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const { content, edit_summary } = req.body;
    const userId = Number(req.user.user_id);

    if (!content) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id, 
        a.wiki_id::INT AS wiki_id, 
        a.slug AS article_slug, 
        a.is_locked,
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

await withTransaction(async (client) => {
  await client.query(
    `
      INSERT INTO article_versions (
        article_id,
        editor_id,
        version_number,
        content,
        edit_summary,
        is_published,
        approver_id
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
    `,
    [
      articleId,
      userId,
      nextVersion,
      JSON.stringify(content),
      edit_summary || 'Update version ' + nextVersion,
      canPublishDirectly,
      canPublishDirectly ? userId : null
    ]
  );

  if (canPublishDirectly) {
    const excerpt = extractFirstParagraph(content);
    const thumbnail = extractFirstImage(content);
    const mediaIds = extractMediaIds(content);

    await client.query(
      `
        UPDATE articles
        SET description = $1,
            thumbnail_url = $2
        WHERE article_id = $3
      `,
      [excerpt, thumbnail, articleId]
    );

    for (const mId of mediaIds) {
      await client.query(
        `
          INSERT INTO article_media (article_id, media_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [articleId, mId]
      );
    }
  }
});

    res.status(201).json({
      success: true,
      canPublishDirectly,
      wiki_slug: article.wiki_slug,
      article_slug: article.article_slug,
      message: canPublishDirectly
        ? `Version ${nextVersion} published successfully.`
        : `Version ${nextVersion} submitted for review.`
    });
  } catch (error) {
    console.error('Commit version error:', error);
    res.status(500).json({ success: false, message: 'Failed to commit version' });
  }
});

// TOGGLE ARTICLE LOCK STATE
router.patch('/:articleId/lock', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    const articles = await prisma.$queryRaw`
      SELECT article_id::INT AS article_id, wiki_id::INT AS wiki_id, is_locked
      FROM articles WHERE article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    const article = articles[0];

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;

    if (!isGlobal && membership.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Only wiki authors or administrators can lock or unlock articles.'
      });
    }
const updated = await withTransaction(async (client) => {
  const result = await client.query(
    `
      UPDATE articles
      SET is_locked = NOT is_locked
      WHERE article_id = $1
      RETURNING is_locked
    `,
    [articleId]
  );

  return result.rows;
});

    const newState = updated[0].is_locked;
    res.status(200).json({
      success: true,
      is_locked: newState,
      message: newState ? 'Article is now locked from contributor edits.' : 'Article is now unlocked.'
    });
  } catch (error) {
    console.error('Toggle article lock error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle lock status' });
  }
});

// DELETE ARTICLE
router.delete('/:articleId', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    const articles = await prisma.$queryRaw`
      SELECT article_id::INT AS article_id, wiki_id::INT AS wiki_id, title
      FROM articles WHERE article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    const article = articles[0];

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;

    if (!isGlobal && membership.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Only wiki authors or administrators can delete this article.'
      });
    }

await withTransaction(async (client) => {
  await client.query(
    `
      DELETE FROM article_media
      WHERE article_id = $1
    `,
    [articleId]
  );

  await client.query(
    `
      DELETE FROM reading_list_items
      WHERE article_id = $1
    `,
    [articleId]
  );

  await client.query(
    `
      DELETE FROM reports
      WHERE article_id = $1
    `,
    [articleId]
  );

  await client.query(
    `
      DELETE FROM article_versions
      WHERE article_id = $1
    `,
    [articleId]
  );

  await client.query(
    `
      DELETE FROM articles
      WHERE article_id = $1
    `,
    [articleId]
  );
});

    res.status(200).json({
      success: true,
      message: `Article "${article.title}" and all associated revisions have been permanently deleted.`
    });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete article' });
  }
});

// GET ARTICLE BY SLUG
router.get('/:wikiSlug/:articleSlug', optionalAuth, async (req, res) => {
  try {
    const { wikiSlug, articleSlug } = req.params;
    const userId = req.user?.user_id ? Number(req.user.user_id) : null;

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.wiki_id::INT AS wiki_id,
        a.title,
        a.slug,
        COALESCE(a.description, '') AS description,
        a.thumbnail_url,
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

    let userRole = null;
    if (userId) {
      const membership = await prisma.$queryRaw`
        SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
      `;
      if (membership.length > 0) userRole = membership[0].role;
    }

    const versions = await prisma.$queryRaw`
      SELECT 
        av.version_id::INT AS version_id,
        av.version_number::INT AS version_number,
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

await withTransaction(async (client) => {
  await client.query(
    `
      UPDATE articles
      SET read_count = read_count + 1
      WHERE article_id = $1
    `,
    [article.article_id]
  );

  await client.query(
    `
      UPDATE wiki_spaces
      SET total_views = total_views + 1
      WHERE wiki_id = $1
    `,
    [article.wiki_id]
  );
});
    res.status(200).json({
      success: true,
      article: {
        ...article,
        userRole
      },
      latestVersion: versions[0] || null
    });
  } catch (error) {
    console.error('Get article error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch article' });
  }
});

// GET PENDING REVISIONS FOR MANAGED WIKIS
router.get('/pending-reviews', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    let pending;
    if (isGlobal) {
      pending = await prisma.$queryRaw`
        SELECT 
          av.version_id::INT AS version_id,
          av.version_number::INT AS version_number,
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
          av.version_number::INT AS version_number,
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

// REVIEW VERSION
router.post('/versions/:versionId/review', authenticateToken, async (req, res) => {
  try {
    const versionId = Number(req.params.versionId);
    const { action, approval_feedback } = req.body;
    const userId = Number(req.user.user_id);

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    }

    const versionRecords = await prisma.$queryRaw`
      SELECT 
        av.version_id::INT AS version_id,
        av.article_id::INT AS article_id,
        av.content,
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
      const excerpt = extractFirstParagraph(ver.content);
      const thumbnail = extractFirstImage(ver.content);
      const mediaIds = extractMediaIds(ver.content);

     await withTransaction(async (client) => {
  await client.query(
    `
      UPDATE article_versions
      SET is_published = TRUE,
          approver_id = $1,
          approval_feedback = $2
      WHERE version_id = $3
    `,
    [
      userId,
      approval_feedback || 'Approved by author',
      versionId
    ]
  );

  await client.query(
    `
      UPDATE articles
      SET is_published = TRUE,
          description = $1,
          thumbnail_url = $2
      WHERE article_id = $3
    `,
    [
      excerpt,
      thumbnail,
      ver.article_id
    ]
  );

  for (const mId of mediaIds) {
    await client.query(
      `
        INSERT INTO article_media (article_id, media_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [ver.article_id, mId]
    );
  }
});

      return res.status(200).json({
        success: true,
        message: 'Revision approved! The new version is now published live.'
      });
    } else {
    await withTransaction(async (client) => {
  await client.query(
    `
      DELETE FROM article_versions
      WHERE version_id = $1
    `,
    [versionId]
  );
});
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