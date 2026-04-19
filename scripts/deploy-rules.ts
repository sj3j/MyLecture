import admin from 'firebase-admin';
import * as fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });

  const source = fs.readFileSync('firestore.rules', 'utf8');

  admin.securityRules().createRuleset({
    files: [{
      name: 'firestore.rules',
      content: source
    }]
  }).then(async ruleset => {
    console.log('Created ruleset:', ruleset.name);
    await admin.securityRules().releaseFirestoreRuleset(ruleset.name);
    console.log('Successfully released ruleset!');
    process.exit(0);
  }).catch(error => {
    console.error('Error creating ruleset:', error);
    process.exit(1);
  });
} catch (e) {
  console.log('Failed:', e);
}
