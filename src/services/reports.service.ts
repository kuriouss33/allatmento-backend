import { adminDb } from '../config/firebase.js';
import { CreateReportDTO, Report, ReportStatus } from '../types/report.types.js';

const COLLECTION_NAME = 'bejelentesek';

// 1. Új bejelentés rögzítése
export const createReport = async (data: CreateReportDTO): Promise<Report> => {
  const timestamp = new Date().toISOString();
  
  const newReport: Omit<Report, 'id'> = {
    ...data,
    status: 'fuggoben',
    rescuerUid: null,
    rescuerName: null,
    createdAt: timestamp,
  };

  const docRef = await adminDb.collection(COLLECTION_NAME).add({
    ...newReport,
    status: 'fuggoben',
    statusz: 'uj', // Garantáltan szinkronban az új állapottal
    updatedAt: timestamp
  });

  return { id: docRef.id, ...newReport };
};

// 2. Bejelentések listázása
export const getReports = async (statusFilter?: ReportStatus) => {
  let query: any = adminDb.collection(COLLECTION_NAME);

  if (statusFilter) {
    query = query.where('status', '==', statusFilter);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').get();
  return snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  }));
};

// 3. Státusz módosítása és lezárás fotóval
export const updateReportStatus = async (
  reportId: string, 
  status: ReportStatus, 
  rescuerUid: string, 
  rescuerName?: string,
  lezarasMegjegyzes?: string,
  lezarasFotoUrl?: string
) => {
  const docRef = adminDb.collection(COLLECTION_NAME).doc(reportId);
  const doc = await docRef.get();

  if (!docSnapExists(doc)) {
    throw new Error('A bejelentés nem található.');
  }

  // A státusz normalizálása: ha a kliens felől 'uj' érkezik, átváltjuk 'fuggoben'-re
  const normalizedStatus: ReportStatus = (status === ('uj' as any)) ? 'fuggoben' : status;

  const updateData: any = {
    status: normalizedStatus,
    statusz: normalizedStatus === 'fuggoben' ? 'uj' : normalizedStatus,
    updatedAt: new Date().toISOString()
  };

  if (normalizedStatus === 'folyamatban') {
    updateData.rescuerUid = rescuerUid;
    updateData.rescuerName = rescuerName || 'Mentő';
    updateData.vallaloId = rescuerUid;
  } else if (normalizedStatus === 'megoldva') {
    updateData.resolvedAt = new Date().toISOString();
    if (lezarasMegjegyzes) updateData.lezarasMegjegyzes = lezarasMegjegyzes;
    if (lezarasFotoUrl) updateData.lezarasFotoUrl = lezarasFotoUrl;
  } else if (normalizedStatus === 'fuggoben') {
    // Itt fut le a vállalás visszamondása vagy újranyitása
    updateData.rescuerUid = null;
    updateData.rescuerName = null;
    updateData.vallaloId = null;
    updateData.lezarasMegjegyzes = null;
    updateData.lezarasFotoUrl = null;
  }

  await docRef.update(updateData);
  return { id: reportId, ...updateData };
};

// Segéd a típushelyes Firestore snapshot létezés ellenőrzéshez
function docSnapExists(doc: any): boolean {
  return typeof doc.exists === 'function' ? doc.exists() : Boolean(doc.exists);
}