import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Try to initialize using google application credentials from env
try {
  initializeApp({
    projectId: 'ais-dev-mlg3t4u2susmccpu-338870' // project ID from URL
  });
} catch(e) {
  // Ignore already initialized
}

async function run() {
  const db = getFirestore();
  const logsRef = db.collection('debug_logs').orderBy('timestamp', 'desc').limit(5);
  const snapshot = await logsRef.get();
  
  if (snapshot.empty) {
    console.log('No debug logs found.');
    return;
  }
  
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data());
  });
}

run().catch(console.error);
