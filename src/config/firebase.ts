import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  // 1. Ha környezeti változóban van megadva a JSON (Vercel vagy Render)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      // Ha base64-ként lett bemásolva a Vercel felületére, dekódoljuk
      if (!raw.startsWith('{') && !raw.startsWith('[')) {
        try {
          raw = Buffer.from(raw, 'base64').toString('utf-8');
        } catch {
          // Ha nem base64, megpróbáljuk a nyers értéket
        }
      }
      const serviceAccount = JSON.parse(raw);
      return initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (error) {
      console.error('Hiba a FIREBASE_SERVICE_ACCOUNT feldolgozásakor:', error);
    }
  }

  // 2. Ha helyi gépen van a fájl
  const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    return initializeApp({
      credential: cert(serviceAccountPath),
    });
  }

  throw new Error('Nem található érvényes Firebase hitelesítő kulcs sem környezeti változóban, sem fájlként!');
}

let _cachedApp: App | null = null;

function getOrInitApp(): App {
  if (_cachedApp) return _cachedApp;
  _cachedApp = initializeFirebaseAdmin();
  return _cachedApp;
}

// Biztonságos proxy export, hogy a szerver indulása (pl. /api/health ellenőrzés)
// ne omoljon össze, ha a környezeti változók éppen frissülnek.
export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop) {
    const auth = getAuth(getOrInitApp());
    const val = (auth as any)[prop];
    return typeof val === 'function' ? val.bind(auth) : val;
  }
});

let _cachedDb: ReturnType<typeof getFirestore> | null = null;

function getOrInitDb(): ReturnType<typeof getFirestore> {
  if (_cachedDb) return _cachedDb;
  _cachedDb = getFirestore(getOrInitApp());
  try {
    _cachedDb.settings({ ignoreUndefinedProperties: true });
  } catch {
    // ignore
  }
  return _cachedDb;
}

export const adminDb = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop) {
    const db = getOrInitDb();
    const val = (db as any)[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  }
});