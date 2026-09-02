import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.routes.js';

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

// app.get('/api/health', (req, res) => {
//   res.json({ status: 'ok', message: 'WikiWiki API is running' });
// });
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await prisma.$queryRaw`
      SELECT user_id, username, email, global_role
      FROM users
      WHERE user_id = ${1}
    `;

    res.json({
      success: true,
      user: result[0] || null
    });

  } catch (error) {
    console.error('Database error:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.$queryRaw`
      SELECT
        category_id,
        name,
        description,
        parent_category_id,
        created_at
      FROM categories
      ORDER BY category_id ;
    `;

    res.status(200).json({
      success: true,
      categories: categories
    });

  } catch (error) {
    console.error('Database error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, description } = req.body;

    // Validate category name
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Category name is required'
      });
    }

    const result = await prisma.$queryRaw`
      INSERT INTO categories (name, description)
      VALUES (${name.trim()}, ${description || null})
      RETURNING 
        category_id,
        name,
        description,
        parent_category_id,
        created_at;
    `;

    res.status(201).json({
      success: true,
      category: result[0]
    });

  } catch (error) {
    console.error('Database error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to create category'
    });
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
