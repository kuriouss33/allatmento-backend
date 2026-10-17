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

const app = initializeFirebaseAdmin();
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);