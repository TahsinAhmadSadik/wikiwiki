import { prisma } from '../lib/prisma.js';

/**
 * Enforces object-level authority over a target wiki.
 * @param {'author' | 'co_author'} minimumRole
 */
export const authorizeWikiAccess = (minimumRole = 'co_author') => {
  return async (req, res, next) => {
    try {
      const wikiId = Number(req.params.wikiId || req.body.wiki_id);

      if (!wikiId || isNaN(wikiId)) {
        return res.status(400).json({ success: false, message: 'Valid wiki ID is required' });
      }

      // 1. Global Bypass: Owner and Global Admin have universal administrative override
      if (['owner', 'admin'].includes(req.user.global_role)) {
        req.wikiRole = req.user.global_role;
        return next();
      }

      // 2. Query object-level role in wiki_memberships using parameterized raw SQL
      const memberships = await prisma.$queryRaw`
        SELECT role
        FROM wiki_memberships
        WHERE wiki_id = ${wikiId} AND user_id = ${req.user.user_id}
        LIMIT 1;
      `;

      if (memberships.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have authoring permissions for this wiki'
        });
      }

      const role = memberships[0].role;

      // Author-only actions (like assigning co-authors or deleting the wiki)
      if (minimumRole === 'author' && role !== 'author') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only the primary Author can perform this operation'
        });
      }

      req.wikiRole = role;
      next();
    } catch (error) {
      console.error('Wiki authorization error:', error);
      res.status(500).json({ success: false, message: 'Failed to verify authorization' });
    }
  };
};