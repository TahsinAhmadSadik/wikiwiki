import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // 2. Find user by email
    const users = await prisma.$queryRaw`
      SELECT
        user_id,
        username,
        email,
        password_hash,
        global_role,
        is_banned
      FROM users
      WHERE email = ${email}
      LIMIT 1;
    `;

    // 3. Check whether user exists
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

    // 4. Check whether user is banned
    if (user.is_banned) {
      return res.status(403).json({
        success: false,
        message: 'This account has been banned'
      });
    }

    // 5. Compare password with stored bcrypt hash
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // 6. Create JWT
    const token = jwt.sign(
      {
        user_id: user.user_id
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '1h'
      }
    );

    // 7. Send response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        global_role: user.global_role
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

export default router;