import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import admin from "firebase-admin";

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Verify Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Verify Admin/Moderator Role
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'Forbidden: User not found' });
    }

    const role = userDoc.data()?.role;
    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ error: 'Forbidden: Requires admin privileges' });
    }
  } catch (error) {
    console.error('Role verification failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  const { filename, contentType } = req.query;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: "Filename is required" });
  }

  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_ACCESS_KEY || !process.env.CLOUDFLARE_SECRET_KEY) {
    return res.status(500).json({ error: "Cloudflare R2 credentials are not configured on the server." });
  }

  try {
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY,
        secretAccessKey: process.env.CLOUDFLARE_SECRET_KEY,
      },
    });

    const bucketName = process.env.R2_BUCKET_NAME || "lecture-audio";
    const publicUrlBase = process.env.R2_PUBLIC_URL || "";
    
    const safeFileName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const objectKey = `records/${Date.now()}_${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: (contentType) || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    const publicUrl = publicUrlBase.endsWith('/') 
      ? `${publicUrlBase}${objectKey}` 
      : `${publicUrlBase}/${objectKey}`;

    return res.status(200).json({ uploadUrl, publicUrl, objectKey });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return res.status(500).json({ error: "Failed to generate upload URL" });
  }
}
