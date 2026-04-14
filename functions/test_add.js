const admin = require('firebase-admin');
const serviceAccount = require('../firebase-applet-config.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addMock() {
  try {
    const docRef = await db.collection('announcements').add({
      type: 'text',
      text: 'هذا إعلان تجريبي من النظام للتأكد من المزامنة مع تيليجرام بعد التحديثات الأخيرة.',
      content: 'هذا إعلان تجريبي من النظام للتأكد من المزامنة مع تيليجرام بعد التحديثات الأخيرة.',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      date: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'telegram_bot',
      authorName: 'Telegram Channel'
    });
    console.log('Mock announcement added with ID:', docRef.id);
  } catch (e) {
    console.error('Error adding document:', e);
  }
  process.exit(0);
}

addMock();
