import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email and password are required'
      });
    }

    // 2. Check whether username or email already exists
    const existingUser = await prisma.$queryRaw`
      SELECT user_id
      FROM users
      WHERE username = ${username}
         OR email = ${email}
      LIMIT 1;
    `;

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // 4. Insert user
    const newUser = await prisma.$queryRaw`
      INSERT INTO users (
        username,
        email,
        password_hash
      )
      VALUES (
        ${username},
        ${email},
        ${passwordHash}
      )
      RETURNING
        user_id,
        username,
        email,
        global_role,
        created_at;
    `;

    // 5. Send response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser[0]
    });

  } catch (error) {
    console.error('Registration error:', error);

    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

export default router;