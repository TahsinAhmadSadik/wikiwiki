import express from 'express';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// 1. GET CATEGORY TREE HIERARCHY
router.get('/categories/tree', async (req, res) => {
  try {
    const categories = await prisma.$queryRaw`
      SELECT 
        c.category_id::INT AS category_id,
        c.name,
        c.parent_id::INT AS parent_id,
        (
          SELECT COUNT(*)::INT 
          FROM articles a 
          INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
          WHERE COALESCE(a.category_id, w.category_id) = c.category_id 
            AND a.is_published = TRUE
        ) AS article_count
      FROM categories c
      ORDER BY c.name ASC;
    `;

    res.status(200).json({ success: true, tree: categories });
  } catch (error) {
    console.warn('Category tree with parent_id failed, falling back to flat list:', error.message);
    try {
      const flatCategories = await prisma.$queryRaw`
        SELECT 
          c.category_id::INT AS category_id,
          c.name,
          NULL::INT AS parent_id,
          (
            SELECT COUNT(*)::INT 
            FROM articles a 
            INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
            WHERE COALESCE(a.category_id, w.category_id) = c.category_id 
              AND a.is_published = TRUE
          ) AS article_count
        FROM categories c
        ORDER BY c.name ASC;
      `;
      res.status(200).json({ success: true, tree: flatCategories });
    } catch (fallbackError) {
      console.error('All category tree queries failed:', fallbackError);
      res.status(500).json({ success: false, message: 'Failed to load category tree' });
    }
  }
});

// 2. FULL-TEXT SEARCH (Articles & Wiki Spaces)
router.get('/', async (req, res) => {
  try {
    const {
      q = '',
      all = '',
      any = '',
      none = '',
      exact = '',
      category_id,
      sort = 'relevance',
      type = 'all'
    } = req.query;

    const searchTerm = q.trim();
    const categoryId = category_id ? Number(category_id) : null;

    let categoryIds = null;
    if (categoryId && !isNaN(categoryId)) {
      try {
        const subCats = await prisma.$queryRaw`
          WITH RECURSIVE SubCategories AS (
            SELECT category_id FROM categories WHERE category_id = ${categoryId}
            UNION
            SELECT c.category_id FROM categories c
            INNER JOIN SubCategories sc ON c.parent_id = sc.category_id
          )
          SELECT category_id::INT AS category_id FROM SubCategories;
        `;
        categoryIds = subCats.map((c) => c.category_id);
      } catch {
        categoryIds = [categoryId];
      }
    }

    let tsQueryString = null;
    const booleanClauses = [];

    if (exact && exact.trim()) {
      const tokens = exact.trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      if (tokens.length > 0) booleanClauses.push(`(${tokens.join(' <-> ')})`);
    }

    if (all && all.trim()) {
      const tokens = all.trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      if (tokens.length > 0) booleanClauses.push(`(${tokens.join(' & ')})`);
    }

    if (any && any.trim()) {
      const tokens = any.trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      if (tokens.length > 0) booleanClauses.push(`(${tokens.join(' | ')})`);
    }

    if (none && none.trim()) {
      const tokens = none.trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      if (tokens.length > 0) booleanClauses.push(`(!${tokens.join(' & !')})`);
    }

    if (booleanClauses.length > 0) {
      tsQueryString = booleanClauses.join(' & ');
    } else if (searchTerm) {
      const words = searchTerm.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        tsQueryString = words.join(' & ');
      }
    }

    let articles = [];
    let wikis = [];

    if (['all', 'articles'].includes(type)) {
      if (tsQueryString) {
        try {
          articles = await prisma.$queryRaw`
            WITH ParsedQuery AS (
              SELECT to_tsquery('english', ${tsQueryString}) AS query
            )
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
              COALESCE(c.name, 'General') AS category_name,
              COALESCE(av.version_number, 1)::INT AS version_number,
              COALESCE(av.created_at, a.created_at) AS last_edited_at,
              ts_rank(COALESCE(av.search_vector, to_tsvector('english', a.title)), pq.query) AS relevance_rank,
              ts_headline(
                'english',
                COALESCE(NULLIF(a.description, ''), a.title),
                pq.query,
                'StartSel=<mark style="background-color: rgba(168, 85, 247, 0.25); color: #d8b4fe; font-weight: 600; padding: 0 3px; border-radius: 3px;">, StopSel=</mark>, MaxWords=35, MinWords=15, HighlightAll=FALSE'
              ) AS snippet
            FROM articles a
            CROSS JOIN ParsedQuery pq
            INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
            LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
            LEFT JOIN LATERAL (
              SELECT av_sub.version_number, av_sub.created_at, av_sub.search_vector
              FROM article_versions av_sub
              WHERE av_sub.article_id = a.article_id AND av_sub.is_published = TRUE
              ORDER BY av_sub.version_number DESC
              LIMIT 1
            ) av ON TRUE
            WHERE a.is_published = TRUE
              AND (${categoryIds}::INT[] IS NULL OR COALESCE(a.category_id, w.category_id) = ANY(${categoryIds}::INT[]))
              AND (
                (av.search_vector IS NOT NULL AND av.search_vector @@ pq.query)
                OR to_tsvector('english', a.title) @@ pq.query
                OR a.title ILIKE '%' || ${searchTerm}::TEXT || '%'
                OR a.description ILIKE '%' || ${searchTerm}::TEXT || '%'
              )
            ORDER BY 
              CASE WHEN ${sort}::TEXT = 'alpha' THEN a.title END ASC,
              CASE WHEN ${sort}::TEXT = 'new_created' THEN a.created_at END DESC,
              CASE WHEN ${sort}::TEXT = 'new_edit' THEN av.created_at END DESC,
              relevance_rank DESC,
              a.read_count DESC
            LIMIT 50;
          `;
        } catch {
          articles = await prisma.$queryRaw`
            SELECT 
              a.article_id::INT AS article_id,
              a.title,
              a.slug,
              COALESCE(a.description, '') AS description,
              COALESCE(NULLIF(a.description, ''), 'No excerpt available.') AS snippet,
              a.read_count::INT AS read_count,
              a.created_at,
              w.wiki_id::INT AS wiki_id,
              w.title AS wiki_title,
              w.slug AS wiki_slug,
              COALESCE(c.name, 'General') AS category_name,
              COALESCE(av.version_number, 1)::INT AS version_number,
              COALESCE(av.created_at, a.created_at) AS last_edited_at
            FROM articles a
            INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
            LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
            LEFT JOIN LATERAL (
              SELECT av_sub.version_number, av_sub.created_at
              FROM article_versions av_sub
              WHERE av_sub.article_id = a.article_id AND av_sub.is_published = TRUE
              ORDER BY av_sub.version_number DESC
              LIMIT 1
            ) av ON TRUE
            WHERE a.is_published = TRUE
              AND (${categoryIds}::INT[] IS NULL OR COALESCE(a.category_id, w.category_id) = ANY(${categoryIds}::INT[]))
              AND (
                a.title ILIKE '%' || ${searchTerm}::TEXT || '%'
                OR a.description ILIKE '%' || ${searchTerm}::TEXT || '%'
              )
            ORDER BY a.read_count DESC
            LIMIT 50;
          `;
        }
      } else {
        articles = await prisma.$queryRaw`
          SELECT 
            a.article_id::INT AS article_id,
            a.title,
            a.slug,
            COALESCE(a.description, '') AS description,
            COALESCE(NULLIF(a.description, ''), 'No excerpt available.') AS snippet,
            a.read_count::INT AS read_count,
            a.created_at,
            w.wiki_id::INT AS wiki_id,
            w.title AS wiki_title,
            w.slug AS wiki_slug,
            COALESCE(c.name, 'General') AS category_name,
            COALESCE(av.version_number, 1)::INT AS version_number,
            COALESCE(av.created_at, a.created_at) AS last_edited_at
          FROM articles a
          INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
          LEFT JOIN categories c ON COALESCE(a.category_id, w.category_id) = c.category_id
          LEFT JOIN LATERAL (
            SELECT av_sub.version_number, av_sub.created_at
            FROM article_versions av_sub
            WHERE av_sub.article_id = a.article_id AND av_sub.is_published = TRUE
            ORDER BY av_sub.version_number DESC
            LIMIT 1
          ) av ON TRUE
          WHERE a.is_published = TRUE
            AND (${categoryIds}::INT[] IS NULL OR COALESCE(a.category_id, w.category_id) = ANY(${categoryIds}::INT[]))
          ORDER BY 
            CASE WHEN ${sort}::TEXT = 'alpha' THEN a.title END ASC,
            CASE WHEN ${sort}::TEXT = 'new_created' THEN a.created_at END DESC,
            CASE WHEN ${sort}::TEXT = 'new_edit' THEN av.created_at END DESC,
            a.read_count DESC,
            a.created_at DESC
          LIMIT 50;
        `;
      }
    }

    if (['all', 'wikis'].includes(type)) {
      if (searchTerm) {
        wikis = await prisma.$queryRaw`
          SELECT 
            w.wiki_id::INT AS wiki_id,
            w.title,
            w.slug,
            COALESCE(w.description, '') AS description,
            w.total_views::INT AS total_views,
            (
              SELECT COUNT(*)::INT 
              FROM articles a 
              WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE
            ) AS article_count
          FROM wiki_spaces w
          WHERE (${categoryIds}::INT[] IS NULL OR w.category_id = ANY(${categoryIds}::INT[]))
            AND (
              w.title ILIKE '%' || ${searchTerm}::TEXT || '%' 
              OR COALESCE(w.description, '') ILIKE '%' || ${searchTerm}::TEXT || '%'
            )
          ORDER BY 
            CASE WHEN ${sort}::TEXT = 'alpha' THEN w.title END ASC,
            w.total_views DESC
          LIMIT 20;
        `;
      } else {
        wikis = await prisma.$queryRaw`
          SELECT 
            w.wiki_id::INT AS wiki_id,
            w.title,
            w.slug,
            COALESCE(w.description, '') AS description,
            w.total_views::INT AS total_views,
            (
              SELECT COUNT(*)::INT 
              FROM articles a 
              WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE
            ) AS article_count
          FROM wiki_spaces w
          WHERE (${categoryIds}::INT[] IS NULL OR w.category_id = ANY(${categoryIds}::INT[]))
          ORDER BY 
            CASE WHEN ${sort}::TEXT = 'alpha' THEN w.title END ASC,
            w.total_views DESC
          LIMIT 20;
        `;
      }
    }

    res.status(200).json({
      success: true,
      articles,
      wikis
    });
  } catch (error) {
    console.error('Search query error:', error);
    res.status(500).json({ success: false, message: 'Search execution failed' });
  }
});

export default router;