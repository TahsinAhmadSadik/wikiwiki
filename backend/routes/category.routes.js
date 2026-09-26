import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 1. GET ALL CATEGORIES (Public: used by Home, Editor, and Admin)
router.get('/', async (req, res) => {
  try {
    const categories = await prisma.$queryRaw`
      SELECT 
        c.category_id::INT AS category_id,
        c.name,
        c.parent_id::INT AS parent_id,
        p.name AS parent_name,
        (
          SELECT COUNT(*)::INT 
          FROM articles a 
          INNER JOIN wiki_spaces w ON a.wiki_id = w.wiki_id
          WHERE COALESCE(a.category_id, w.category_id) = c.category_id 
            AND a.is_published = TRUE
        ) AS article_count
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.category_id
      ORDER BY c.parent_id ASC NULLS FIRST, c.name ASC;
    `;

    res.status(200).json({ success: true, categories });
  } catch (error) {
    console.error('Fetch categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to load categories' });
  }
});

// 2. CREATE CATEGORY (Restricted to Global Admins and Site Owners)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, parent_id } = req.body;
    const isGlobalAdmin = ['owner', 'admin'].includes(req.user.global_role);

    if (!isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only platform administrators can define taxonomy categories.'
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const trimmedName = name.trim();
    const parentId = parent_id ? Number(parent_id) : null;

    // Check for duplicate sibling categories under the same parent
    const existing = await prisma.$queryRaw`
      SELECT category_id FROM categories 
      WHERE LOWER(name) = LOWER(${trimmedName}) 
        AND ((${parentId}::INT IS NULL AND parent_id IS NULL) OR parent_id = ${parentId}::INT)
      LIMIT 1;
    `;

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A category with this name already exists at this hierarchy level.'
      });
    }

    const created = await prisma.$queryRaw`
      INSERT INTO categories (name, parent_id)
      VALUES (${trimmedName}, ${parentId})
      RETURNING category_id::INT AS category_id, name, parent_id::INT AS parent_id;
    `;

    res.status(201).json({
      success: true,
      message: `Category "${trimmedName}" created successfully.`,
      category: created[0]
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

export default router;