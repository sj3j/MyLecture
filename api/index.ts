import express from "express";
import admin from "firebase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(express.json());

// Initialize Firebase Admin for FCM
if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      console.log("Firebase Admin initialized for Push Notifications.");
    }
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

// Initialize Cloudflare R2 Client
let s3Client: S3Client | null = null;
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCESS_KEY && process.env.CLOUDFLARE_SECRET_KEY) {
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY,
      secretAccessKey: process.env.CLOUDFLARE_SECRET_KEY,
    },
  });
}

// --- Middleware ---
const verifyAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(user.uid).get();
    
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Forbidden: User not found' });
    }

    const role = userDoc.data()?.role;
    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ error: 'Forbidden: Requires admin privileges' });
    }
    
    next();
  } catch (error) {
    console.error('Role verification failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// --- API Routes ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Generate Presigned URL for Cloudflare R2 Upload
app.get("/api/get-upload-url", verifyAuth, verifyAdmin, async (req, res) => {
  if (!s3Client) {
    return res.status(500).json({ error: "Cloudflare R2 is not configured on the server." });
  }

  try {
    const { filename, contentType } = req.query;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: "Filename is required" });
    }

    const bucketName = process.env.R2_BUCKET_NAME || "lecture-audio";
    const publicUrlBase = process.env.R2_PUBLIC_URL || "";
    
    const safeFileName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const objectKey = `records/${Date.now()}_${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: (contentType as string) || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    const publicUrl = publicUrlBase.endsWith('/') 
      ? `${publicUrlBase}${objectKey}` 
      : `${publicUrlBase}/${objectKey}`;

    res.json({ uploadUrl, publicUrl, objectKey });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Bundle chat messages
app.post("/api/admin/create-chat-bundle", verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const db = admin.firestore();
    const bundle = db.bundle('chat-bundle');
    const yesterday = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    
    const oldMessagesQuery = db.collection('chat_messages')
                               .where('timestamp', '<=', yesterday)
                               .orderBy('timestamp', 'desc');

    const querySnapshot = await oldMessagesQuery.get();
    
    if (querySnapshot.empty) {
      return res.status(200).json({ message: 'No old messages to bundle' });
    }

    bundle.add('chat-bundle-query', querySnapshot);
    const bundleBuffer = await bundle.build();

    let publicUrl = '';
    
    if (s3Client && process.env.R2_BUCKET_NAME) {
      const objectKey = 'bundles/chat-bundle.bundle';
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: objectKey,
        ContentType: 'application/octet-stream',
        Body: bundleBuffer
      });
      await s3Client.send(command);
      const publicUrlBase = process.env.R2_PUBLIC_URL || "";
      publicUrl = publicUrlBase.endsWith('/') 
        ? `${publicUrlBase}${objectKey}` 
        : `${publicUrlBase}/${objectKey}`;
    } else {
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID + '.appspot.com');
      const bucket = admin.storage().bucket(bucketName);
      const file = bucket.file('bundles/chat-bundle.bundle');
      
      await file.save(bundleBuffer, {
        metadata: {
          contentType: 'application/octet-stream',
          cacheControl: 'public, max-age=3600'
        }
      });
  
      try {
        await file.makePublic();
        publicUrl = file.publicUrl();
      } catch (e) {
        console.warn('Could not make file public (possibly uniform bucket access). Generating signed URL instead.', e);
        const urls = await file.getSignedUrl({
          action: 'read',
          expires: '01-01-2099'
        });
        publicUrl = urls[0];
      }
    }

    await db.collection('chat_settings').doc('config').set({
      latestBundleUrl: publicUrl,
      bundleCreatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.status(200).json({ message: 'Bundle created successfully', url: publicUrl });
  } catch (err) {
    console.error('Bundle error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Send FCM Notification
app.post("/api/notify", verifyAuth, verifyAdmin, async (req, res) => {
  if (!admin.apps.length) {
    return res.status(500).json({ error: "Firebase Admin is not configured." });
  }

  try {
    const { title, body, topic = "all" } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ error: "Title and body are required." });
    }

    const message = {
      notification: {
        title,
        body,
      },
      topic: topic,
    };

    const response = await admin.messaging().send(message);
    res.json({ success: true, messageId: response });
  } catch (error) {
    console.error("Error sending FCM notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// Student Login
app.post("/api/login", async (req, res) => {
  if (!admin.apps.length) {
    return res.status(500).json({ error: "Firebase Admin is not configured." });
  }

  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    console.log(`Login attempt for email: ${email}`);

    const db = admin.firestore();
    const studentDoc = await db.collection('students').doc(email.toLowerCase()).get();

    if (!studentDoc.exists) {
      console.log(`Student document not found for email: ${email}`);
      return res.status(401).json({ error: "الباسورد أو الإيميل خطأ" });
    }

    const studentData = studentDoc.data();

    if (!studentData?.isActive) {
      console.log(`Student account is disabled for email: ${email}`);
      return res.status(403).json({ error: "تم تعطيل حسابك" });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    let isMatch = hashedPassword === studentData?.password;
    
    if (!isMatch) {
      try {
        isMatch = await bcrypt.compare(password, studentData?.password || '');
      } catch (e) {
      }
    }

    if (!isMatch && password === studentData?.password) {
      isMatch = true;
    }
    
    if (!isMatch) {
      return res.status(401).json({ error: "الباسورد أو الإيميل خطأ" });
    }

    const customToken = await admin.auth().createCustomToken(email.toLowerCase(), {
      email: email.toLowerCase()
    });
    
    res.json({ token: customToken });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Create Student
app.post("/api/admin/students", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { name, email, password, examCode } = req.body;
    if (!name || !email || !password || !examCode) return res.status(400).json({ error: "All fields are required." });

    const db = admin.firestore();
    const emailLower = email.toLowerCase();
    const studentRef = db.collection('students').doc(emailLower);
    const studentDoc = await studentRef.get();

    if (studentDoc.exists) return res.status(400).json({ error: "Student already exists." });

    const hashedPassword = await bcrypt.hash(password, 10);

    await studentRef.set({
      name,
      email: emailLower,
      password: hashedPassword,
      examCode,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Get Students
app.get("/api/admin/students", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const db = admin.firestore();
    const snapshot = await db.collection('students').get();
    
    const students = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        email: data.email,
        examCode: data.examCode,
        isActive: data.isActive,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
      };
    });

    res.json({ students });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Toggle Student Status
app.patch("/api/admin/students/:email/toggle", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { email } = req.params;
    const { isActive } = req.body;
    const db = admin.firestore();
    await db.collection('students').doc(email).update({ isActive });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Delete Student
app.delete("/api/admin/students/:email", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { email } = req.params;
    const db = admin.firestore();
    await db.collection('students').doc(email).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Delete All Students
app.delete("/api/admin/students", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const db = admin.firestore();
    const snapshot = await db.collection('students').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => { batch.delete(doc.ref); });
    await batch.commit();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Edit Student
app.put("/api/admin/students/:email", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { email } = req.params;
    const { newEmail, name, password, examCode } = req.body;
    const db = admin.firestore();
    const oldEmailLower = email.toLowerCase();
    const newEmailLower = newEmail ? newEmail.toLowerCase() : oldEmailLower;

    const studentRef = db.collection('students').doc(oldEmailLower);
    const studentDoc = await studentRef.get();

    if (!studentDoc.exists) return res.status(404).json({ error: "Student not found" });

    const updateData: any = {
      name: name || studentDoc.data()?.name,
      examCode: examCode || studentDoc.data()?.examCode,
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    if (newEmailLower !== oldEmailLower) {
      const newStudentDoc = await db.collection('students').doc(newEmailLower).get();
      if (newStudentDoc.exists) return res.status(400).json({ error: "New email already exists" });
      
      updateData.email = newEmailLower;
      updateData.isActive = studentDoc.data()?.isActive;
      updateData.createdAt = studentDoc.data()?.createdAt;

      await db.collection('students').doc(newEmailLower).set(updateData);
      await studentRef.delete();
    } else {
      await studentRef.update(updateData);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Create Announcement
app.post("/api/admin/announcements", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { content, type, imageUrl, videoUrl, embeddedLectures, createdBy, authorName } = req.body;
    const db = admin.firestore();
    await db.collection('announcements').add({
      content: content || '',
      type: type || 'text',
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      embeddedLectures: embeddedLectures || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: createdBy || null,
      authorName: authorName || null
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Delete Announcement
app.delete("/api/admin/announcements/:id", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { id } = req.params;
    const db = admin.firestore();
    await db.collection('announcements').doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin Delete Record
app.delete("/api/admin/records/:id", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { id } = req.params;
    const db = admin.firestore();
    await db.collection('records').doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Check Whitelist
app.post("/api/check-whitelist", async (req, res) => {
  if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin is not configured." });

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const db = admin.firestore();
    const emailLower = email.toLowerCase();
    
    const adminDoc = await db.collection('allowed_admins').doc(emailLower).get();
    if (adminDoc.exists) {
      const adminData = adminDoc.data();
      return res.json({ 
        exists: true, 
        data: { name: adminData?.role === 'moderator' ? 'Moderator' : 'Admin', email: emailLower, isActive: true, role: adminData?.role || 'admin' } 
      });
    }

    const usersSnapshot = await db.collection('users').where('email', '==', emailLower).get();
    if (!usersSnapshot.empty) {
      const userData = usersSnapshot.docs[0].data();
      if (userData.role === 'admin' || userData.role === 'moderator') {
        return res.json({ 
          exists: true, 
          data: { name: userData.name, email: emailLower, isActive: true, role: userData.role } 
        });
      }
    }

    const studentDoc = await db.collection('students').doc(emailLower).get();
    if (!studentDoc.exists) return res.json({ exists: false });

    const studentData = studentDoc.data();
    const safeData = {
      name: studentData?.name,
      email: studentData?.email,
      examCode: studentData?.examCode,
      isActive: studentData?.isActive,
      createdAt: studentData?.createdAt?.toMillis ? studentData.createdAt.toMillis() : Date.now()
    };
    res.json({ exists: true, data: safeData });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Streak System Backend ---

const getBaghdadDate = (date = new Date()) => {
  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Baghdad"
  }); // returns "YYYY-MM-DD"
};

const getEffectiveDateString = (gracePeriodHours: number = 2) => {
  const now = new Date();
  
  // Get current hour in Baghdad (0-23)
  const timeStr = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Baghdad", hourCycle: "h23", hour: "2-digit" });
  const hour = parseInt(timeStr.split(":")[0], 10);
  
  if (hour >= 0 && hour < gracePeriodHours) {
    now.setDate(now.getDate() - 1);
  }
  
  return getBaghdadDate(now);
};

const calcDaysDifference = (parsedDate1Str: string, parsedDate2Str: string) => {
  const d1 = new Date(`${parsedDate1Str}T12:00:00Z`);
  const d2 = new Date(`${parsedDate2Str}T12:00:00Z`);
  const diff = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diff / (1000 * 60 * 60 * 24));
};

app.post("/api/record-activity", verifyAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const db = admin.firestore();
    const userRef = db.collection('users').doc(user.uid);
    
    const txResult = await db.runTransaction(async (t) => {
      const appSettingsDoc = await t.get(db.collection('app_settings').doc('streak'));
      const gracePeriodHours = appSettingsDoc.exists ? (appSettingsDoc.data()?.gracePeriodHours ?? 2) : 2;
      const globalFreeze = appSettingsDoc.exists ? (appSettingsDoc.data()?.globalFreezeActive ?? false) : false;
      const globalFreezeDate = appSettingsDoc.exists ? appSettingsDoc.data()?.globalFreezeDate : null;
      
      const effectiveDate = getEffectiveDateString(gracePeriodHours);
      const historyId = `${user.uid}_${effectiveDate}`;
      const historyRef = db.collection('streak_history').doc(historyId);
      
      const userDoc = await t.get(userRef);
      const historyDoc = await t.get(historyRef);
      
      if (!userDoc.exists) {
        throw new Error("User not found");
      }
      
      if (historyDoc.exists) {
        if (historyDoc.data()?.freezeUsed === true) {
           t.update(historyRef, { freezeUsed: false });
        }
        t.update(userRef, { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() });
        return { freezeUsed: false };
      }

      const data = userDoc.data()!;
      let streakCount = data.streakCount || 0;
      let longestStreak = data.longestStreak || 0;
      let freezeTokens = data.freezeTokens ?? 1;
      let hasUsedFreeze = false;
      const lastActiveDate = data.lastActiveDate;
      const initialStreakCount = streakCount;
      const initialFreezeTokens = freezeTokens;
      let method = 'normal';
      let missedDaysForLog = 0;
      
      let processedLastDate = lastActiveDate;
      if (processedLastDate && processedLastDate.includes("T")) {
        processedLastDate = processedLastDate.split("T")[0];
      }

      if (globalFreeze && globalFreezeDate && processedLastDate) {
         // Treat frozen date as if student was active
         // Don't penalize for missing that day if the gap spans across the globalFreezeDate
         // Just a simple safety mechanism, if processedLastDate is before globalFreezeDate
         // and effective date is after or equal, we fast forward processedLastDate
         if (processedLastDate < globalFreezeDate && effectiveDate >= globalFreezeDate) {
             processedLastDate = globalFreezeDate;
             method = 'global_freeze';
         }
      }

      if (!processedLastDate) {
        streakCount = 1;
      } else {
        const daysDiff = calcDaysDifference(effectiveDate, processedLastDate);
        
        if (daysDiff === 1) {
          streakCount += 1;
        } else if (daysDiff > 1) {
          const missedDays = daysDiff - 1;
          missedDaysForLog = missedDays;
          
          if (freezeTokens >= missedDays) {
            freezeTokens -= missedDays;
            streakCount += 1;
            hasUsedFreeze = true;
            if (method !== 'global_freeze') method = 'freeze_token';
            
            let d = new Date(`${processedLastDate}T12:00:00Z`);
            for (let i = 0; i < missedDays; i++) {
              d.setDate(d.getDate() + 1);
              const gapDateStr = getBaghdadDate(d);
              
              const gapHistoryRef = db.collection('streak_history').doc(`${user.uid}_${gapDateStr}`);
              t.set(gapHistoryRef, {
                userId: user.uid,
                date: gapDateStr,
                wasActive: true,
                freezeUsed: true,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          } else {
            if (!data.hasPendingStreakReset) {
              const pendingDocRef = db.collection('pending_streak_resets').doc(user.uid);
              t.set(pendingDocRef, {
                 userId: user.uid,
                 email: user.email || '',
                 name: data.name || '',
                 missedDays: missedDays,
                 streakAtRisk: streakCount,
                 dateRecorded: effectiveDate,
                 createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
            streakCount += 1;
            method = 'pending_loss';
          }
        }
      }
      
      longestStreak = Math.max(longestStreak, streakCount);
      
      const updateData: any = {
        streakCount,
        longestStreak,
        freezeTokens,
        lastActiveDate: effectiveDate,
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (method === 'pending_loss' && !data.hasPendingStreakReset) {
         updateData.hasPendingStreakReset = true;
      }
      
      t.update(userRef, updateData);
      
      t.set(historyRef, {
        userId: user.uid,
        date: effectiveDate,
        wasActive: true,
        freezeUsed: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const streakLogRef = db.collection('streakLog').doc(user.uid).collection('days').doc(effectiveDate);
      t.set(streakLogRef, {
        date: effectiveDate,
        recordedAt: admin.firestore.FieldValue.serverTimestamp(),
        streakBefore: initialStreakCount,
        streakAfter: streakCount,
        method: method,
        tokensBefore: initialFreezeTokens,
        tokensAfter: freezeTokens,
        missedDays: missedDaysForLog,
        gracePeriodApplied: getBaghdadDate() !== effectiveDate
      }, { merge: true });
      
      return { freezeUsed: hasUsedFreeze };
    });
    
    const updatedUser = await userRef.get();
    res.json({ 
      success: true, 
      streakCount: updatedUser.data()?.streakCount, 
      freezeUsed: txResult?.freezeUsed || false
    });
  } catch (error) {
    console.error("Error recording activity:", error);
    res.status(500).json({ error: "Failed to record activity" });
  }
});

app.get("/api/streak-history/:uid", verifyAuth, async (req, res) => {
  try {
    const authUser = (req as any).user;
    const targetUid = req.params.uid;
    const db = admin.firestore();
    
    if (authUser.uid !== targetUid) {
       const userDoc = await db.collection('users').doc(authUser.uid).get();
       const role = userDoc.data()?.role;
       if (role !== 'admin' && role !== 'moderator') {
          return res.status(403).json({ error: 'Forbidden' });
       }
    }

    const snapshot = await db.collection('streak_history')
      .where('userId', '==', targetUid)
      .get();
      
    const history = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp?.toDate() ? data.timestamp.toDate().toISOString() : new Date().toISOString()
      };
    });
    
    res.json({ history });
  } catch (error) {
    console.error("Error fetching streak history:", error);
    res.status(500).json({ error: "Failed to fetch streak history" });
  }
});

app.post("/api/admin/time-freeze", verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const db = admin.firestore();
    const appSettingsDoc = await db.collection('app_settings').doc('streak').get();
    const gracePeriodHours = appSettingsDoc.exists ? (appSettingsDoc.data()?.gracePeriodHours ?? 2) : 2;
    const effectiveDate = getEffectiveDateString(gracePeriodHours);
    
    const d = new Date(`${effectiveDate}T12:00:00Z`);
    d.setDate(d.getDate() - 1);
    const yesterdayStr = getBaghdadDate(d);

    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    const batches = [];
    let currentBatch = db.batch();
    let countInBatch = 0;
    let totalUpdated = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.streakCount > 0) {
        let processedLastDate = data.lastActiveDate;
        if (processedLastDate && typeof processedLastDate === 'string' && processedLastDate.includes("T")) {
          processedLastDate = processedLastDate.split("T")[0];
        }
        
        if (!processedLastDate || processedLastDate < yesterdayStr) {
          currentBatch.update(doc.ref, { lastActiveDate: yesterdayStr });
          countInBatch++;
          totalUpdated++;
          
          if (countInBatch >= 400) {
            batches.push(currentBatch.commit());
            currentBatch = db.batch();
            countInBatch = 0;
          }
        }
      }
    });
    
    if (countInBatch > 0) {
      batches.push(currentBatch.commit());
    }
    
    await Promise.all(batches);
    
    res.json({ success: true, count: totalUpdated });
  } catch (e) {
    console.error("Error freezing time", e);
    res.status(500).json({ error: "Error freezing time" });
  }
});

app.post("/api/admin/grant-freeze-global", verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const db = admin.firestore();
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    const batches = [];
    let currentBatch = db.batch();
    let count = 0;
    let countInBatch = 0;
    
    snapshot.forEach(doc => {
      currentBatch.update(doc.ref, { freezeTokens: 3 });
      count++;
      countInBatch++;
      
      if (countInBatch >= 400) {
        batches.push(currentBatch.commit());
        currentBatch = db.batch();
        countInBatch = 0;
      }
    });
    
    if (countInBatch > 0) {
      batches.push(currentBatch.commit());
    }
    
    await Promise.all(batches);
    
    res.json({ success: true, count });
  } catch (e) {
    console.error("Error granting global freeze tokens", e);
    res.status(500).json({ error: "Error granting global freeze tokens" });
  }
});

app.post("/api/admin/grant-freeze", verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { userUid, amount } = req.body;
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userUid);
    
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      if (!doc.exists) throw new Error("Not found");
      const currentTokens = doc.data()?.freezeTokens ?? 1;
      const newTokens = Math.min(currentTokens + amount, 3);
      t.update(userRef, { freezeTokens: newTokens });
    });
    res.json({ success: true });
  } catch (e) {
    console.error("Error recovering streak", e);
    res.status(500).json({ error: "Error recovering streak" });
  }
});

app.post("/api/admin/streak-recovery", verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { userUid, studentEmail, newStreak, reason } = req.body;
    const db = admin.firestore();
    const adminUser = (req as any).user;
    const userRef = db.collection('users').doc(userUid);
    
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      if (!doc.exists) throw new Error("Not found");
      const oldStreak = doc.data()?.streakCount || 0;
      
      t.update(userRef, {
        streakCount: newStreak,
        longestStreak: Math.max(doc.data()?.longestStreak || 0, newStreak)
      });
      
      const recoveryRef = db.collection('streak_recoveries').doc();
      t.set(recoveryRef, {
        studentEmail,
        userId: userUid,
        oldStreak,
        newStreak,
        reason,
        recoveredBy: adminUser.email,
        recoveredAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Error recovering streak" });
  }
});

app.post("/api/admin/resolve-pending-streak", verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const { userUid, action } = req.body;
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userUid);
    const pendingRef = db.collection('pending_streak_resets').doc(userUid);

    await db.runTransaction(async (t) => {
      const pendingDoc = await t.get(pendingRef);
      if (!pendingDoc.exists) throw new Error("Pending streak reset not found");

      if (action === 'reset') {
        t.update(userRef, {
          streakCount: 1,
          hasPendingStreakReset: admin.firestore.FieldValue.delete()
        });
      } else if (action === 'forgive') {
        t.update(userRef, {
          hasPendingStreakReset: admin.firestore.FieldValue.delete()
        });
      } else {
        throw new Error("Invalid action");
      }

      t.delete(pendingRef);
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error resolving pending streak", error);
    res.status(500).json({ error: error.message || "Error resolving pending streak" });
  }
});

app.post("/api/cron/streak-warnings", async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(403).send("Forbidden");
  }
  
  try {
    const db = admin.firestore();
    const effectiveDate = getEffectiveDateString();
    
    const usersSnap = await db.collection('users').where('fcmToken', '!=', null).get();
    
    const tokens: string[] = [];
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.lastActiveDate !== effectiveDate && data.fcmToken) {
        tokens.push(data.fcmToken);
      }
    });
    
    if (tokens.length > 0) {
      const message = {
        notification: {
          title: "لا تنسَ نشاطك اليومي 🔥",
          body: "ستريكك في خطر! افتح التطبيق الآن لتحافظ عليه.",
        },
        tokens: tokens,
      };
      await admin.messaging().sendEachForMulticast(message);
    }
    
    res.json({ success: true, notifiedCount: tokens.length });
  } catch (e) {
    console.error("Cron streak warnings error", e);
    res.status(500).json({ error: "Error sending warnings" });
  }
});

export default app;
