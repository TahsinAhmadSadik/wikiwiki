import express from 'express';
import { prisma } from '../lib/prisma.js';
import { executeTransaction } from '../lib/db.js';
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

function extractLinkCandidates(content) {
  if (!content) return [];
  const blocks = Array.isArray(content) ? content : content.blocks;
  if (!Array.isArray(blocks)) return [];

  const candidates = new Set();

  for (const block of blocks) {
    const text = block.data?.text || block.text || '';
    if (typeof text !== 'string') continue;

    const wikiLinkRegex = /\[\[([^\]\vert{}]+)(?:\Vert{}[^\]]+)?\]\]/g;
    let match;
    while ((match = wikiLinkRegex.exec(text)) !== null) {
      const raw = match[1].trim();
      if (raw) candidates.add(raw);
    }

    const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = mdLinkRegex.exec(text)) !== null) {
      const href = match[2].trim();
      const wikiPathMatch = href.match(/\/wiki\/([^\/\s#?]+)\/([^\/\s#?]+)/);
      if (wikiPathMatch) {
        candidates.add(wikiPathMatch[2]);
      } else {
        const simpleSlug = href.replace(/^\/+/, '').split(/[?#]/)[0];
        if (simpleSlug && !simpleSlug.startsWith('http') && !simpleSlug.startsWith('#')) {
          candidates.add(simpleSlug);
        }
      }
    }
  }

  return Array.from(candidates);
}

async function syncArticleLinks(client, sourceArticleId, wikiId, content) {
  const candidates = extractLinkCandidates(content);

  await client.query(`DELETE FROM article_links WHERE source_article_id = $1;`, [sourceArticleId]);
  if (candidates.length === 0) return;

  const targetIds = new Set();

  for (const candidate of candidates) {
    let cleanCandidate = candidate.trim();
    if (cleanCandidate.includes('/')) {
      const parts = cleanCandidate.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length >= 2) cleanCandidate = parts[1];
    }

    const slugified = cleanCandidate.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    const lowerCandidate = cleanCandidate.toLowerCase();

    const matches = await client.query(
      `SELECT article_id
       FROM articles
       WHERE article_id <> $1
         AND is_published = TRUE
         AND (
           slug = $2
           OR slug = $3
           OR LOWER(title) = $4
         )
       ORDER BY CASE WHEN wiki_id = $5 THEN 0 ELSE 1 END
       LIMIT 1;`,
      [sourceArticleId, cleanCandidate, slugified, lowerCandidate, wikiId]
    );

    if (matches.rows.length > 0) {
      targetIds.add(matches.rows[0].article_id);
    }
  }

  for (const targetId of targetIds) {
    await client.query(
      `INSERT INTO article_links (source_article_id, target_article_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING;`,
      [sourceArticleId, targetId]
    );
  }
}

// 1. PREVIEW CARD
router.get('/preview/:wikiSlug/:articleSlug', optionalAuth, async (req, res) => {
  try {
    const { wikiSlug, articleSlug } = req.params;

    const articles = await prisma.$queryRaw`
      SELECT 
        a.article_id::INT AS article_id,
        a.title,
        a.slug,
        COALESCE(a.description, '') AS description,
        a.thumbnail_url,
        a.read_count::INT AS read_count,
        a.created_at,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        c.name AS category_name
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
      WHERE w.slug = ${wikiSlug} AND a.slug = ${articleSlug} AND a.is_published = TRUE
      LIMIT 1;
    `;

    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Article preview not found' });
    res.status(200).json({ success: true, article: articles[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch article preview' });
  }
});

// 2. RESOLVE LINK
router.get('/resolve-link', optionalAuth, async (req, res) => {
  try {
    const { target = '', currentWiki = '' } = req.query;
    const cleanTarget = target.trim();
    if (!cleanTarget) return res.status(400).json({ success: false, message: 'Target identifier required' });

    let wikiSlugPart = null;
    let articleSlugPart = cleanTarget;
    if (cleanTarget.includes('/')) {
      const parts = cleanTarget.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length >= 2) {
        wikiSlugPart = parts[0];
        articleSlugPart = parts[1];
      }
    }

    const slugified = articleSlugPart.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    const lowerTarget = articleSlugPart.toLowerCase();

    let articles;
    if (wikiSlugPart) {
      articles = await prisma.$queryRaw`
        SELECT a.article_id::INT AS article_id, a.title, a.slug, COALESCE(a.description, '') AS description,
               a.thumbnail_url, a.read_count::INT AS read_count, w.title AS wiki_title, w.slug AS wiki_slug, c.name AS category_name
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
        WHERE w.slug = ${wikiSlugPart} AND a.is_published = TRUE
          AND (a.slug = ${articleSlugPart} OR a.slug = ${slugified} OR LOWER(a.title) = ${lowerTarget})
        LIMIT 1;
      `;
    } else {
      articles = await prisma.$queryRaw`
        SELECT a.article_id::INT AS article_id, a.title, a.slug, COALESCE(a.description, '') AS description,
               a.thumbnail_url, a.read_count::INT AS read_count, w.title AS wiki_title, w.slug AS wiki_slug, c.name AS category_name
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
        WHERE a.is_published = TRUE
          AND (a.slug = ${articleSlugPart} OR a.slug = ${slugified} OR LOWER(a.title) = ${lowerTarget})
        ORDER BY CASE WHEN w.slug = ${currentWiki} THEN 0 ELSE 1 END, a.read_count DESC
        LIMIT 1;
      `;
    }

    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Referenced article not found' });
    res.status(200).json({ success: true, article: articles[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to resolve link' });
  }
});

// 3. GET VERSIONS
router.get('/:articleId/versions', optionalAuth, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const versions = await prisma.$queryRaw`
      SELECT av.version_id::INT AS version_id, av.version_number::INT AS version_number, av.edit_summary,
             av.is_published, av.review_status, av.created_at, u.user_id::INT AS editor_id, u.username AS editor_name
      FROM article_versions av
      LEFT JOIN users u ON av.editor_id = u.user_id
      WHERE av.article_id = ${articleId}
      ORDER BY av.version_number DESC;
    `;
    res.status(200).json({ success: true, versions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load article versions' });
  }
});

// 4. ROLLBACK (Explicit Transaction: BEGIN -> Deactivate + Activate Target + Metadata + Links -> COMMIT)
router.post('/:articleId/rollback', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const { version_id } = req.body;
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    if (!version_id) return res.status(400).json({ success: false, message: 'Target version_id is required' });

    const articles = await prisma.$queryRaw`
      SELECT article_id::INT AS article_id, wiki_id::INT AS wiki_id, title, slug FROM articles WHERE article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Article not found' });
    const article = articles[0];

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;
    if (!isGlobal && membership.length === 0) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const versionRows = await prisma.$queryRaw`
      SELECT version_id::INT AS version_id, version_number::INT AS version_number, content
      FROM article_versions WHERE version_id = ${Number(version_id)} AND article_id = ${articleId} LIMIT 1;
    `;
    if (versionRows.length === 0) return res.status(404).json({ success: false, message: 'Target version not found' });

    const targetVersion = versionRows[0];
    const excerpt = extractFirstParagraph(targetVersion.content);
    const thumbnail = extractFirstImage(targetVersion.content);
    const mediaIds = extractMediaIds(targetVersion.content);

    // Explicit BEGIN -> COMMIT / ROLLBACK transaction
    await executeTransaction(async (client) => {
      await client.query(`UPDATE article_versions SET is_published = FALSE WHERE article_id = $1;`, [articleId]);

      await client.query(
        `UPDATE article_versions SET is_published = TRUE, review_status = 'approved' WHERE version_id = $1;`,
        [targetVersion.version_id]
      );

      await client.query(
        `UPDATE articles SET description = $1, thumbnail_url = $2, is_published = TRUE WHERE article_id = $3;`,
        [excerpt, thumbnail, articleId]
      );

      await client.query(`DELETE FROM article_media WHERE article_id = $1;`, [articleId]);
      for (const mId of mediaIds) {
        await client.query(
          `INSERT INTO article_media (article_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [articleId, mId]
        );
      }

      await syncArticleLinks(client, articleId, article.wiki_id, targetVersion.content);
    });

    res.status(200).json({
      success: true,
      message: `Successfully restored and published Version ${targetVersion.version_number}.`,
      version_number: targetVersion.version_number
    });
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({ success: false, message: 'Failed to execute rollback' });
  }
});

// 5. CREATE ARTICLE (Explicit Transaction: BEGIN -> INSERT article + INSERT version + Links -> COMMIT)
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
      SELECT category_id::INT AS category_id, slug FROM wiki_spaces WHERE wiki_id = ${Number(wiki_id)} LIMIT 1;
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
    const initialReviewStatus = canPublishDirectly ? 'approved' : 'pending';
    const excerpt = extractFirstParagraph(content);
    const thumbnail = extractFirstImage(content);
    const mediaIds = extractMediaIds(content);

    // Explicit BEGIN -> COMMIT / ROLLBACK transaction
    const createdArticle = await executeTransaction(async (client) => {
      const artRes = await client.query(
        `INSERT INTO articles (
          wiki_id, category_id, title, slug, description, thumbnail_url, template_type, is_published
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING article_id, wiki_id, slug, title;`,
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
      const article = artRes.rows[0];

      await client.query(
        `INSERT INTO article_versions (
          article_id, editor_id, version_number, content, edit_summary, is_published, review_status, approver_id
        )
        VALUES ($1, $2, 1, $3, $4, $5, $6, $7);`,
        [
          article.article_id,
          userId,
          JSON.stringify(content),
          edit_summary || 'Initial creation',
          canPublishDirectly,
          initialReviewStatus,
          canPublishDirectly ? userId : null
        ]
      );

      for (const mId of mediaIds) {
        await client.query(
          `INSERT INTO article_media (article_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [article.article_id, mId]
        );
      }

      if (canPublishDirectly) {
        await syncArticleLinks(client, article.article_id, Number(wiki_id), content);
      }

  return article;
});

    res.status(201).json({
      success: true,
      canPublishDirectly,
      message: canPublishDirectly ? 'Article published successfully!' : 'Article draft submitted! It is awaiting review.',
      article: { ...createdArticle, wiki_slug: wikiSlug }
    });
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({ success: false, message: 'Failed to create article' });
  }
});

// 6. EDIT FETCH
router.get('/edit/:articleId', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const articles = await prisma.$queryRaw`
      SELECT a.article_id::INT AS article_id, a.wiki_id::INT AS wiki_id, COALESCE(a.category_id, w.category_id)::INT AS category_id,
             a.title, a.slug, COALESCE(a.description, '') AS description, a.thumbnail_url, a.template_type, a.is_locked,
             w.title AS wiki_title, w.slug AS wiki_slug
      FROM articles a INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id WHERE a.article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Article not found' });

    const article = articles[0];
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    if (article.is_locked && !isGlobal) {
      return res.status(403).json({ success: false, message: 'Article is locked.' });
    }

    const versions = await prisma.$queryRaw`
      SELECT version_id::INT AS version_id, version_number::INT AS version_number, content, edit_summary
      FROM article_versions WHERE article_id = ${articleId} ORDER BY version_number DESC LIMIT 1;
    `;

    res.status(200).json({ success: true, article, latestVersion: versions[0] || null });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load article for editing' });
  }
});

// 7. COMMIT NEW VERSION (Explicit Transaction: BEGIN -> Revision Insert + Updates -> COMMIT)
router.post('/:articleId/versions', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const { content, edit_summary } = req.body;
    const userId = Number(req.user.user_id);

    if (!content) return res.status(400).json({ success: false, message: 'Content is required' });

    const articles = await prisma.$queryRaw`
      SELECT a.article_id::INT AS article_id, a.wiki_id::INT AS wiki_id, a.slug AS article_slug, a.is_locked, w.slug AS wiki_slug
      FROM articles a INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id WHERE a.article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Article not found' });
    const article = articles[0];

    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    if (article.is_locked && !isGlobal) {
      return res.status(403).json({ success: false, message: 'Article is locked' });
    }

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;
    const canPublishDirectly = isGlobal || membership.length > 0;
    const reviewStatus = canPublishDirectly ? 'approved' : 'pending';

    const maxVer = await prisma.$queryRaw`
      SELECT COALESCE(MAX(version_number), 0)::INT AS next_num FROM article_versions WHERE article_id = ${articleId};
    `;
    const nextVersion = maxVer[0].next_num + 1;

    // Explicit BEGIN -> COMMIT / ROLLBACK transaction
    await executeTransaction(async (client) => {
      if (canPublishDirectly) {
        await client.query(`UPDATE article_versions SET is_published = FALSE WHERE article_id = $1;`, [articleId]);
      }

      await client.query(
        `INSERT INTO article_versions (
          article_id, editor_id, version_number, content, edit_summary, is_published, review_status, approver_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          articleId,
          userId,
          nextVersion,
          JSON.stringify(content),
          edit_summary || 'Update version ' + nextVersion,
          canPublishDirectly,
          reviewStatus,
          canPublishDirectly ? userId : null
        ]
      );

      if (canPublishDirectly) {
        const excerpt = extractFirstParagraph(content);
        const thumbnail = extractFirstImage(content);
        const mediaIds = extractMediaIds(content);

        await client.query(
          `UPDATE articles SET description = $1, thumbnail_url = $2 WHERE article_id = $3;`,
          [excerpt, thumbnail, articleId]
        );

        for (const mId of mediaIds) {
          await client.query(
            `INSERT INTO article_media (article_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
            [articleId, mId]
          );
        }

        await syncArticleLinks(client, articleId, article.wiki_id, content);
      }
    });

    res.status(201).json({
      success: true,
      canPublishDirectly,
      wiki_slug: article.wiki_slug,
      article_slug: article.article_slug,
      message: canPublishDirectly ? `Version ${nextVersion} published successfully.` : `Version ${nextVersion} submitted for review.`
    });
  } catch (error) {
    console.error('Commit version error:', error);
    res.status(500).json({ success: false, message: 'Failed to commit version' });
  }
});

// 8. LOCK
router.patch('/:articleId/lock', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    const articles = await prisma.$queryRaw`
      SELECT article_id::INT AS article_id, wiki_id::INT AS wiki_id, is_locked FROM articles WHERE article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Article not found' });
    const article = articles[0];

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;
    if (!isGlobal && membership.length === 0) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const updated = await prisma.$queryRaw`
      UPDATE articles SET is_locked = NOT is_locked WHERE article_id = ${articleId} RETURNING is_locked;
    `;

    res.status(200).json({
      success: true,
      is_locked: updated[0].is_locked,
      message: updated[0].is_locked ? 'Article locked.' : 'Article unlocked.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle lock status' });
  }
});

// 9. DELETE ARTICLE (Explicit Transaction: Cascading Cleanup -> COMMIT)
router.delete('/:articleId', authenticateToken, async (req, res) => {
  try {
    const articleId = Number(req.params.articleId);
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    const articles = await prisma.$queryRaw`
      SELECT article_id::INT AS article_id, wiki_id::INT AS wiki_id, title FROM articles WHERE article_id = ${articleId} LIMIT 1;
    `;
    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Article not found' });
    const article = articles[0];

    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;
    if (!isGlobal && membership.length === 0) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Explicit BEGIN -> COMMIT / ROLLBACK transaction
    await executeTransaction(async (client) => {
      await client.query(`DELETE FROM article_links WHERE source_article_id = $1 OR target_article_id = $1;`, [articleId]);
      await client.query(`DELETE FROM article_media WHERE article_id = $1;`, [articleId]);
      await client.query(`DELETE FROM reading_list_items WHERE article_id = $1;`, [articleId]);
      await client.query(`DELETE FROM reports WHERE article_id = $1;`, [articleId]);
      await client.query(`DELETE FROM article_versions WHERE article_id = $1;`, [articleId]);
      await client.query(`DELETE FROM articles WHERE article_id = $1;`, [articleId]);
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

// 10. GET ARTICLE BY SLUG
router.get('/:wikiSlug/:articleSlug', optionalAuth, async (req, res) => {
  try {
    const { wikiSlug, articleSlug } = req.params;
    const requestedVersion = req.query.v ? Number(req.query.v) : null;
    const userId = req.user?.user_id ? Number(req.user.user_id) : null;

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
        a.is_published,
        a.read_count::INT AS read_count,
        a.created_at,
        w.title AS wiki_title,
        w.slug AS wiki_slug,
        c.name AS category_name,
        (
          SELECT COALESCE(MAX(av_pub.version_number), 1)::INT
          FROM article_versions av_pub
          WHERE av_pub.article_id = a.article_id AND av_pub.is_published = TRUE
        ) AS current_published_version
      FROM articles a
      INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
      LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
      WHERE w.slug = ${wikiSlug} AND a.slug = ${articleSlug}
      LIMIT 1;
    `;

    if (articles.length === 0) return res.status(404).json({ success: false, message: 'Article not found' });
    const article = articles[0];

    let userRole = null;
    if (userId) {
      const membership = await prisma.$queryRaw`
        SELECT role FROM wiki_memberships WHERE wiki_id = ${article.wiki_id} AND user_id = ${userId} LIMIT 1;
      `;
      if (membership.length > 0) userRole = membership[0].role;
    }

    let versions;
    let isViewingHistorical = false;

    if (requestedVersion) {
      versions = await prisma.$queryRaw`
        SELECT av.version_id::INT AS version_id, av.version_number::INT AS version_number, av.content,
               av.edit_summary, av.is_published, av.review_status, av.created_at, u.username AS author_name
        FROM article_versions av LEFT JOIN users u ON av.editor_id = u.user_id
        WHERE av.article_id = ${article.article_id} AND av.version_number = ${requestedVersion} LIMIT 1;
      `;
      isViewingHistorical = true;
    } else {
      versions = await prisma.$queryRaw`
        SELECT av.version_id::INT AS version_id, av.version_number::INT AS version_number, av.content,
               av.edit_summary, av.is_published, av.review_status, av.created_at, u.username AS author_name
        FROM article_versions av LEFT JOIN users u ON av.editor_id = u.user_id
        WHERE av.article_id = ${article.article_id} AND av.is_published = TRUE
        ORDER BY av.version_number DESC LIMIT 1;
      `;
    }

    let similarArticles = [];
    if (article.category_id) {
      similarArticles = await prisma.$queryRaw`
        SELECT a2.article_id::INT AS article_id, a2.title, a2.slug, COALESCE(a2.description, '') AS description,
               a2.thumbnail_url, a2.read_count::INT AS read_count, w2.title AS wiki_title, w2.slug AS wiki_slug, c2.name AS category_name
        FROM articles a2
        INNER JOIN wiki_spaces w2 ON a2.wiki_id = w2.wiki_id
        LEFT JOIN categories c2 ON COALESCE(a2.category_id, w2.category_id) = c2.category_id
        WHERE a2.is_published = TRUE AND a2.article_id <> ${article.article_id}
          AND COALESCE(a2.category_id, w2.category_id) = ${article.category_id}
        ORDER BY a2.read_count DESC, a2.created_at DESC LIMIT 3;
      `;
    }

    if (similarArticles.length < 3) {
      const existingIds = [article.article_id, ...similarArticles.map((a) => a.article_id)];
      const needed = 3 - similarArticles.length;
      const wikiFallbacks = await prisma.$queryRaw`
        SELECT a2.article_id::INT AS article_id, a2.title, a2.slug, COALESCE(a2.description, '') AS description,
               a2.thumbnail_url, a2.read_count::INT AS read_count, w2.title AS wiki_title, w2.slug AS wiki_slug, c2.name AS category_name
        FROM articles a2
        INNER JOIN wiki_spaces w2 ON a2.wiki_id = w2.wiki_id
        LEFT JOIN categories c2 ON COALESCE(a2.category_id, w2.category_id) = c2.category_id
        WHERE a2.is_published = TRUE AND a2.wiki_id = ${article.wiki_id}
          AND a2.article_id <> ALL(${existingIds}::INT[])
        ORDER BY a2.read_count DESC, a2.created_at DESC LIMIT ${needed};
      `;
      similarArticles = [...similarArticles, ...wikiFallbacks];
    }

    if (!requestedVersion) {
      await prisma.$executeRaw`
        UPDATE articles SET read_count = read_count + 1 WHERE article_id = ${article.article_id};
      `;
      await prisma.$executeRaw`
        UPDATE wiki_spaces SET total_views = total_views + 1 WHERE wiki_id = ${article.wiki_id};
      `;
    }

    res.status(200).json({
      success: true,
      article: { ...article, userRole },
      latestVersion: versions[0] || null,
      isViewingHistorical,
      similarArticles
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch article' });
  }
});

// 11. PENDING REVIEWS
router.get('/pending-reviews', authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.user_id);
    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);

    let pending;
    if (isGlobal) {
      pending = await prisma.$queryRaw`
        SELECT av.version_id::INT AS version_id, av.version_number::INT AS version_number, av.content,
               av.edit_summary, av.created_at, a.article_id::INT AS article_id, a.title AS article_title,
               a.slug AS article_slug, w.wiki_id::INT AS wiki_id, w.title AS wiki_title, w.slug AS wiki_slug,
               u.username AS contributor_name, u.email AS contributor_email
        FROM article_versions av
        INNER JOIN articles a ON av.article_id = a.article_id
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN users u ON av.editor_id = u.user_id
        WHERE av.review_status = 'pending'
        ORDER BY av.created_at ASC;
      `;
    } else {
      pending = await prisma.$queryRaw`
        SELECT av.version_id::INT AS version_id, av.version_number::INT AS version_number, av.content,
               av.edit_summary, av.created_at, a.article_id::INT AS article_id, a.title AS article_title,
               a.slug AS article_slug, w.wiki_id::INT AS wiki_id, w.title AS wiki_title, w.slug AS wiki_slug,
               u.username AS contributor_name, u.email AS contributor_email
        FROM article_versions av
        INNER JOIN articles a ON av.article_id = a.article_id
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        INNER JOIN users u ON av.editor_id = u.user_id
        INNER JOIN wiki_memberships wm ON w.wiki_id = wm.wiki_id
        WHERE wm.user_id = ${userId} AND av.review_status = 'pending'
        ORDER BY av.created_at ASC;
      `;
    }

    res.status(200).json({ success: true, pending });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch pending reviews' });
  }
});

// 12. REVIEW REVISION (Explicit Transaction on Approval)
router.post('/versions/:versionId/review', authenticateToken, async (req, res) => {
  try {
    const versionId = Number(req.params.versionId);
    const { action, approval_feedback } = req.body;
    const userId = Number(req.user.user_id);

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
    }

    const versionRecords = await prisma.$queryRaw`
      SELECT av.version_id::INT AS version_id, av.article_id::INT AS article_id, av.content,
             av.is_published, a.wiki_id::INT AS wiki_id
      FROM article_versions av INNER JOIN articles a ON av.article_id = a.article_id
      WHERE av.version_id = ${versionId} LIMIT 1;
    `;

    if (versionRecords.length === 0) return res.status(404).json({ success: false, message: 'Version not found' });
    const ver = versionRecords[0];

    const isGlobal = ['owner', 'admin'].includes(req.user.global_role);
    const membership = await prisma.$queryRaw`
      SELECT role FROM wiki_memberships WHERE wiki_id = ${ver.wiki_id} AND user_id = ${userId} LIMIT 1;
    `;
    if (!isGlobal && membership.length === 0) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (action === 'approve') {
      const excerpt = extractFirstParagraph(ver.content);
      const thumbnail = extractFirstImage(ver.content);
      const mediaIds = extractMediaIds(ver.content);

      // Explicit BEGIN -> COMMIT / ROLLBACK transaction
      await executeTransaction(async (client) => {
        await client.query(`UPDATE article_versions SET is_published = FALSE WHERE article_id = $1;`, [ver.article_id]);

        await client.query(
          `UPDATE article_versions
           SET is_published = TRUE,
               review_status = 'approved',
               approver_id = $1,
               approval_feedback = $2
           WHERE version_id = $3;`,
          [userId, approval_feedback || 'Approved by author', versionId]
        );

        await client.query(
          `UPDATE articles SET is_published = TRUE, description = $1, thumbnail_url = $2 WHERE article_id = $3;`,
          [excerpt, thumbnail, ver.article_id]
        );

        for (const mId of mediaIds) {
          await client.query(
            `INSERT INTO article_media (article_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
            [ver.article_id, mId]
          );
        }

        await syncArticleLinks(client, ver.article_id, ver.wiki_id, ver.content);
      });

      return res.status(200).json({ success: true, message: 'Revision approved! The new version is now published live.' });
    } else {
      await prisma.$executeRaw`
        UPDATE article_versions
        SET review_status = 'rejected', is_published = FALSE, approver_id = ${userId}, approval_feedback = ${approval_feedback || 'Rejected by author'}
        WHERE version_id = ${versionId};
      `;

      return res.status(200).json({ success: true, message: 'Revision rejected.' });
    }
  } catch (error) {
    console.error('Review revision error:', error);
    res.status(500).json({ success: false, message: 'Failed to process revision review' });
  }
});

export default router;