import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const db = getFirestore();
const ADMINS_COLLECTION = 'admins';

export async function isAdminEmail(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();

  try {
    const userRecord = await getAuth().getUserByEmail(normalizedEmail);
    const customClaims = userRecord.customClaims || {};
    if (customClaims.admin === true) {
      return true;
    }
  } catch {
    // User not found in Firebase Auth, continue to check admins collection
  }

  const adminDoc = await db.collection(ADMINS_COLLECTION).doc(normalizedEmail).get();
  return adminDoc.exists;
}

export async function listAdmins(): Promise<{ email: string; role?: string }[]> {
  const admins: { email: string; role?: string }[] = [];

  // Get from admins collection
  const adminsSnapshot = await db.collection(ADMINS_COLLECTION).get();
  adminsSnapshot.docs.forEach((doc) => {
    admins.push({ email: doc.id, ...doc.data() } as { email: string; role?: string });
  });

  // Get from custom claims (first 1000 users)
  try {
    const listUsersResult = await getAuth().listUsers(1000);
    for (const userRecord of listUsersResult.users) {
      const customClaims = userRecord.customClaims || {};
      if (customClaims.admin === true && userRecord.email) {
        const existing = admins.find((a) => a.email === userRecord.email!.toLowerCase());
        if (!existing) {
          admins.push({ email: userRecord.email.toLowerCase() });
        }
      }
    }
  } catch {
    // Ignore errors listing users
  }

  return admins;
}