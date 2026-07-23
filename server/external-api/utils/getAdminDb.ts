import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../../firebase-applet-config.json' with { type: 'json' };

/**
 * Returns the configured Admin Firestore database instance (handling named database ID).
 */
export function getAdminDb(): Firestore {
  if (!admin.apps.length) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
        let serviceAccount = serviceAccountJson.startsWith('{')
          ? JSON.parse(serviceAccountJson)
          : JSON.parse(Buffer.from(serviceAccountJson, 'base64').toString('utf8'));
        credential = admin.credential.cert(serviceAccount);
      } catch (e) {
        credential = admin.credential.applicationDefault();
      }
    } else {
      credential = admin.credential.applicationDefault();
    }

    admin.initializeApp({
      credential,
      projectId,
    });
  }

  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

  return databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());
}
