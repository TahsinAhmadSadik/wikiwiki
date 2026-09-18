import express from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Health check to verify route mounting in browser
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Media route is active and responding!' });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg/;
    const extValid = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeValid = allowed.test(file.mimetype);

    if (extValid && mimeValid) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed'));
    }
  }
}).single('file');

// POST /api/media/upload
router.post('/upload', optionalAuth, (req, res) => {
  upload(req, res, async (err) => {
    // ...
    try {
      const userId = req.user?.user_id ? Number(req.user.user_id) : null;
      const ext = path.extname(req.file.originalname).toLowerCase();
      const uniqueFilename = `articles/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      // 1. Upload buffer directly to Supabase Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('wiki-media')
        .upload(uniqueFilename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (storageError) {
        throw new Error(`Supabase Storage error: ${storageError.message}`);
      }

      // 2. Get Public CDN URL
      const { data: urlData } = supabase.storage
        .from('wiki-media')
        .getPublicUrl(uniqueFilename);

      const publicUrl = urlData.publicUrl;

      // 3. Record in PostgreSQL media & media_images tables
      const savedMedia = await prisma.$transaction(async (tx) => {
        const mediaRows = await tx.$queryRaw`
          INSERT INTO media (
            media_type,
            file_url,
            uploader_id
          )
          VALUES (
            'image'::media_type_enum,
            ${publicUrl},
            ${userId}
          )
          RETURNING media_id::INT AS media_id, file_url;
        `;

        const mediaItem = mediaRows[0];

        await tx.$executeRaw`
          INSERT INTO media_images (
            media_id,
            alt_text
          )
          VALUES (
            ${mediaItem.media_id},
            ${req.file.originalname.slice(0, 255)}
          );
        `;

        return mediaItem;
      });

      return res.status(201).json({
        success: true,
        media_id: savedMedia.media_id,
        url: savedMedia.file_url,
        message: 'Image uploaded to Supabase Storage and registered in media catalog.'
      });
    } catch (uploadErr) {
      console.error('Media upload handler error:', uploadErr);
      return res.status(500).json({
        success: false,
        message: uploadErr.message || 'Failed to process media storage'
      });
    }
  });
});

export default router;