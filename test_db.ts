import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
const credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!));
admin.initializeApp({ credential, projectId: "flutterflow-buscando-sheets" });
const db = getFirestore(admin.app(), 'ai-studio-62098aac-79bb-45ec-a026-48c52eebeb00');

async function check() {
  const rests = await db.collection('restaurants').limit(1).get();
  if (rests.empty) return;
  const collections = await rests.docs[0].ref.listCollections();
  console.log('Subcollections of restaurant:');
  for (const c of collections) {
    console.log(c.id);
  }
}
check();
