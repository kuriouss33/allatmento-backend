import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { verifyAuthToken } from './middleware/auth.middleware.js';
import { requireRole } from './middleware/role.middleware.js';
import { handleSetUserRole, listUsersController } from './controllers/admin.controller.js';
import { 
  handleGetReports, 
  handleCreateReport, 
  handleDeleteReport, 
  handleUpdateStatus,
  handleHelpOffer,
  handleAddComment
} from './controllers/reports.controller.js';
import { autoTranslate, autoTranslateDetailed } from './services/translate.service.js';
import { adminAuth, adminDb } from './config/firebase.js';
import uploadRoutes from './routes/upload.routes.js';
import { Resend } from 'resend';
import './types/express.js';

const app = express();
// Vercel proxy mögötti futás engedélyezése a rate-limiter és IP-címek helyes kezeléséhez
app.set('trust proxy', 1);

// Vercel Serverless proxy útvonal helyreállítás (ha a rewrite lecsípte vagy módosította a req.url-t)
app.use((req, _res, next) => {
  const matched = req.headers['x-matched-path'];
  if (matched && typeof matched === 'string') {
    const queryIdx = req.url.indexOf('?');
    const queryString = queryIdx !== -1 ? req.url.substring(queryIdx) : '';
    req.url = matched + queryString;
  }
  next();
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback');

// 1. Biztonsági HTTP fejlécek (Helmet)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 2. CORS beállítások
const defaultAllowedOrigins = [
  'https://allatmento-web.vercel.app',
  'https://allatmento-app.firebaseapp.com',
  'https://allatmento-app.web.app',
  'https://kuriouss33.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

if (process.env.CORS_ALLOWED_ORIGINS) {
  const extra = process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  defaultAllowedOrigins.push(...extra);
}

const isOriginAllowed = (origin?: string): boolean => {
  if (!origin) return true;
  if (defaultAllowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (origin.endsWith('.firebaseapp.com')) return true;
  if (origin.endsWith('.web.app')) return true;
  if (origin.endsWith('.github.io')) return true;
  return false;
};

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS házirend megtagadta a hozzáférést a következő forrásból: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-delete-token', 'x-anonymous-uid']
};

app.use(cors(corsOptions));

// 3. Kéréstest (JSON body) értelmezése
app.use(express.json());

// 4. Globális Rate Limiter az összes /api végpontra
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150, // 15 perc alatt max 150 kérés IP-címenként
  validate: false, // Vercel proxy mögötti ValidationError kivédése
  message: {
    success: false,
    error: 'Túl sok kérés érkezett a szerver felé. Kérlek, próbáld újra pár perc múlva!'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', globalApiLimiter);

// Külön limiter az e-mail megerősítéshez a spamelés megelőzésére
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 15 perc alatt max 5 megerősítő email
  validate: false,
  message: {
    success: false,
    error: 'Túl sok megerősítő e-mail kérés érkezett. Kérlek, próbáld újra 15 perc múlva!'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 5. Útvonalak (Routes)
app.get(['/', '/api', '/api/index'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Állatmentő Portál Backend szerver aktív és működik.',
    endpoints: {
      health: '/api/health',
      reports: '/api/reports'
    }
  });
});

// Rendszerállapot teszt és diagnosztika (elgépelés elleni aliasokkal)
app.get(['/api/health', '/health', '/api/heath', '/heath'], async (_req: Request, res: Response) => {
  const firebaseConfigured = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  const resendKey = process.env.RESEND_API_KEY;
  const resendConfigured = !!resendKey;
  const imgbbConfigured = !!process.env.IMGBB_API_KEY;

  let resendDiagnostics: any = null;
  if (resendConfigured) {
    try {
      const client = new Resend(resendKey);
      const domainsResult = await client.domains.list();
      resendDiagnostics = {
        domains: domainsResult.data?.data?.map((d: any) => ({ name: d.name, status: d.status })) || domainsResult.data || [],
        error: domainsResult.error || null,
      };
    } catch (err: any) {
      resendDiagnostics = { error: err.message || 'Hiba a Resend domainek lekérésekor.' };
    }
  }

  res.json({
    status: 'ok',
    message: 'A mentő backend szerver aktív.',
    config: {
      firebase: firebaseConfigured,
      resend: resendConfigured,
      resendFrom: process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Allatmento Rendszer <onboarding@resend.dev>',
      imgbb: imgbbConfigured,
      nodeEnv: process.env.NODE_ENV || 'development'
    },
    resendDiagnostics
  });
});

// Új felhasználó profiljának ellenőrzött rögzítése regisztrációkor
app.post('/api/auth/register-profile', async (req: Request, res: Response) => {
  try {
    const { uid, email } = req.body;

    if (!uid || !email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Hiányzó vagy érvénytelen UID / e-mail cím.' });
    }

    // Hitelesítés ellenőrzése: létezik-e az Authban a felhasználó
    try {
      const authUser = await adminAuth.getUser(uid);
      if (authUser.email?.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'A megadott azonosító és e-mail nem egyezik a hitelesítő rendszerben.' });
      }
    } catch (authLookupErr) {
      return res.status(404).json({ success: false, error: 'A regisztrálandó fiók nem található a hitelesítési rendszerben.' });
    }

    const userDocRef = adminDb.collection('users').doc(uid);
    const existingDoc = await userDocRef.get();

    if (existingDoc.exists) {
      const existingData = existingDoc.data();
      await userDocRef.set({
        email: email,
        role: existingData?.role || 'public',
        status: existingData?.status || 'pending_approval',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } else {
      await userDocRef.set({
        email: email,
        role: 'public',
        status: 'pending_approval',
        createdAt: new Date().toISOString()
      });
    }

    return res.json({ success: true, message: 'Felhasználói profil sikeresen rögzítve.' });
  } catch (error: any) {
    console.error('Hiba a regisztrációs profil mentésekor:', error);
    return res.status(500).json({ success: false, error: error.message || 'Szerverhiba a profil mentése során.' });
  }
});

// Hitelesítő e-mail küldése egyedi HTML sablonnal és Resend kezeléssel
app.post('/api/auth/send-verification', verificationLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Az e-mail cím megadása kötelező.' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY nincs beállítva a szerveren!');
      return res.status(500).json({ success: false, error: 'A szerveren nincs beállítva a RESEND_API_KEY környezeti változó.' });
    }

    const verificationLink = await adminAuth.generateEmailVerificationLink(email);
    const fromAddress = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Allatmento Rendszer <onboarding@resend.dev>';

    console.log(`[SendVerification] Küldés indul: ${fromAddress} -> ${email}`);
    const client = new Resend(apiKey);
    const sendResult = await client.emails.send({
      from: fromAddress,
      to: [email],
      subject: 'E-mail cím megerősítése - Állatmentő Rendszer',
      html: `
        <!DOCTYPE html>
        <html lang="hu">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>E-mail megerősítés</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
            <tr>
              <td align="center" style="padding: 40px 10px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  <tr>
                    <td style="padding: 28px 32px; background-color: #0f172a; color: #ffffff;">
                      <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em;">Állatmentő Rendszer</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6;">
                      <p style="margin-top: 0; margin-bottom: 16px; font-weight: 600; color: #0f172a; font-size: 16px;">
                        Kedves Felhasználó!
                      </p>
                      <p style="margin-top: 0; margin-bottom: 24px;">
                        Köszöntünk a rendszerben! A fiókod aktiválásához és a mentői funkciók eléréséhez kérjük, kattints az alábbi gombra az e-mail címed megerősítéséhez:
                      </p>
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
                        <tr>
                          <td align="center">
                            <a href="${verificationLink}" target="_blank" style="display: inline-block; padding: 12px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 6px;">
                              E-mail cím megerősítése
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 0; font-size: 13px; color: #64748b;">
                        Ha a fenti gomb nem működne, másold be ezt a hivatkozást a böngésződ címsorába:
                      </p>
                      <p style="margin: 8px 0 0 0; font-size: 12px; word-break: break-all; color: #2563eb;">
                        <a href="${verificationLink}" style="color: #2563eb; text-decoration: underline;">${verificationLink}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 20px 32px; background-color: #f1f5f9; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
                      <p style="margin: 0;">
                        Ha nem te kezdeményezted a regisztrációt, nyugodtan hagyd figyelmen kívül ezt az üzenetet.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    });

    if (sendResult.error) {
      console.error('[SendVerification] Resend API hiba:', sendResult.error);
      return res.status(400).json({
        success: false,
        error: sendResult.error.message || 'Resend hiba az e-mail küldése során.',
        resendError: sendResult.error
      });
    }

    console.log(`[SendVerification] Sikeres Resend küldés! E-mail azonosító: ${sendResult.data?.id}`);
    return res.json({ success: true, message: 'A megerősítő e-mail sikeresen elküldve.', emailId: sendResult.data?.id });
  } catch (error: any) {
    console.error('Hiba az e-mail küldésekor:', error);
    return res.status(500).json({ success: false, error: error.message || 'Sikertelen e-mail küldés.' });
  }
});

// Biztonsagos kepfeltoltes
app.use('/api/upload', uploadRoutes);

// Bejelentesek kezelese
app.get('/api/reports', handleGetReports);
app.post('/api/reports', handleCreateReport);
app.post('/api/reports/:id/help-offer', handleHelpOffer);
app.post('/api/reports/:id/comments', verifyAuthToken, handleAddComment);
app.patch('/api/reports/:id/status', verifyAuthToken, requireRole(['verified_rescuer', 'super_admin']), handleUpdateStatus);
app.delete('/api/reports/:id', handleDeleteReport);

// Dinamikus szövegfordítás (magyar <-> angol)
app.post('/api/translate', async (req: Request, res: Response) => {
  try {
    const { text, targetLang } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Hiányzó vagy érvénytelen szöveg.' });
    }
    const to = (targetLang === 'hu' ? 'hu' : 'en') as 'en' | 'hu';
    const detail = await autoTranslateDetailed(text, to);
    return res.json({ 
      success: true, 
      original: detail.original, 
      translated: detail.translated, 
      targetLang: detail.targetLang,
      detectedSourceLang: detail.detectedSourceLang,
      isTranslated: detail.isTranslated
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Fordítási hiba.' });
  }
});

// Felhasznaloi profil valos szerepkorenek lekerese & automatikus inicializalasa
app.get('/api/me', verifyAuthToken, async (req: Request, res: Response) => {
  try {
    const uid = (req as any).user?.uid;
    const email = (req as any).user?.email;

    if (!uid) {
      return res.status(401).json({ success: false, error: 'Azonositatlan felhasznalo.' });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      const defaultUser = {
        email: email || '',
        role: 'public',
        status: 'pending_approval',
        createdAt: new Date().toISOString()
      };
      await adminDb.collection('users').doc(uid).set(defaultUser);
      return res.json({
        success: true,
        user: { uid, ...defaultUser }
      });
    }

    const userData = userDoc.data();
    return res.json({
      success: true,
      user: {
        uid,
        email: userData?.email || email,
        role: userData?.role || 'public',
        status: userData?.status || 'pending_approval'
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Adminisztracios vegpontok (Kizarolag Super Admin szamara)
app.get('/api/users', verifyAuthToken, requireRole(['super_admin']), listUsersController);

app.patch('/api/users/:uid/role', verifyAuthToken, requireRole(['super_admin']), (req: Request, res: Response) => {
  req.body.targetUid = Array.isArray(req.params.uid) ? req.params.uid[0] : req.params.uid;
  handleSetUserRole(req, res);
});

app.post('/api/admin/set-role', verifyAuthToken, requireRole(['super_admin']), handleSetUserRole);

// Felhasznalo vegleges torlese a rendszerbol (Firebase Auth + Firestore)
app.delete('/api/users/:uid', verifyAuthToken, requireRole(['super_admin']), async (req: Request, res: Response) => {
  try {
    const targetUid = Array.isArray(req.params.uid) ? req.params.uid[0] : req.params.uid;
    const callerUid = (req as any).user?.uid;

    if (!targetUid) {
      return res.status(400).json({ success: false, error: 'Hianyzo felhasznaloi azonosito.' });
    }

    if (targetUid === callerUid) {
      return res.status(400).json({ success: false, error: 'Sajat magadat nem torolheted a rendszerbol.' });
    }

    // 1. Torles Firebase Auth-bol
    try {
      await adminAuth.deleteUser(targetUid);
    } catch (authErr: any) {
      console.warn('Auth user torles figyelmeztetes:', authErr.message);
    }

    // 2. Torles Firestore 'users' gyujtemenybol
    await adminDb.collection('users').doc(targetUid).delete();

    return res.json({ success: true, message: 'Felhasznalo sikeresen torolve a rendszerbol.' });
  } catch (error: any) {
    console.error('Hiba a felhasznalo torlesekor:', error);
    return res.status(500).json({ success: false, error: error.message || 'Hiba a torles soran.' });
  }
});

// 6. Globalis hibakezelo middleware (megakadalyozza a Vercel 500 FUNCTION_INVOCATION_FAILED osszeomlast)
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Elfogatlan szerverhiba:', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Belső szerverhiba történt.'
  });
});

// 5. Szerver inditasa (helyi fejleszteskor vagy hagyomanyos Node kornyezetben)
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Allatmento Backend szerver fut a http://0.0.0.0:${PORT} cimen`);
  });
}

// Vercel Serverless Function export
export default app;
export { app };