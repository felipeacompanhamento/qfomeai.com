import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    await signInWithEmailAndPassword(auth, 'felipeacompanhamento@gmail.com', 'admin123'); // assuming password? Or maybe we can't login without password.
    const q = query(collection(db, 'users'), limit(1));
    const snap = await getDocs(q);
    console.log('success', snap.size);
  } catch(e) {
    console.error(e);
  }
}
run();
