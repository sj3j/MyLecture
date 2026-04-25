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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
