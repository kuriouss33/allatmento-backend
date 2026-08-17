import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { verifyAuthToken } from './middleware/auth.middleware.js';
import { requireRole } from './middleware/role.middleware.js';
import { handleSetUserRole, listUsersController } from './controllers/admin.controller.js';
import { handleGetReports, handleCreateReport, handleUpdateStatus } from './controllers/reports.controller.js';
import { adminAuth, adminDb } from './config/firebase.js';
import uploadRoutes from './routes/upload.routes.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// 1. CORS beállítások (egységes konfiguráció a middleware lánc legelején)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Kéréstest (JSON body) értelmezése
app.use(express.json());

// 3. Globális Rate Limiter az összes /api végpontra
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 15 perc alatt max 100 kérés IP-címenként
  message: {
    success: false,
    error: 'Túl sok kérés érkezett a szerver felé. Kérlek, próbáld újra pár perc múlva!'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', globalApiLimiter);

// 4. Útvonalak (Routes)

// Rendszerállapot teszt
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'A mentő backend szerver aktív.' });
});

// Biztonságos képfeltöltés
app.use('/api/upload', uploadRoutes);

// Bejelentések kezelése
app.get('/api/reports', handleGetReports);
app.post('/api/reports', handleCreateReport);
app.patch('/api/reports/:id/status', verifyAuthToken, requireRole(['verified_rescuer', 'super_admin']), handleUpdateStatus);

// Felhasználói profil valós szerepkörének lekérése & automatikus inicializálása
app.get('/api/me', verifyAuthToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email;

    if (!uid) {
      return res.status(401).json({ success: false, error: 'Azonosítatlan felhasználó.' });
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();

    // Ha még nincs dokumentuma a Firestore-ban (friss regisztráció), létrehozzuk szerveroldalon:
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

// Adminisztrációs végpontok (Kizárólag Super Admin számára)
app.get('/api/users', verifyAuthToken, requireRole(['super_admin']), listUsersController);

app.patch('/api/users/:uid/role', verifyAuthToken, requireRole(['super_admin']), (req: Request, res: Response) => {
  req.body.targetUid = req.params.uid;
  handleSetUserRole(req, res);
});

app.post('/api/admin/set-role', verifyAuthToken, requireRole(['super_admin']), handleSetUserRole);

// Felhasználó végleges törlése a rendszerből (Firebase Auth + Firestore)
app.delete('/api/users/:uid', verifyAuthToken, requireRole(['super_admin']), async (req: Request, res: Response) => {
  try {
    const targetUid = Array.isArray(req.params.uid) ? req.params.uid[0] : req.params.uid;
    const callerUid = req.user?.uid;

    if (!targetUid) {
      return res.status(400).json({ success: false, error: 'Hiányzó felhasználói azonosító.' });
    }

    if (targetUid === callerUid) {
      return res.status(400).json({ success: false, error: 'Saját magadat nem törölheted a rendszerből!' });
    }

    // 1. Törlés Firebase Auth-ból
    try {
      await adminAuth.deleteUser(targetUid);
    } catch (authErr: any) {
      console.warn('Auth user törlés figyelmeztetés:', authErr.message);
    }

    // 2. Törlés Firestore 'users' gyűjteményből
    await adminDb.collection('users').doc(targetUid).delete();

    return res.json({ success: true, message: 'Felhasználó sikeresen törölve a rendszerből.' });
  } catch (error: any) {
    console.error('Hiba a felhasználó törlésekor:', error);
    return res.status(500).json({ success: false, error: error.message || 'Hiba a törlés során.' });
  }
});

// 5. Szerver indítása
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Állatmentő Backend szerver fut a http://0.0.0.0:${PORT} címen`);
});