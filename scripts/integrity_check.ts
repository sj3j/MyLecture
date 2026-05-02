import 'dotenv/config';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

async function run() {
  console.log("Starting Data Integrity Check...");
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  let totalUsers = snapshot.size;
  let wrongDateFormat = 0;
  let invalidStreakCounts = 0;
  let negativeFreezeTokens = 0;
  let longestStreakLessThanStreak = 0;
  
  const suspiciousUsers = [];
  
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Baghdad"
  }); // returns "YYYY-MM-DD"
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const uid = doc.id;
    let issues = [];
    
    // Check Date format (should be YYYY-MM-DD)
    if (data.lastActiveDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.lastActiveDate)) {
        issues.push(`lastActiveDate is not YYYY-MM-DD format: ${data.lastActiveDate}`);
        wrongDateFormat++;
      }
    }
    
    // Check for negative freeze tokens
    if (data.freezeTokens < 0) {
      issues.push(`negative freeze tokens: ${data.freezeTokens}`);
      negativeFreezeTokens++;
    }
    
    // Check for longest streak < current streak
    if ((data.streakCount || 0) > (data.longestStreak || 0)) {
       issues.push(`longestStreak (${data.longestStreak || 0}) is less than streakCount (${data.streakCount || 0})`);
       longestStreakLessThanStreak++;
    }
    
    if (issues.length > 0) {
      suspiciousUsers.push({
        uid,
        email: data.email,
        issues
      });
    }
  });

  console.log("========== DATA INTEGRITY REPORT ==========");
  console.log(`Total Users Checked: ${totalUsers}`);
  console.log(`Users with wrong date format: ${wrongDateFormat}`);
  console.log(`Users with negative freeze tokens: ${negativeFreezeTokens}`);
  console.log(`Users with longestStreak < streakCount: ${longestStreakLessThanStreak}`);
  
  if (suspiciousUsers.length > 0) {
      console.log("\nDetails of suspicious users:");
      suspiciousUsers.forEach(u => {
          console.log(`User ${u.email} (UID: ${u.uid}):`);
          u.issues.forEach(iss => console.log(`  - ${iss}`));
      });
  } else {
      console.log("\nNo suspicious users found!");
  }
}

run().catch(console.error);
