import { adminDb } from '../config/firebase.js';
import { TransportJob, TransportStatus } from '../types/transport.types.js';

const COLLECTION_NAME = 'transports';

export const INITIAL_TRANSPORTS: TransportJob[] = [
  {
    id: 'fuvar-1',
    honnanVaros: 'Debrecen',
    honnanCim: 'Állatmentő Liget Menhely',
    honnanMegye: 'Hajdú-Bihar',
    honnanLat: 47.5316,
    honnanLon: 21.6273,
    hovaVaros: 'Budapest',
    hovaCim: 'Állatorvostudományi Egyetem Klinika',
    hovaMegye: 'Budapest',
    hovaLat: 47.4979,
    hovaLon: 19.0402,
    tavolsagKm: 231,
    cargoType: 'kutya',
    cargoSize: 'kozepes',
    allatNev: 'Barni',
    allatFajta: 'Keverék kutya',
    leiras: 'Csípőműtét utáni kontrollvizsgálatra kell feljuttatni Budapestre. Szelíd, autóban nyugodt kutya.',
    crateRequirement: 'box_szukseges',
    datum: '2026-10-21',
    idosav: 'Délelőtt (09:00 - 11:30)',
    urgency: 'surgos',
    statusz: 'nyitott',
    feladoNev: 'Kovács Andrea (Liget Alapítvány)',
    feladoTelefon: '+36 30 456 7891',
    feladoSzervezet: 'Állatmentő Liget Debrecen',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    messages: []
  },
  {
    id: 'fuvar-2',
    honnanVaros: 'Szeged',
    honnanCim: 'Tappancs Tanya',
    honnanMegye: 'Csongrád-Csanád',
    honnanLat: 46.2530,
    honnanLon: 20.1414,
    hovaVaros: 'Pécs',
    hovaCim: 'Misina Természetvédő Egyesület',
    hovaMegye: 'Baranya',
    hovaLat: 46.0727,
    hovaLon: 18.2323,
    tavolsagKm: 189,
    cargoType: 'macska',
    cargoSize: 'kicsi',
    allatNev: 'Mici és Samu (2 cica)',
    allatFajta: 'Házimacska (kölykök)',
    leiras: 'Ideiglenes befogadóhoz szállítás Pécsre. Saját műanyag boxban utaznak, teljesen szobatiszták.',
    crateRequirement: 'sajat_box_van',
    datum: '2026-10-22',
    idosav: 'Délután (14:00 - 18:00)',
    urgency: 'normal',
    statusz: 'nyitott',
    feladoNev: 'Molnár Gábor',
    feladoTelefon: '+36 20 892 1123',
    feladoSzervezet: 'Tappancs Alapítvány',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: 'fuvar-3',
    honnanVaros: 'Miskolc',
    honnanCim: 'Miskolci Állategészségügyi Telep',
    honnanMegye: 'Borsod-Abaúj-Zemplén',
    honnanLat: 48.1035,
    honnanLon: 20.7784,
    hovaVaros: 'Eger',
    hovaCim: 'Egri Macska- és Kutyamentők',
    hovaMegye: 'Heves',
    hovaLat: 47.9026,
    hovaLon: 20.3772,
    tavolsagKm: 58,
    cargoType: 'adomany_tap',
    cargoSize: 'csomag',
    allatNev: '8 zsák prémium száraztáp + kötszerek',
    leiras: 'Németországi adománycsomag továbbítása az egri menhely számára. Egy kombi vagy ferdehátú autó csomagtartójában elfér.',
    crateRequirement: 'nem_szukseges',
    datum: '2026-10-23',
    idosav: 'Rugalmas (egész nap)',
    urgency: 'normal',
    statusz: 'nyitott',
    feladoNev: 'Varga Zsolt',
    feladoTelefon: '+36 70 334 5566',
    feladoSzervezet: 'Miskolci Mentőcsapat',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: 'fuvar-4',
    honnanVaros: 'Győr',
    honnanCim: 'Győri Állatmenhely',
    honnanMegye: 'Győr-Moson-Sopron',
    honnanLat: 47.6875,
    honnanLon: 17.6504,
    hovaVaros: 'Budapest',
    hovaCim: 'Noé Állatotthon Alapítvány (XVII. kerület)',
    hovaMegye: 'Budapest',
    hovaLat: 47.4810,
    hovaLon: 19.2450,
    tavolsagKm: 135,
    cargoType: 'kutya',
    cargoSize: 'nagy',
    allatNev: 'Max (idős labrador)',
    allatFajta: 'Labrador retriever',
    leiras: 'Látássérült idős labrador rehabilitációra és fizioterápiára szállítása a Noé Állatotthonba.',
    crateRequirement: 'nem_szukseges',
    datum: '2026-10-21',
    idosav: 'Pontosan 10:00 órára',
    urgency: 'fix_idopont',
    statusz: 'nyitott',
    feladoNev: 'Szabó Péter',
    feladoTelefon: '+36 30 111 2233',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'fuvar-5',
    honnanVaros: 'Székesfehérvár',
    honnanCim: 'Herosz Állatotthon',
    honnanMegye: 'Fejér',
    honnanLat: 47.1899,
    honnanLon: 18.4103,
    hovaVaros: 'Veszprém',
    hovaCim: 'Veszprémi Állatvédő Egyesület',
    hovaMegye: 'Veszprém',
    hovaLat: 47.0933,
    hovaLon: 17.9115,
    tavolsagKm: 44,
    cargoType: 'macska',
    cargoSize: 'kicsi',
    allatNev: 'Cirmi és Kormi',
    allatFajta: 'Európai rövidszőrű',
    leiras: 'Két fiatal felnőtt cica átadása a veszprémi partner-menhelynek, ahol gazdijelöltek várják őket.',
    crateRequirement: 'sajat_box_van',
    datum: '2026-10-22',
    idosav: 'Kora reggel (07:30 - 09:00)',
    urgency: 'normal',
    statusz: 'megoldva',
    feladoNev: 'Horváth Éva',
    feladoTelefon: '+36 70 998 8776',
    feladoSzervezet: 'Herosz Fehérvári Állatotthon',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    megoldvaAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  }
];

// 1. Fuvarok lekérése Firestore-ból
export const getTransportsFromDb = async (): Promise<TransportJob[]> => {
  const snapshot = await adminDb.collection(COLLECTION_NAME).orderBy('createdAt', 'desc').get();
  
  if (snapshot.empty) {
    // Ha a kollekció még teljesen üres, seedeljük be a kezdeti adatokat az adatbázisba
    for (const job of INITIAL_TRANSPORTS) {
      await adminDb.collection(COLLECTION_NAME).doc(job.id).set(job);
    }
    return INITIAL_TRANSPORTS;
  }

  return snapshot.docs.map((docSnap: any) => ({
    id: docSnap.id,
    ...docSnap.data()
  } as TransportJob));
};

// 2. Új fuvar mentése Firestore-ba
export const saveTransportToDb = async (job: TransportJob): Promise<TransportJob> => {
  const docRef = adminDb.collection(COLLECTION_NAME).doc(job.id);
  const cleanJob = Object.fromEntries(
    Object.entries(job).filter(([_, v]) => v !== undefined)
  );
  await docRef.set(cleanJob);
  return job;
};

// 3. Státusz frissítése
export const updateTransportStatusInDb = async (id: string, newStatus: TransportStatus): Promise<any> => {
  const docRef = adminDb.collection(COLLECTION_NAME).doc(id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new Error('A keresett fuvar nem található.');
  }

  const isSolved = newStatus === 'megoldva' || newStatus === 'teljesitve';
  const updateData: any = {
    statusz: newStatus,
    updatedAt: new Date().toISOString(),
    ...(isSolved ? { megoldvaAt: new Date().toISOString() } : { megoldvaAt: null })
  };

  await docRef.update(updateData);
  return { id, ...updateData };
};

// 4. Fuvar végleges törlése Firestore-ból
export const deleteTransportFromDb = async (id: string): Promise<boolean> => {
  const docRef = adminDb.collection(COLLECTION_NAME).doc(id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    // Ha már nem létezik, tekintsük sikeresen töröltnek
    return true;
  }
  await docRef.delete();
  return true;
};
