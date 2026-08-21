import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// To run this script, ensure you have a firebase-adminsdk service account key file.
// Usage: node migrateToStages.js path/to/serviceAccountKey.json

async function migrate() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Please provide the path to your Firebase Service Account JSON key.");
    console.error("Example: node migrateToStages.js ./serviceAccountKey.json");
    process.exit(1);
  }

  const serviceAccountPath = args[0];
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  console.log("Starting Migration to Multi-Stage Architecture...");
  
  // 1. Migrate Users
  console.log("Migrating users...");
  const usersSnapshot = await db.collection('users').get();
  let userCount = 0;
  
  const userBatchSize = 500;
  let userBatch = db.batch();
  
  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    if (!data.stageId) {
      userBatch.update(doc.ref, { stageId: 'stage_3' });
      userCount++;
      
      if (userCount % userBatchSize === 0) {
        await userBatch.commit();
        console.log(`Committed ${userCount} users...`);
        userBatch = db.batch();
      }
    }
  }
  
  if (userCount % userBatchSize !== 0) {
    await userBatch.commit();
  }
  console.log(`Successfully migrated ${userCount} users to stage_3.`);

  // 2. Migrate Lectures
  console.log("Migrating lectures...");
  const lecturesSnapshot = await db.collection('lectures').get();
  let lectureCount = 0;
  
  const lectureBatchSize = 500;
  let lectureBatch = db.batch();
  
  for (const doc of lecturesSnapshot.docs) {
    const data = doc.data();
    if (!data.stageId) {
      lectureBatch.update(doc.ref, { stageId: 'stage_3' });
      lectureCount++;
      
      if (lectureCount % lectureBatchSize === 0) {
        await lectureBatch.commit();
        console.log(`Committed ${lectureCount} lectures...`);
        lectureBatch = db.batch();
      }
    }
  }
  
  if (lectureCount % lectureBatchSize !== 0) {
    await lectureBatch.commit();
  }
  console.log(`Successfully migrated ${lectureCount} lectures to stage_3.`);

  // 3. Initialize Stage documents
  console.log("Initializing stage documents...");
  const stagesRef = db.collection('stages');
  
  await stagesRef.doc('stage_3').set({
    id: 'stage_3',
    nameEn: 'Stage 3',
    nameAr: 'المرحلة الثالثة',
    order: 3
  }, { merge: true });
  
  await stagesRef.doc('stage_4').set({
    id: 'stage_4',
    nameEn: 'Stage 4',
    nameAr: 'المرحلة الرابعة',
    order: 4
  }, { merge: true });
  
  await stagesRef.doc('stage_5').set({
    id: 'stage_5',
    nameEn: 'Stage 5',
    nameAr: 'المرحلة الخامسة',
    order: 5
  }, { merge: true });

  console.log("Migration complete!");
}

migrate().catch(console.error);
