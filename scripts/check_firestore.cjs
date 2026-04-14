const admin = require('firebase-admin');
const serviceAccount = require('../firebase-applet-config.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check() {
  const snapshot = await db.collection('announcements').get();
  console.log(`Found ${snapshot.size} announcements in Firestore.`);
  process.exit(0);
}

check();
