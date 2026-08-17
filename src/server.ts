import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { verifyAuthToken } from './middleware/auth.middleware.js';
import { requireRole } from './middleware/role.middleware.js';
import { handleSetUserRole, listUsersController } from './controllers/admin.controller.js';
import { handleGetReports, handleCreateReport, handleUpdateStatus } from './controllers/reports.controller.js';
import { adminAuth, adminDb } from './config/firebase.js';
import uploadRoutes from './routes/upload.routes.js';
import { Resend } from 'resend';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

// 1. CORS beallitasok (egyseges konfiguracio a middleware lanc legelejen)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Kerestest (JSON body) ertelmezese
app.use(express.json());

// 3. Globalis Rate Limiter az osszes /api vegpontra
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 15 perc alatt max 100 keres IP-cimenkent
  message: {
    success: false,
    error: 'Tul sok keres erkezett a szerver fele. Kerlek, probald ujra par perc mulva!'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', globalApiLimiter);

// 4. Utvonalak (Routes)

// Rendszerallapot teszt
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'A mento backend szerver aktiv.' });
});

// Hitelesito e-mail kuldese egyedi sablonnal es Resend kezelessel
app.post('/api/auth/send-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Az e-mail cim megadasa kotelezo.' });
    }

    const verificationLink = await adminAuth.generateEmailVerificationLink(email);

    await resend.emails.send({
      from: 'Allatmento Rendszer <onboarding@resend.dev>',
      to: [email],
      subject: 'E-mail cim megerositese - Allatmento Rendszer',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
          <h2 style="color: #0f172a; margin-top: 0;">Udvozoljuk az Allatmento Rendszerben!</h2>
          <p>Koszontunk a rendszerben! A fiokod aktivalasahoz es a mentoi funkciok eleresehez kerjuk, erositsd meg az e-mail cimedet az alabbi gombra kattintva:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              E-mail cim megerositese
            </a>
          </div>
          <p style="font-size: 13px; color: #64748b;">Ha a gomb nem mukodne, masold be az alabbi hivatkozast a bongeszodbe:</p>
          <p style="font-size: 12px; word-break: break-all; color: #2563eb;">${verificationLink}</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="font-size: 11px; color: #94a3b8; margin-bottom: 0;">Ha nem te kezdemenyezted a regisztraciot, hagyd figyelmen kivul ezt a levelet.</p>
        </div>
      `
    });

    return res.json({ success: true, message: 'A megerosito e-mail sikeresen elkuldve.' });
  } catch (error: any) {
    console.error('Hiba az e-mail kuldesekor:', error);
    return res.status(500).json({ success: false, error: error.message || 'Sikertelen e-mail kuldes.' });
  }
});

// Biztonsagos kepfeltoltes
app.use('/api/upload', uploadRoutes);

// Bejelentesek kezelese
app.get('/api/reports', handleGetReports);
app.post('/api/reports', handleCreateReport);
app.patch('/api/reports/:id/status', verifyAuthToken, requireRole(['verified_rescuer', 'super_admin']), handleUpdateStatus);

// Felhasznaloi profil valos szerepkorenek lekerese & automatikus inicializalasa
app.get('/api/me', verifyAuthToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email;

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
    const callerUid = req.user?.uid;

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

// 5. Szerver inditasa
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Allatmento Backend szerver fut a http://0.0.0.0:${PORT} cimen`);
});