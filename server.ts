import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import admin from "firebase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";

dotenv.config();

// Initialize Firebase Admin for FCM
if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log("Firebase Admin initialized for Push Notifications.");
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

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // --- Telegram Bot Setup ---
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    const bot = new Telegraf(botToken);
    
    // Basic handler for all text messages
    bot.on("text", (ctx) => {
      console.log(`Received message from ${ctx.from.username || ctx.from.id}: ${ctx.message.text}`);
      ctx.reply(`I received your message: "${ctx.message.text}"`);
    });

    // Launch the bot
    bot.launch({ dropPendingUpdates: true }).then(() => {
      console.log("Telegram bot successfully launched!");
    }).catch((err: any) => {
      if (err?.response?.error_code === 409) {
        console.warn("Telegram bot 409 Conflict: Another instance is polling. This is normal during hot-reloads.");
      } else {
        console.error("Failed to launch Telegram bot:", err);
      }
    });

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.warn("TELEGRAM_BOT_TOKEN is not set. Telegram bot will not be started.");
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
      
      // Sanitize filename and add timestamp to prevent overwrites
      const safeFileName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const objectKey = `records/${Date.now()}_${safeFileName}`;

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: (contentType as string) || "application/octet-stream",
      });

      // URL expires in 1 hour
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      
      // Format public URL
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
        // Upload to R2
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
        // Fallback to Firebase Storage
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

      // Save the bundle link to Firestore config
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
          if (isMatch) {
            console.log(`Password matched using bcrypt for email: ${email}`);
          }
        } catch (e) {
          // Ignore bcrypt errors if it's not a valid bcrypt hash
        }
      } else {
        console.log(`Password matched using SHA-256 for email: ${email}`);
      }

      // Fallback for plain text password (just in case)
      if (!isMatch && password === studentData?.password) {
        isMatch = true;
        console.log(`Password matched using plain text for email: ${email}`);
      }
      
      if (!isMatch) {
        console.log(`Password mismatch for email: ${email}`);
        return res.status(401).json({ error: "الباسورد أو الإيميل خطأ" });
      }

      // Create custom token with email claim
      const customToken = await admin.auth().createCustomToken(email.toLowerCase(), {
        email: email.toLowerCase()
      });
      
      console.log(`Custom token generated successfully for email: ${email}`);
      res.json({ token: customToken });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Create Student
  app.post("/api/admin/students", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const { name, email, password, examCode } = req.body;
      
      if (!name || !email || !password || !examCode) {
        return res.status(400).json({ error: "All fields are required." });
      }

      const db = admin.firestore();
      const emailLower = email.toLowerCase();
      
      const studentRef = db.collection('students').doc(emailLower);
      const studentDoc = await studentRef.get();

      if (studentDoc.exists) {
        return res.status(400).json({ error: "Student already exists." });
      }

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
      console.error("Create student error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Get Students
  app.get("/api/admin/students", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

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
      console.error("Get students error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Toggle Student Status
  app.patch("/api/admin/students/:email/toggle", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const { email } = req.params;
      const { isActive } = req.body;
      
      const db = admin.firestore();
      await db.collection('students').doc(email).update({
        isActive
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Toggle student error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Delete Student
  app.delete("/api/admin/students/:email", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const { email } = req.params;
      
      const db = admin.firestore();
      await db.collection('students').doc(email).delete();

      res.json({ success: true });
    } catch (error) {
      console.error("Delete student error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Delete All Students
  app.delete("/api/admin/students", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const db = admin.firestore();
      const snapshot = await db.collection('students').get();
      
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      res.json({ success: true });
    } catch (error) {
      console.error("Delete all students error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Edit Student
  app.put("/api/admin/students/:email", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const { email } = req.params;
      const { newEmail, name, password, examCode } = req.body;
      
      const db = admin.firestore();
      const oldEmailLower = email.toLowerCase();
      const newEmailLower = newEmail ? newEmail.toLowerCase() : oldEmailLower;

      const studentRef = db.collection('students').doc(oldEmailLower);
      const studentDoc = await studentRef.get();

      if (!studentDoc.exists) {
        return res.status(404).json({ error: "Student not found" });
      }

      const updateData: any = {
        name: name || studentDoc.data()?.name,
        examCode: examCode || studentDoc.data()?.examCode,
      };

      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      if (newEmailLower !== oldEmailLower) {
        // Check if new email already exists
        const newStudentDoc = await db.collection('students').doc(newEmailLower).get();
        if (newStudentDoc.exists) {
          return res.status(400).json({ error: "New email already exists" });
        }
        
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
      console.error("Edit student error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Create Announcement
  app.post("/api/admin/announcements", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

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
      console.error("Create announcement error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Delete Announcement
  app.delete("/api/admin/announcements/:id", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const { id } = req.params;
      
      const db = admin.firestore();
      await db.collection('announcements').doc(id).delete();

      res.json({ success: true });
    } catch (error) {
      console.error("Delete announcement error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin Delete Record
  app.delete("/api/admin/records/:id", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const { id } = req.params;
      
      const db = admin.firestore();
      await db.collection('records').doc(id).delete();

      res.json({ success: true });
    } catch (error) {
      console.error("Delete record error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Check Whitelist (used by client to bypass security rules)
  app.post("/api/check-whitelist", async (req, res) => {
    if (!admin.apps.length) {
      return res.status(500).json({ error: "Firebase Admin is not configured." });
    }

    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required." });
      }

      const db = admin.firestore();
      const emailLower = email.toLowerCase();
      
      // Check allowed_admins first
      const adminDoc = await db.collection('allowed_admins').doc(emailLower).get();
      if (adminDoc.exists) {
        const adminData = adminDoc.data();
        return res.json({ 
          exists: true, 
          data: { 
            name: adminData?.role === 'moderator' ? 'Moderator' : 'Admin', 
            email: emailLower, 
            isActive: true, 
            role: adminData?.role || 'admin' 
          } 
        });
      }

      // Check users collection for existing admin/moderator role
      const usersSnapshot = await db.collection('users').where('email', '==', emailLower).get();
      if (!usersSnapshot.empty) {
        const userData = usersSnapshot.docs[0].data();
        if (userData.role === 'admin' || userData.role === 'moderator') {
          return res.json({ 
            exists: true, 
            data: { 
              name: userData.name, 
              email: emailLower, 
              isActive: true, 
              role: userData.role 
            } 
          });
        }
      }

      // Check students collection
      const studentDoc = await db.collection('students').doc(emailLower).get();

      if (!studentDoc.exists) {
        return res.json({ exists: false });
      }

      const studentData = studentDoc.data();
      
      // We don't send the password back to the client
      const safeData = {
        name: studentData?.name,
        email: studentData?.email,
        examCode: studentData?.examCode,
        isActive: studentData?.isActive,
        createdAt: studentData?.createdAt?.toMillis ? studentData.createdAt.toMillis() : Date.now()
      };

      res.json({ exists: true, data: safeData });
    } catch (error) {
      console.error("Check whitelist error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- Streak System Backend ---
  
  const getIraqDateAndHour = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baghdad",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", hourCycle: "h23"
    }).formatToParts(now);

    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    
    return { year, month, day, hour };
  };

  const getEffectiveDateString = (gracePeriodHours: number = 2, offsetDays: number = 0) => {
    const { year, month, day, hour } = getIraqDateAndHour();
    // GRACE PERIOD: 00:00 to <gracePeriodHours>:59AM will be counted as previous day
    // We get the actual date
    let effectiveDate = new Date(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T12:00:00Z`);
    
    if (hour >= 0 && hour < gracePeriodHours) {
      effectiveDate.setDate(effectiveDate.getDate() - 1);
    }

    if (offsetDays) {
      effectiveDate.setDate(effectiveDate.getDate() + offsetDays);
    }
    
    const ey = effectiveDate.getUTCFullYear();
    const em = effectiveDate.getUTCMonth() + 1;
    const ed = effectiveDate.getUTCDate();
    
    return `${ey}-${em.toString().padStart(2, '0')}-${ed.toString().padStart(2, '0')}`;
  };

  const calcDaysDifference = (date1Str: string, date2Str: string) => {
    const d1 = new Date(`${date1Str}T12:00:00Z`);
    const d2 = new Date(`${date2Str}T12:00:00Z`);
    const diff = Math.abs(d1.getTime() - d2.getTime());
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  app.post("/api/record-activity", verifyAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const db = admin.firestore();
      const userRef = db.collection('users').doc(user.uid);
      
      await db.runTransaction(async (t) => {
        const appSettingsDoc = await t.get(db.collection('app_settings').doc('streak'));
        const gracePeriodHours = appSettingsDoc.exists ? (appSettingsDoc.data()?.gracePeriodHours ?? 2) : 2;
        const simulatedDaysOffset = appSettingsDoc.exists ? (appSettingsDoc.data()?.simulatedDaysOffset ?? 0) : 0;
        
        const effectiveDate = getEffectiveDateString(gracePeriodHours, simulatedDaysOffset);
        const historyId = `${user.uid}_${effectiveDate}`;
        const historyRef = db.collection('streak_history').doc(historyId);
        
        const userDoc = await t.get(userRef);
        const historyDoc = await t.get(historyRef);
        
        if (!userDoc.exists) {
          throw new Error("User not found");
        }
        
        // If already recorded today, just update lastActiveAt
        if (historyDoc.exists) {
          t.update(userRef, { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() });
          return;
        }

        const data = userDoc.data()!;
        let streakCount = data.streakCount || 0;
        let longestStreak = data.longestStreak || 0;
        let freezeTokens = data.freezeTokens ?? 1; // Default 1
        const lastActiveDate = data.lastActiveDate; // format 'YYYY-MM-DD'
        let usedFreeze = false;
        
        let processedLastDate = lastActiveDate;
        if (processedLastDate && processedLastDate.includes("T")) {
          processedLastDate = processedLastDate.split("T")[0];
        }

        if (!processedLastDate) {
          streakCount = 1;
        } else {
          const daysDiff = calcDaysDifference(effectiveDate, processedLastDate);
          
          if (daysDiff === 1) {
            streakCount += 1;
          } else if (daysDiff > 1) {
            // Gap found! Let's check freeze tokens.
            // We need to use exactly arrays of missing gap days but for simplicity, 
            // if we missed precisely 1 day and have a freeze token we can spend it.
            // If we missed >1 day, or have no tokens, streak is broken.
            // The prompt says: "If a student misses a day AND has freeze tokens > 0: Automatically use 1 freeze token... Streak is NOT reset"
            
            // To be robust: the freeze only covers ONE missed day. If they missed 2 days, they would need 2 freeze tokens? The prompt says "misses a day ... use 1 freeze token".
            // Let's implement: they missed N days. We need N freeze tokens to cover it.
            const missedDays = daysDiff - 1;
            
            if (freezeTokens >= missedDays) {
              freezeTokens -= missedDays;
              streakCount += 1; // It continues from before + effectively covers gap
              usedFreeze = true;
              
              // We could log missed days as freeze used, but we skip for brevity
            } else {
              streakCount = 1; // Streak broken
            }
          }
        }
        
        longestStreak = Math.max(longestStreak, streakCount);
        
        t.update(userRef, {
          streakCount,
          longestStreak,
          freezeTokens,
          lastActiveDate: effectiveDate,
          lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        t.set(historyRef, {
          userId: user.uid,
          date: effectiveDate,
          wasActive: true,
          freezeUsed: usedFreeze,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      const updatedUser = await userRef.get();
      res.json({ success: true, streakCount: updatedUser.data()?.streakCount, freezeUsed: updatedUser.data()?.freezeTokens < (updatedUser.data()?.freezeTokens ?? 1) });
    } catch (error) {
      console.error("Error recording activity:", error);
      res.status(500).json({ error: "Failed to record activity" });
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
      res.status(500).json({ error: "Error granting freeze token" });
    }
  });

  app.get("/api/streak-history/:uid", verifyAuth, async (req, res) => {
    try {
      const callerUid = (req as any).user.uid;
      const targetUid = req.params.uid;
      
      const db = admin.firestore();
      
      let isAdmin = false;
      if (callerUid !== targetUid) {
        const userDoc = await db.collection('users').doc(callerUid).get();
        if (userDoc.exists && ['admin', 'moderator', 'master_admin'].includes(userDoc.data()?.role)) {
          isAdmin = true;
        } else {
          const allowedAdminDoc = await db.collection('allowed_admins').doc(callerUid).get();
          if (allowedAdminDoc.exists && ['admin', 'moderator'].includes(allowedAdminDoc.data()?.role)) {
            isAdmin = true;
          }
        }
        
        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden: Only admins can view other users history' });
        }
      }
      
      const snap = await db.collection('streak_history').where('userId', '==', targetUid).get();
      const history = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          date: data.date,
          wasActive: data.wasActive,
          freezeUsed: data.freezeUsed,
          timestamp: data.timestamp?.toMillis?.() || Date.now(),
          userId: data.userId
        };
      });
      
      res.json({ history });
    } catch (error) {
      console.error("Fetch streak history failed:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/broadcast-notification", verifyAuth, verifyAdmin, async (req, res) => {
    try {
      const { title, body } = req.body;
      if (!title || !body) return res.status(400).json({ error: "Missing title or body" });
      
      const db = admin.firestore();
      
      // We will create a document in 'systemNotifications' for each student/user
      const usersSnap = await db.collection('users').get();
      const batch = db.batch();
      let count = 0;
      
      usersSnap.forEach(doc => {
        // limit batch size, ideally max is 500, we'll just write sequentially if > 400
        const notifRef = db.collection('systemNotifications').doc();
        batch.set(notifRef, {
          userId: doc.id,
          title,
          body,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;
      });
      // A batch can max out at 500. This is a simplified approach, if > 400, commit and re-init might be needed. 
      // Assuming users < 400 for now. Better yet, we can do manual looping to be safe:
      
      // Let's use Promises to bypass 500 limit for robust behavior
      const promises: Promise<any>[] = [];
      usersSnap.forEach(doc => {
        promises.push(db.collection('systemNotifications').add({
          userId: doc.id,
          title,
          body,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
      });
      await Promise.all(promises);

      // Also send FCM broadcast if possible
      const tokens: string[] = [];
      usersSnap.forEach(doc => {
        const token = doc.data()?.fcmToken;
        if (token) tokens.push(token);
      });
      
      if (tokens.length > 0) {
        // Split tokens into chunks of 500 (FCM limit)
        for (let i = 0; i < tokens.length; i += 500) {
          const chunk = tokens.slice(i, i + 500);
          await admin.messaging().sendEachForMulticast({
            notification: { title, body },
            tokens: chunk
          }).catch(console.error);
        }
      }
      
      res.json({ success: true, count: usersSnap.size });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Broadcast failed" });
    }
  });

  app.post("/api/admin/simulate-streak-day", verifyAuth, verifyAdmin, async (req, res) => {
    try {
      const { offsetDays } = req.body;
      const db = admin.firestore();
      await db.collection('app_settings').doc('streak').set({
        simulatedDaysOffset: offsetDays
      }, { merge: true });
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to simulate logic" });
    }
  });

  app.get("/api/admin/simulate-streak-day", verifyAuth, verifyAdmin, async (req, res) => {
    try {
      const db = admin.firestore();
      const doc = await db.collection('app_settings').doc('streak').get();
      res.json({ simulatedDaysOffset: doc.data()?.simulatedDaysOffset ?? 0 });
    } catch (e) {
      res.status(500).json({ error: "Failed" });
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
        
        // Populate streak history for the calendar
        const daysToPopulate = Math.min(newStreak, 400); // 500 writes limit per transaction
        const today = new Date();
        for (let i = 0; i < daysToPopulate; i++) {
          const pastDate = new Date(today);
          pastDate.setDate(today.getDate() - i);
          const dateStr = pastDate.toISOString().split('T')[0];
          
          const historyRef = db.collection('streak_history').doc(`${userUid}_${dateStr}`);
          t.set(historyRef, {
            userId: userUid,
            date: dateStr,
            wasActive: true,
            freezeUsed: false,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      });
      
      try {
        const updatedUser = await userRef.get();
        const fcmToken = updatedUser.data()?.fcmToken;
        if (fcmToken) {
          const message = {
            notification: {
              title: "🔥 تم استرجاع الستريك!",
              body: "قام الإداري باسترجاع الستريك الخاص بك بنجاح. استمر في التألق!"
            },
            data: {
              type: "streak_recovery"
            },
            token: fcmToken
          };
          await admin.messaging().send(message);
        }
      } catch (notifyErr) {
        console.error("Failed to send streak recovery notification", notifyErr);
      }

      res.json({ success: true });
    } catch (e) {
      console.error("Streak recovery error:", e);
      res.status(500).json({ error: "Error recovering streak" });
    }
  });

  app.post("/api/cron/streak-warnings", async (req, res) => {
    // Requires some secret header to prevent abuse in production
    if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
      return res.status(403).send("Forbidden");
    }
    
    // In Egypt 10 PM. Find users whose lastActiveDate is NOT today's effectiveDate
    // and send them an FCM notification. Because querying exactly this might be tricky, we can fetch users and filter.
    try {
      const db = admin.firestore();
      
      const appSettingsDoc = await db.collection('app_settings').doc('streak').get();
      const simulatedDaysOffset = appSettingsDoc.exists ? (appSettingsDoc.data()?.simulatedDaysOffset ?? 0) : 0;
      const effectiveDate = getEffectiveDateString(2, simulatedDaysOffset);
      
      // Just getting all users who have FCM tokens
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

  // API Catch-all
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API route not found: " + req.method + " " + req.url });
  });

  // --- Vite Middleware for Development / Static Serving for Production ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
