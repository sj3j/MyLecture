import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function addMockAnnouncement() {
  try {
    const docRef = await addDoc(collection(db, 'announcements'), {
      type: 'text',
      text: 'هذا إعلان تجريبي من النظام للتأكد من المزامنة مع تيليجرام.',
      content: 'هذا إعلان تجريبي من النظام للتأكد من المزامنة مع تيليجرام.',
      createdAt: serverTimestamp(),
      date: serverTimestamp(),
      createdBy: 'telegram_bot',
      authorName: 'Telegram Channel'
    });
    console.log('Mock announcement added with ID:', docRef.id);
  } catch (e) {
    console.error('Error adding document:', e);
  }
  process.exit(0);
}

addMockAnnouncement();
