import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // 1. Opció: Ha a Render.com-on környezeti változóban van megadva a JSON string
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (error) {
      console.error('Hiba a FIREBASE_SERVICE_ACCOUNT környezeti változó feldolgozásakor:', error);
    }
  }

  // 2. Opció: Helyi fejlesztés során a gépen lévő fájlból olvasunk
  const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
  }

  throw new Error('Nem található érvényes Firebase hitelesítő kulcs sem környezeti változóban, sem fájlként!');
}

const app = initializeFirebaseAdmin();
export const adminAuth = admin.auth(app);
export const adminDb = admin.firestore(app);