import admin from "firebase-admin";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: "Firebase Admin is not configured." });
  }

  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const db = admin.firestore();
    const studentDoc = await db.collection('students').doc(email.toLowerCase()).get();

    if (!studentDoc.exists) {
      return res.status(401).json({ error: "الباسورد أو الإيميل خطأ" });
    }

    const studentData = studentDoc.data();

    if (!studentData?.isActive) {
      return res.status(403).json({ error: "تم تعطيل حسابك" });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    let isMatch = hashedPassword === studentData?.password;
    
    if (!isMatch) {
      try {
        isMatch = await bcrypt.compare(password, studentData?.password || '');
      } catch (e) {
        // Ignore bcrypt errors if it's not a valid bcrypt hash
      }
    }

    // Fallback for plain text password
    if (!isMatch && password === studentData?.password) {
      isMatch = true;
    }
    
    if (!isMatch) {
      return res.status(401).json({ error: "الباسورد أو الإيميل خطأ" });
    }

    // Create custom token with email claim
    const customToken = await admin.auth().createCustomToken(email.toLowerCase(), {
      email: email.toLowerCase()
    });
    
    return res.status(200).json({ token: customToken });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
