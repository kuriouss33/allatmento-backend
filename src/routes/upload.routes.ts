import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';

const router = Router();
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
];

const upload = multer({ 
  limits: { fileSize: 10 * 1024 * 1024 }, // Maximum 10MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Nem támogatott fájlformátum. Kizárólag képek (JPEG, PNG, WebP, GIF, HEIC) engedélyezettek.'));
    }
  }
});

// Rate limiter kifejezetten a képfeltöltéshez (15 perc alatt max 10 feltöltés/IP)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    error: 'Túl sok képfeltöltési kérés érkezett erről az eszközről. Kérlek, próbáld újra 15 perc múlva!'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', uploadLimiter, (req: Request, res: Response, next) => {
  upload.single('image')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'A feltöltött kép túl nagy. Maximális méret: 10MB.' });
      }
      return res.status(400).json({ success: false, error: `Feltöltési hiba: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nem érkezett képfájl.' });
    }

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'ImgBB API kulcs nincs beállítva a szerveren.' });
    }

    const base64Image = req.file.buffer.toString('base64');
    const formData = new URLSearchParams();
    formData.append('image', base64Image);

    const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData
    });

    const data: any = await imgbbResponse.json();

    if (data.success) {
      return res.json({
        success: true,
        url: data.data.url,
        display_url: data.data.display_url
      });
    } else {
      return res.status(502).json({
        success: false,
        error: data.error?.message || 'ImgBB feltöltési hiba.'
      });
    }
  } catch (error: any) {
    console.error('Képfeltöltési hiba:', error);
    return res.status(500).json({ success: false, error: 'Szerverhiba a kép feldolgozása közben.' });
  }
});

export default router;