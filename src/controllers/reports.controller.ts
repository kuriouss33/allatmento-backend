import { Request, Response } from 'express';
import { adminAuth, adminDb } from '../config/firebase.js';
import { createReport, getReports, updateReportStatus } from '../services/reports.service.js';
import { ReportStatus } from '../types/report.types.js';
import { sendNotificationToRescuers } from '../services/email.service.js';
import { autoTranslate } from '../services/translate.service.js';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

// Segédfüggvény: Determinisztikus koordináta-elmosás (kb. 80-100 m eltolás)
function fuzzCoordinate(coord: number | undefined, seed: string, isLat: boolean): number | undefined {
  if (coord === undefined || coord === null || isNaN(coord)) return coord;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const offsetMultiplier = isLat ? 0.0008 : 0.0011; // ~80-100 méter szélességben és hosszúságban
  const normalized = ((Math.abs(hash) % 1000) / 1000) - 0.5;
  return Number((coord + (normalized * offsetMultiplier)).toFixed(5));
}

// Segédfüggvény: Házszám levágása publikus nézetben (város + utcanév megmarad)
function generalizeAddress(cim?: string, megye?: string): string {
  if (!cim || cim.trim() === '') {
    return megye || 'Hozzávetőleges körzet';
  }

  // Eltávolítja a házszámot a cím végéről (pl. "Budapest, Kossuth Lajos utca 45/B." -> "Budapest, Kossuth Lajos utca környéke")
  const utcaHazszamNelkul = cim
    .replace(/\s+\d+[\s\S]*$/, '') // Levágja a számokat és az utána lévő betűket/lépcsőházat
    .replace(/[,\.\s]+$/, '')        // Levágja a felesleges vesszőt és pontot a végéről
    .trim();

  return utcaHazszamNelkul ? `${utcaHazszamNelkul} környéke` : (megye || 'Hozzávetőleges körzet');
}

// GET /api/reports (GDPR telefonszám- és koordináta-maszkolással)
export const handleGetReports = async (req: Request, res: Response) => {
  try {
    const rawStatus = req.query.status as string | undefined;
    const allowedStatuses: ReportStatus[] = ['fuggoben', 'folyamatban', 'megoldva'];
    const status = (rawStatus && allowedStatuses.includes(rawStatus as ReportStatus)) 
      ? (rawStatus as ReportStatus) 
      : undefined;

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

      // GDPR védelem az önkéntesek telefonszámaira a kommentekben
      let safeKommentek = data.kommentek;
      if (Array.isArray(safeKommentek)) {
        safeKommentek = safeKommentek.map((k: any) => {
          if (!canSeeExactData && k && k.isHelpOffer) {
            return {
              ...k,
              phone: null,
              szoveg: '🤝 Segítő jelentkezett erre a mentésre (elérhetőség a mentők számára látható).'
            };
          }
          return k;
        });
      }

      const safeData = {
        ...data,
        kommentek: safeKommentek,
        hasPhone: hasPhone,
        telefon: canSeeExactData ? rawPhone : null,
        bejelentoTelefon: canSeeExactData ? rawPhone : null,
        lat: finalLat,
        lon: finalLon,
        lng: finalLon,
        cim: finalCim,
        isExactLocation: canSeeExactData
      };

      // A titkos törlési kulcs soha nem kerülhet a publikus válaszba
      delete safeData.deleteToken;

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

    // Ha van hitelesített token a kérésben, abból vesszük a valódi létrehozó UID-t
    let verifiedCreatorUid: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
        verifiedCreatorUid = decoded.uid;
      } catch (tokenErr) {
        // Hibás vagy lejárt token
      }
    }

    // Titkos törlési token generálása (biztonságos törléshez unauthenticated állapotban)
    const deleteToken = crypto.randomBytes(24).toString('hex');
    const finalCreaterId = verifiedCreatorUid || createrId || 'anonymous';

    const megjegyzesEn = await autoTranslate(finalMegjegyzes, 'en');
    const report = await createReport({
      allatFajta: finalFajta,
      allapot: allapot || 'Ismeretlen',
      helyszinLeiras: finalMegjegyzes,
      megjegyzes_en: megjegyzesEn,
      megye: finalMegye,
      cim: cim || '',
      lat: finalLat,
      lng: finalLon,
      bejelentoNev: bejelentoNev || 'Névtelen bejelentő',
      bejelentoTelefon: finalTelefon,
      kepUrl: finalKepUrl,
      createrId: finalCreaterId,
      deleteToken: deleteToken
    });

    sendNotificationToRescuers({
      allatFajta: finalFajta,
      megye: finalMegye,
      megjegyzes: finalMegjegyzes,
      telefon: finalTelefon,
      lat: finalLat,
      lon: finalLon
    }).catch((err) => console.error('E-mail küldési hiba a háttérben:', err));

    // A választ visszaküldő fél megkapja a deleteTokent a későbbi biztonságos törléshez
    res.status(201).json({ success: true, data: report, deleteToken: deleteToken });
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

    // 1. Meglévő szerviz meghívása a szabványos 6 paraméterrel
    const updated = await updateReportStatus(
      reportId,
      status,
      rescuerUid,
      rescuerName,
      lezarasMegjegyzes,
      lezarasFotoUrl
    );

    // 2. Ha volt lezárási szöveg, lefordítjuk és közvetlenül elmentjük angolul is
    if (lezarasMegjegyzes && typeof lezarasMegjegyzes === 'string') {
      try {
        const lezarasEn = await autoTranslate(lezarasMegjegyzes, 'en');
        await adminDb.collection('bejelentesek').doc(reportId).update({
          lezaras_en: lezarasEn
        });
      } catch (transErr) {
        console.warn('Nem sikerült lefordítani a lezárási szöveget:', transErr);
      }
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /api/reports/:id (IDOR védelem: szigorú token vagy deleteToken ellenőrzés)
export const handleDeleteReport = async (req: Request, res: Response) => {
  try {
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const clientDeleteToken = (req.headers['x-delete-token'] as string) || req.body?.deleteToken;

    if (!reportId) {
      return res.status(400).json({ success: false, error: 'Hiányzó bejelentés azonosító.' });
    }

    const docRef = adminDb.collection('bejelentesek').doc(reportId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: 'A bejelentés nem található.' });
    }

    const reportData = docSnap.data();

    let requesterUid: string | null = null;
    let isSuperAdmin = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
        requesterUid = decodedToken.uid;
        const userDoc = await adminDb.collection('users').doc(requesterUid).get();
        if (userDoc.exists && userDoc.data()?.role === 'super_admin') {
          isSuperAdmin = true;
        }
      } catch (err) {
        // Hibás vagy lejárt token
      }
    }

    // 1. Super admin bármelyik bejelentést törölheti
    // 2. A hitelesített tulajdonos törölheti saját bejelentését
    // 3. A létrehozáskor kapott titkos deleteToken birtokosa törölheti
    const isOwnerByAuth = Boolean(requesterUid && reportData?.createrId === requesterUid);
    const isOwnerBySecret = Boolean(clientDeleteToken && reportData?.deleteToken && clientDeleteToken === reportData.deleteToken);

    if (!isSuperAdmin && !isOwnerByAuth && !isOwnerBySecret) {
      return res.status(403).json({ success: false, error: 'Nincs jogosultságod törölni ezt a bejelentést.' });
    }

    await docRef.delete();
    return res.json({ success: true, message: 'Bejelentés sikeresen törölve.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/reports/:id/help-offer (Biztonságos önkéntes segítség felajánlás)
export const handleHelpOffer = async (req: Request, res: Response) => {
  try {
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, phone, message } = req.body;

    if (!reportId) {
      return res.status(400).json({ success: false, error: 'Hiányzó bejelentés azonosító.' });
    }

    if (!name || !phone) {
      return res.status(400).json({ success: false, error: 'A név és a telefonszám megadása kötelező.' });
    }

    const docRef = adminDb.collection('bejelentesek').doc(reportId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: 'A bejelentés nem található.' });
    }

    let callerUid = 'volunteer_' + Math.random().toString(36).substring(2, 9);
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
        callerUid = decoded.uid;
      } catch (err) {}
    }

    const segitoUzenet = `🤝 SEGÍTŐ JELENTKEZETT!\nNév: ${name}\nTelefon: ${phone}${message ? `\nÜzenet: ${message}` : ''}`;
    const ujKommentObj = {
      userId: callerUid,
      userName: name,
      phone: phone,
      szoveg: segitoUzenet,
      isHelpOffer: true,
      idopont: new Date().toISOString()
    };

    await docRef.update({
      kommentek: FieldValue.arrayUnion(ujKommentObj)
    });

    return res.json({ success: true, message: 'Segítség felajánlása sikeresen rögzítve.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/reports/:id/comments (Biztonságos belső üzenetküldés ellenőrzött feleknek)
export const handleAddComment = async (req: Request, res: Response) => {
  try {
    const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { szoveg } = req.body;
    const callerUid = (req as any).user?.uid;

    if (!reportId || !szoveg || typeof szoveg !== 'string' || szoveg.trim() === '') {
      return res.status(400).json({ success: false, error: 'Hiányzó azonosító vagy üres üzenet.' });
    }

    const docRef = adminDb.collection('bejelentesek').doc(reportId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ success: false, error: 'A bejelentés nem található.' });
    }

    const reportData = docSnap.data();
    const isCallerSuperAdmin = (req as any).user?.role === 'super_admin';
    const isCreator = reportData?.createrId === callerUid;
    const isAssignee = reportData?.vallaloId === callerUid || reportData?.rescuerUid === callerUid;

    if (!isCallerSuperAdmin && !isCreator && !isAssignee) {
      return res.status(403).json({ success: false, error: 'Nincs jogosultságod üzenetet írni ehhez az ügyhöz.' });
    }

    const ujKommentObj = {
      userId: callerUid,
      szoveg: szoveg.trim(),
      idopont: new Date().toISOString()
    };

    await docRef.update({
      kommentek: FieldValue.arrayUnion(ujKommentObj)
    });

    return res.json({ success: true, message: 'Üzenet sikeresen elküldve.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};