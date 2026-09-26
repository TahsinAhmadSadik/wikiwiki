import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import path from 'path';
import { prisma } from './lib/prisma.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import wikiRoutes from './routes/wiki.routes.js';
import adminRoutes from './routes/admin.routes.js';
import articleRoutes from './routes/article.routes.js';
import studioRoutes from './routes/studio.routes.js';
import statsRoutes from './routes/stats.routes.js';
import homeRoutes from './routes/home.routes.js';
import searchRoutes from './routes/search.routes.js';
import reportRoutes from './routes/report.routes.js';
import readingListRoutes from './routes/readingList.routes.js';
import categoryRoutes from './routes/category.routes.js';
import mediaRoutes from './routes/media.routes.js';

dotenv.config();
const app = express();

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:3000'
    ],
    credentials: true,
  })
);

app.use(express.json());

// Configure Helmet to allow frontend apps to load uploaded images
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// 1. Serve uploaded assets publicly
app.use('/uploads', express.static(path.resolve('uploads')));

// 2. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wikis', wikiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/studio', studioRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reading-lists', readingListRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/media', mediaRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));