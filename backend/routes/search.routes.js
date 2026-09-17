import express from 'express';
import { prisma } from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Helper: Build a safe tsquery string from boolean criteria
function buildTsQueryString({ q, all, any, none, exact }) {
  const parts = [];

  // Plain query or "all" terms -> joined by AND (&)
  const allTerms = [q, all].filter(Boolean).join(' ').trim();
  if (allTerms) {
    const tokens = allTerms.split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
    if (tokens.length > 0) parts.push(tokens.join(' & '));
  }

  // Exact phrase -> joined by phrase operator (<->)
  if (exact && exact.trim()) {
    const tokens = exact.trim().split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
    if (tokens.length > 0) parts.push(`(${tokens.join(' <-> ')})`);
  }

  // Any terms -> joined by OR (|)
  if (any && any.trim()) {
    const tokens = any.trim().split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
    if (tokens.length > 0) parts.push(`(${tokens.join(' | ')})`);
  }

  // None terms -> prepended by NOT (!)
  if (none && none.trim()) {
    const tokens = none.trim().split(/\s+/).map(t => t.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
    if (tokens.length > 0) parts.push(`(!${tokens.join(' & !')})`);
  }

  return parts.length > 0 ? parts.join(' & ') : '';
}

// 1. GLOBAL FULL-TEXT & TRIGRAM SEARCH
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, all, any, none, exact, type = 'all', sort = 'relevance', category_id, wiki_id } = req.query;
    const tsQueryStr = buildTsQueryString({ q, all, any, none, exact });
    const rawSearch = (q || all || exact || any || '').trim();

    // 1. Articles Query: Uses LATERAL join to isolate strictly the single latest published version
    let articleResults = [];
    if (['all', 'articles'].includes(type)) {
      articleResults = await prisma.$queryRaw`
        SELECT 
          a.article_id::INT AS article_id,
          a.title,
          a.slug,
          a.read_count::INT AS read_count,
          a.created_at,
          w.title AS wiki_title,
          w.slug AS wiki_slug,
          c.name AS category_name,
          av.version_number::INT AS version_number,
          av.created_at AS last_edited_at,
          COALESCE(
            (av.content->'blocks'->0->'data'->>'text'),
            (av.content->'blocks'->0->>'text'),
            ''
          ) AS snippet,
          CASE 
            WHEN ${tsQueryStr} <> '' THEN ts_rank(av.search_vector, to_tsquery('english', ${tsQueryStr}))
            ELSE 0
          END AS rank
        FROM articles a
        INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
        LEFT JOIN categories c ON a.category_id = c.category_id
        INNER JOIN LATERAL (
          SELECT 
            av_sub.version_id,
            av_sub.version_number,
            av_sub.created_at,
            av_sub.content,
            av_sub.search_vector
          FROM article_versions av_sub
          WHERE av_sub.article_id = a.article_id 
            AND av_sub.is_published = TRUE
          ORDER BY av_sub.version_number DESC
          LIMIT 1
        ) av ON TRUE
        WHERE a.is_published = TRUE
          AND (${wiki_id ? Number(wiki_id) : null}::INT IS NULL OR a.wiki_id = ${wiki_id ? Number(wiki_id) : null})
          AND (${category_id ? Number(category_id) : null}::INT IS NULL OR a.category_id = ${category_id ? Number(category_id) : null})
          AND (
            ${tsQueryStr} = '' 
            OR av.search_vector @@ to_tsquery('english', ${tsQueryStr})
            OR a.title ILIKE ${'%' + rawSearch + '%'}
          )
        ORDER BY 
          CASE WHEN ${sort} = 'new_edit' THEN av.created_at END DESC,
          CASE WHEN ${sort} = 'new_created' THEN a.created_at END DESC,
          CASE WHEN ${sort} = 'alpha' THEN a.title END ASC,
          rank DESC, a.read_count DESC
        LIMIT 30;
      `;
    }

    // 2. Wikis Query: Runs on initial load or search, and respects category filtering
    let wikiResults = [];
    if (['all', 'wikis'].includes(type)) {
      wikiResults = await prisma.$queryRaw`
        SELECT 
          w.wiki_id::INT AS wiki_id,
          w.title,
          w.slug,
          w.description,
          w.total_views::INT AS total_views,
          w.created_at,
          c.name AS category_name,
          (SELECT COUNT(*)::INT FROM articles a WHERE a.wiki_id = w.wiki_id AND a.is_published = TRUE) AS article_count
        FROM wiki_spaces w
        LEFT JOIN categories c ON w.category_id = c.category_id
        WHERE (${category_id ? Number(category_id) : null}::INT IS NULL OR w.category_id = ${category_id ? Number(category_id) : null})
          AND (
            ${rawSearch} = '' 
            OR w.title ILIKE ${'%' + rawSearch + '%'} 
            OR w.description ILIKE ${'%' + rawSearch + '%'}
          )
        ORDER BY w.total_views DESC
        LIMIT 15;
      `;
    }

    res.status(200).json({
      success: true,
      articles: articleResults,
      wikis: wikiResults
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: 'Search execution failed' });
  }
});

// 2. RECURSIVE CATEGORY TREE (MODULE 11)
router.get('/categories/tree', async (req, res) => {
  try {
    const rawCategories = await prisma.$queryRaw`
      WITH RECURSIVE category_tree AS (
        SELECT 
          category_id::INT AS category_id,
          name,
          description,
          parent_category_id::INT AS parent_category_id,
          0 AS depth,
          ARRAY[category_id] AS path
        FROM categories
        WHERE parent_category_id IS NULL

        UNION ALL

        SELECT 
          c.category_id::INT AS category_id,
          c.name,
          c.description,
          c.parent_category_id::INT AS parent_category_id,
          ct.depth + 1,
          ct.path || c.category_id
        FROM categories c
        INNER JOIN category_tree ct ON c.parent_category_id = ct.category_id
      )
      SELECT 
        ct.*,
        (SELECT COUNT(*)::INT FROM articles a WHERE a.category_id = ct.category_id AND a.is_published = TRUE) AS article_count
      FROM category_tree ct
      ORDER BY path;
    `;

    const categoryMap = {};
    const tree = [];

    rawCategories.forEach(cat => {
      categoryMap[cat.category_id] = { ...cat, subcategories: [] };
    });

    rawCategories.forEach(cat => {
      if (cat.parent_category_id === null) {
        tree.push(categoryMap[cat.category_id]);
      } else if (categoryMap[cat.parent_category_id]) {
        categoryMap[cat.parent_category_id].subcategories.push(categoryMap[cat.category_id]);
      }
    });

    res.status(200).json({ success: true, tree });
  } catch (error) {
    console.error('Category tree error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch category hierarchy' });
  }
});

export default router;