import express, { Request, Response } from 'express';
import cors from 'cors';
import { verifyAuthToken } from './middleware/auth.middleware.js';
import { requireRole } from './middleware/role.middleware.js';
import { handleSetUserRole, listUsersController } from './controllers/admin.controller.js';
import { handleGetReports, handleCreateReport, handleUpdateStatus } from './controllers/reports.controller.js';
import { adminDb } from './config/firebase.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

// Engedélyezzük a GitHub Pages-t és a helyi fejlesztést is
app.use(cors({
  origin: true, // vagy: ['https://kuriouss33.github.io', 'http://localhost:3000', 'http://localhost:5173']
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 1. Rendszerállapot teszt
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'A mentő backend szerver aktív.' });
});

// 2. Bejelentések kezelése
app.get('/api/reports', handleGetReports);
app.post('/api/reports', handleCreateReport);
app.patch('/api/reports/:id/status', verifyAuthToken, requireRole(['verified_rescuer', 'super_admin']), handleUpdateStatus);

// 3. Felhasználói profil valós szerepkörének lekérése & automatikus inicializálása
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

// 4. Adminisztrációs végpontok (Kizárólag Super Admin számára)
app.get('/api/users', verifyAuthToken, requireRole(['super_admin']), listUsersController);

app.patch('/api/users/:uid/role', verifyAuthToken, requireRole(['super_admin']), (req: Request, res: Response) => {
  req.body.targetUid = req.params.uid;
  handleSetUserRole(req, res);
});

app.post('/api/admin/set-role', verifyAuthToken, requireRole(['super_admin']), handleSetUserRole);

// 5. Szerver indítása
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Állatmentő Backend szerver fut a http://0.0.0.0:${PORT} címen`);
});