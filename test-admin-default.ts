import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const projectId = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
const adminApp = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: projectId
});

const db = getFirestore(adminApp);

async function test() {
  try {
    const sn = await db.collection('restaurants').limit(1).get();
    console.log('Success, size:', sn.size);
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
