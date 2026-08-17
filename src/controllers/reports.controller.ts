import { Request, Response } from 'express';
import { createReport, getReports, updateReportStatus } from '../services/reports.service.js';
import { ReportStatus } from '../types/report.types.js';
import { sendNotificationToRescuers } from '../services/email.service.js';

// GET /api/reports
export const handleGetReports = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as ReportStatus | undefined;
    const reports = await getReports(status);
    res.json({ success: true, count: reports.length, data: reports });
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
      createrId: createrId || req.user?.uid || 'anonymous'
    });

    // Automatikus e-mail értesítés indítása a mentők felé
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
    const rescuerUid = req.user?.uid || 'unknown_rescuer';
    const rescuerName = req.user?.email || 'Mentő';

    if (!reportId) {
      return res.status(400).json({ success: false, error: 'Hiányzó bejelentés azonosító.' });
    }

    if (!status) {
      return res.status(400).json({ success: false, error: 'Hiányzó új státusz.' });
    }

    // Itt adjuk át a lezárási szöveget és a fotó url-t is:
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