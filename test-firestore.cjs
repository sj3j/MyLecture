require("dotenv").config();
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();
async function run() {
  const usersRef = await db.collection("users").get();
  console.log("USERS:");
  usersRef.forEach(doc => {
    if (doc.data().email === 'almdrydyl335@gmail.com') {
      console.log(doc.id, doc.data());
    }
  });

  const studentsRef = await db.collection("students").get();
  console.log("STUDENTS:");
  studentsRef.forEach(doc => {
    if (doc.data().email === 'almdrydyl335@gmail.com') {
      console.log(doc.id, doc.data());
    }
  });
  
  const authRecords = await admin.auth().getUserByEmail('almdrydyl335@gmail.com').catch(e => console.log("Not found in Auth"));
  console.log("AUTH RECORD BY EMAIL:", authRecords ? authRecords.uid : "None");
}
run().catch(console.error);
