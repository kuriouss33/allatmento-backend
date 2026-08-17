import { adminAuth, adminDb } from '../config/firebase.js';

export type UserRole = 'public' | 'verified_rescuer' | 'dispatcher' | 'super_admin';

export const setUserRoleInSystem = async (uid: string, role: UserRole, adminUid: string) => {
  // 1. Firebase Custom Claims beállítása a tokenbe
  await adminAuth.setCustomUserClaims(uid, { role });

  // 2. Mentés a Firestore adatbázis 'users' gyűjteményébe
  const userRef = adminDb.collection('users').doc(uid);
  await userRef.set(
    {
      role,
      status: role === 'verified_rescuer' ? 'active' : 'pending_approval',
      metadata: {
        updatedAt: new Date().toISOString(),
        approvedBy: adminUid,
      },
    },
    { merge: true }
  );

  return { success: true, uid, role };
};

export async function getAllUsersFromSystem() {
  const snapshot = await adminDb.collection('users').get();
  return snapshot.docs.map(doc => ({
    uid: doc.id,
    ...doc.data()
  }));
}