import express from 'express';
import multer from 'multer';
import path from 'path';
import { executeTransaction } from '../lib/db.js';
import { supabase } from '../lib/supabase.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

// POST /api/media/upload (Explicit Transaction: INSERT media + INSERT media_images)
router.post('/upload', optionalAuth, (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    try {
      const userId = req.user?.user_id ? Number(req.user.user_id) : null;
      const ext = path.extname(req.file.originalname).toLowerCase();
      const uniqueFilename = `articles/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

      const { data: storageData, error: storageError } = await supabase.storage
        .from('wiki-media')
        .upload(uniqueFilename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (storageError) {
        throw new Error(`Supabase Storage error: ${storageError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('wiki-media')
        .getPublicUrl(uniqueFilename);

      const publicUrl = urlData.publicUrl;

      // Explicit BEGIN -> COMMIT / ROLLBACK transaction
      const savedMedia = await executeTransaction(async (client) => {
        const mediaRes = await client.query(
          `INSERT INTO media (media_type, file_url, uploader_id)
           VALUES ('image'::media_type_enum, $1, $2)
           RETURNING media_id, file_url;`,
          [publicUrl, userId]
        );

        const mediaItem = mediaRes.rows[0];

        await client.query(
          `INSERT INTO media_images (media_id, alt_text)
           VALUES ($1, $2);`,
          [mediaItem.media_id, req.file.originalname.slice(0, 255)]
        );

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