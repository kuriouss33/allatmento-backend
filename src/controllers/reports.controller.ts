import { Request, Response } from 'express';
import { adminAuth, adminDb } from '../config/firebase.js';
import { createReport, getReports, updateReportStatus } from '../services/reports.service.js';
import { ReportStatus } from '../types/report.types.js';
import { sendNotificationToRescuers } from '../services/email.service.js';

// GET /api/reports (GDPR telefonszám-maszkolással)
export const handleGetReports = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as ReportStatus | undefined;
    const reports = await getReports(status);

    // 1. Megvizsgáljuk, hogy érkezett-e hitelesített token
    let requesterUid: string | null = null;
    let isPrivileged = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        requesterUid = decodedToken.uid;

        // Lekérdezzük a szerepkört a Firestore users kollekcióból
        const userDoc = await adminDb.collection('users').doc(requesterUid).get();
        if (userDoc.exists) {
          const role = userDoc.data()?.role;
          isPrivileged = (role === 'verified_rescuer' || role === 'super_admin');
        }
      } catch (tokenErr) {
        requesterUid = null;
        isPrivileged = false;
      }
    }

    // 2. Szerveroldali szűrés: csak mentők vagy a saját bejelentő kaphatja meg a számot
    const sanitizedReports = reports.map((item: any) => {
      const data = item.adat ? item.adat : item;
      const reportId = item.id || data.id;
      const ownerId = data.createrId;

      const isOwner = requesterUid && (ownerId === requesterUid);
      const canSeePhone = isPrivileged || isOwner;

      const safeData = {
        ...data,
        telefon: canSeePhone ? (data.telefon || data.bejelentoTelefon || null) : null,
        bejelentoTelefon: canSeePhone ? (data.bejelentoTelefon || data.telefon || null) : null
      };

      return {
        id: reportId,
        adat: safeData,
        ...safeData
      };
    });

    res.json({
      success: true,
      count: sanitizedReports.length,
      data: sanitizedReports,
      reports: sanitizedReports
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/reports (Új bejelentés + Automatikus mentői e-mail riasztás)
export const handleCreateReport = async (req: Request, res: Response) => {
  try {
    const {
      allatFajta,
      fajta,
      allapot,
      helyszinLeiras,
      megjegyzes,
      megye,
      cim,
      lat,
      lng,
      lon,
      bejelentoNev,
      bejelentoTelefon,
      telefon,
      kepUrl,
      fotoUrl,
      createrId
    } = req.body;

    const finalFajta = allatFajta || fajta;
    const finalLat = lat !== undefined ? Number(lat) : undefined;
    const finalLon = lng !== undefined ? Number(lng) : (lon !== undefined ? Number(lon) : undefined);
    const finalMegjegyzes = helyszinLeiras || megjegyzes || '';
    const finalTelefon = bejelentoTelefon || telefon || '';
    const finalKepUrl = kepUrl || fotoUrl || null;
    const finalMegye = megye || 'Ismeretlen';

    if (!finalFajta || finalLat === undefined || finalLon === undefined) {
      return res.status(400).json({
        success: false,
        error: 'A fajta és a GPS koordináták (lat, lon/lng) megadása kötelező.'
      });
    }

    const report = await createReport({
      allatFajta: finalFajta,
      allapot: allapot || 'Ismeretlen',
      helyszinLeiras: finalMegjegyzes,
      megye: finalMegye,
      cim: cim || '',
      lat: finalLat,
      lng: finalLon,
      bejelentoNev: bejelentoNev || 'Névtelen bejelentő',
      bejelentoTelefon: finalTelefon,
      kepUrl: finalKepUrl,
      createrId: createrId || (req as any).user?.uid || 'anonymous'
    });

    sendNotificationToRescuers({
      allatFajta: finalFajta,
      megye: finalMegye,
      megjegyzes: finalMegjegyzes,
      telefon: finalTelefon,
      lat: finalLat,
      lon: finalLon
    }).catch((err) => console.error('E-mail küldési hiba a háttérben:', err));

    res.status(201).json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// PATCH /api/reports/:id/status (Státuszváltás & Zárójelentés fotóval)
export const handleUpdateStatus = async (req: Request, res: Response) => {
  try {
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, lezarasMegjegyzes, lezarasFotoUrl } = req.body;
    const rescuerUid = (req as any).user?.uid || 'unknown_rescuer';
    const rescuerName = (req as any).user?.email || 'Mentő';

    if (!reportId) {
      return res.status(400).json({ success: false, error: 'Hiányzó bejelentés azonosító.' });
    }

    if (!status) {
      return res.status(400).json({ success: false, error: 'Hiányzó új státusz.' });
    }

    const updated = await updateReportStatus(
      reportId,
      status,
      rescuerUid,
      rescuerName,
      lezarasMegjegyzes,
      lezarasFotoUrl
    );

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};