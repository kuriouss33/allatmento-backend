import { Request, Response } from 'express';
import { adminDb } from '../config/firebase.js';
import { 
  getTransportsFromDb, 
  saveTransportToDb, 
  updateTransportStatusInDb, 
  deleteTransportFromDb 
} from '../services/transports.service.js';
import { TransportJob, TransportStatus } from '../types/transport.types.js';
import '../types/express.js';

// GET /api/transports
export const handleGetTransports = async (_req: Request, res: Response) => {
  try {
    const list = await getTransportsFromDb();
    res.json({
      success: true,
      count: list.length,
      transports: list
    });
  } catch (error: any) {
    console.error('Hiba a fuvarok lekérésekor:', error);
    res.status(500).json({ success: false, error: error.message || 'Sikertelen fuvar lekérés.' });
  }
};

// POST /api/transports
export const handleCreateTransport = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data.honnanVaros || !data.hovaVaros || !data.leiras || !data.feladoNev) {
      return res.status(400).json({ success: false, error: 'Hiányzó kötelező mezők a fuvarigényben (városok, leírás, feladó neve).' });
    }

    const newId = data.id || `fuvar-${Date.now()}`;
    const newJob: TransportJob = {
      ...data,
      id: newId,
      statusz: 'nyitott',
      createdAt: data.createdAt || new Date().toISOString()
    };

    await saveTransportToDb(newJob);

    res.status(201).json({
      success: true,
      id: newId,
      data: newJob
    });
  } catch (error: any) {
    console.error('Hiba a fuvar mentésekor:', error);
    res.status(500).json({ success: false, error: error.message || 'Nem sikerült elmenteni a fuvart.' });
  }
};

// PATCH /api/transports/:id/status
export const handleUpdateTransportStatus = async (req: Request, res: Response) => {
  try {
    const transportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { statusz } = req.body;

    if (!transportId || !statusz) {
      return res.status(400).json({ success: false, error: 'Hiányzó fuvar azonosító vagy státusz.' });
    }

    const updated = await updateTransportStatusInDb(transportId, statusz as TransportStatus);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Hiba a fuvar státusz frissítésekor:', error);
    res.status(500).json({ success: false, error: error.message || 'Nem sikerült frissíteni a fuvar státuszát.' });
  }
};

// DELETE /api/transports/:id
export const handleDeleteTransport = async (req: Request, res: Response) => {
  try {
    const transportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!transportId) {
      return res.status(400).json({ success: false, error: 'Hiányzó fuvar azonosító.' });
    }

    const callerUid = (req as any).user?.uid;
    if (!callerUid) {
      return res.status(401).json({ success: false, error: 'Azonosítatlan felhasználó. Kérlek jelentkezz be!' });
    }

    // Jogosultság ellenőrzése (super_admin vagy saját fuvar feladója)
    let isSuperAdmin = false;
    try {
      const userDoc = await adminDb.collection('users').doc(callerUid).get();
      const role = userDoc.data()?.role || (req as any).user?.role;
      isSuperAdmin = (role === 'super_admin');
    } catch (e) {
      console.warn('Hiba a felhasználói profil lekérésekor a törlés során:', e);
    }

    const docRef = adminDb.collection('transports').doc(transportId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.json({ success: true, message: 'A fuvar már nem található az adatbázisban.' });
    }

    const transportData = docSnap.data();
    const isCreator = transportData?.feladoUserId && transportData.feladoUserId === callerUid;

    if (!isSuperAdmin && !isCreator) {
      return res.status(403).json({ 
        success: false, 
        error: 'Kizárólag Super Admin vagy a hirdetés feladója jogosult törölni a bejegyzést.' 
      });
    }

    await docRef.delete();
    console.log(`[TransportDelete] Sikeres törlés Firestore-ból: ${transportId} (törölte: ${callerUid}, isSuperAdmin: ${isSuperAdmin})`);

    res.json({
      success: true,
      message: 'A fuvar sikeresen és véglegesen törölve lett az adatbázisból.'
    });
  } catch (error: any) {
    console.error('Hiba a fuvar törlésekor:', error);
    res.status(500).json({ success: false, error: error.message || 'Sikertelen törlés az adatbázisból.' });
  }
};
