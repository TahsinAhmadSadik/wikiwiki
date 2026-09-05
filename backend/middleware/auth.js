import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch the current token_version and status from DB
    const users = await prisma.$queryRaw`
      SELECT user_id, global_role, is_banned, token_version
      FROM users
      WHERE user_id = ${decoded.user_id}
      LIMIT 1;
    `;

    const user = users[0];

    if (!user || user.is_banned || user.token_version !== decoded.token_version) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or has been revoked'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};