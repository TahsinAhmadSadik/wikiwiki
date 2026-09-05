import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// Existing mandatory auth middleware
export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const users = await prisma.$queryRaw`
      SELECT user_id::INT AS user_id, global_role, is_banned, token_version
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

// 1. Role-Based Access Control (RBAC) Guard
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.global_role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to perform this action' 
      });
    }

    next();
  };
};

// 2. Optional Auth (Doesn't fail if guest; attaches req.user if logged in)
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const users = await prisma.$queryRaw`
      SELECT user_id::INT AS user_id, global_role, is_banned, token_version
      FROM users
      WHERE user_id = ${decoded.user_id}
      LIMIT 1;
    `;

    const user = users[0];
    if (user && !user.is_banned && user.token_version === decoded.token_version) {
      req.user = user;
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }

  next();
};