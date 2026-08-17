import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

// Ha még nincs inicializálva az alkalmazás, létrehozzuk
const app = getApps().length === 0 
  ? initializeApp({
      credential: cert(serviceAccountPath),
    })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);