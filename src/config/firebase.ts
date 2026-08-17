import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  // 1. Ha a Render.com-on környezeti változóban van megadva a JSON
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
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