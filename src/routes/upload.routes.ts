import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';

const router = Router();
const upload = multer({ 
  limits: { fileSize: 10 * 1024 * 1024 } // Maximum 10MB
});

// Rate limiter kifejezetten a képfeltöltéshez (15 perc alatt max 10 feltöltés/IP)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Túl sok képfeltöltési kérés érkezett erről az eszközről. Kérlek, próbáld újra 15 perc múlva!'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', uploadLimiter, upload.single('image'), async (req: Request, res: Response) => {
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