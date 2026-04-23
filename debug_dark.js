import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const usersSnap = await getDocs(query(collection(db, 'users'), where('name', '==', 'DARK')));
  for (const doc of usersSnap.docs) {
    console.log('USER DOC "DARK":', { id: doc.id, ...doc.data() });
  }

  const stuSnap = await getDocs(query(collection(db, 'students'), where('email', '==', 'ph2023099@student.alsafwa.edu.iq')));
  for (const doc of stuSnap.docs) {
    console.log('STUDENT DOC "ph2023099...":', { id: doc.id, ...doc.data() });
  }

  const stuSnapByID = await getDocs(collection(db, 'students'));
  for (const doc of stuSnapByID.docs) {
    if (doc.id === 'ph2023099@student.alsafwa.edu.iq' || doc.data().email === 'ph2023099@student.alsafwa.edu.iq') {
        console.log('STUDENT DOC BY ITERATION:', { id: doc.id, ...doc.data() });
    }
  }

  const usersEmailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', 'ph2023099@student.alsafwa.edu.iq')));
  for (const doc of usersEmailSnap.docs) {
    console.log('USER BY EMAIL:', { id: doc.id, ...doc.data() });
  }
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
