import { Request, Response } from 'express';
import { adminAuth, adminDb } from '../config/firebase.js';
import { createReport, getReports, updateReportStatus } from '../services/reports.service.js';
import { ReportStatus } from '../types/report.types.js';
import { sendNotificationToRescuers } from '../services/email.service.js';

// Segédfüggvény: Determinisztikus koordináta-elmosás (kb. 300-500 m eltolás)
function fuzzCoordinate(coord: number | undefined, seed: string, isLat: boolean): number | undefined {
  if (coord === undefined || coord === null || isNaN(coord)) return coord;
  // Egyszerű hash a bejelentés azonosítójából, hogy ne ugráljon minden frissítéskor
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const offsetMultiplier = isLat ? 0.0035 : 0.005; // ~400-500 méter szélességben és hosszúságban
  const normalized = ((Math.abs(hash) % 1000) / 1000) - 0.5; // -0.5 és +0.5 között
  return Number((coord + (normalized * offsetMultiplier)).toFixed(4));
}

// Segédfüggvény: Utca és házszám levágása publikus nézetben
function generalizeAddress(cim?: string, megye?: string): string {
  if (!cim || cim.trim() === '') {
    return megye || 'Hozzávetőleges körzet';
  }
  // Ha vesszővel tagolt a cím (pl. "Budapest, Váci út 12."), csak az első tagot hagyjuk meg (város/kerület)
  const parts = cim.split(',');
  if (parts.length > 1) {
    return `${parts[0].trim()} környéke`;
  }
  return megye || cim;
}

// GET /api/reports (GDPR telefonszám- és koordináta-maszkolással)
export const handleGetReports = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as ReportStatus | undefined;
    const reports = await getReports(status);

    // 1. Felhasználói token ellenőrzése
    let requesterUid: string | null = null;
    let isPrivileged = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        requesterUid = decodedToken.uid;

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

    // 2. Szerveroldali adatmaszkolás
    const sanitizedReports = reports.map((item: any) => {
      const data = item.adat ? item.adat : item;
      const reportId = item.id || data.id || 'seed';
      const ownerId = data.createrId;

      const isOwner = requesterUid && (ownerId === requesterUid);
      const canSeeExactData = isPrivileged || isOwner;

      const rawPhone = data.telefon || data.bejelentoTelefon;
      const hasPhone = Boolean(rawPhone && rawPhone.trim() !== '');

      const originalLat = data.lat !== undefined ? Number(data.lat) : undefined;
      const originalLon = (data.lng !== undefined ? Number(data.lng) : (data.lon !== undefined ? Number(data.lon) : undefined));

      // Koordináta és cím elmosása publikus látogatóknak
      const finalLat = canSeeExactData ? originalLat : fuzzCoordinate(originalLat, reportId, true);
      const finalLon = canSeeExactData ? originalLon : fuzzCoordinate(originalLon, reportId, false);
      const finalCim = canSeeExactData ? data.cim : generalizeAddress(data.cim, data.megye);

      const safeData = {
        ...data,
        hasPhone: hasPhone,
        telefon: canSeeExactData ? rawPhone : null,
        bejelentoTelefon: canSeeExactData ? rawPhone : null,
        lat: finalLat,
        lon: finalLon,
        lng: finalLon,
        cim: finalCim,
        isExactLocation: canSeeExactData
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

// POST /api/reports
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

// PATCH /api/reports/:id/status
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