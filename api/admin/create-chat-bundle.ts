import { Request, Response } from 'express';
import admin from 'firebase-admin';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Verify Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // In local dev, admin might be initialized by server.ts, but in Vercel function need to ensure it
    if (!admin.apps.length) {
       admin.initializeApp({
         credential: admin.credential.cert({
           projectId: process.env.FIREBASE_PROJECT_ID,
           clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
           privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
         }),
         storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID + '.appspot.com')
       });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // 2. Verify Admin Role
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const role = userDoc.data()?.role;
    if (role !== 'admin' && role !== 'moderator') {
      return res.status(403).json({ error: 'Forbidden: Requires admin privileges' });
    }

    // 3. Create Firestore Bundle for messages older than 24 hours
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

    // 4. Save Bundle to Firebase Storage
    // Use default bucket or env bucket
    const bucket = admin.storage().bucket();
    const file = bucket.file('bundles/chat-bundle.bundle');
    
    await file.save(bundleBuffer, {
      metadata: {
        contentType: 'application/octet-stream',
        cacheControl: 'public, max-age=3600'
      }
    });

    // Make public so frontend can fetch it simply or use signed URL
    await file.makePublic();
    const publicUrl = file.publicUrl();

    await db.collection('chat_settings').doc('config').set({
      latestBundleUrl: publicUrl,
      bundleCreatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.status(200).json({ message: 'Bundle created successfully', url: publicUrl });
  } catch (error) {
    console.error('Failed to create chat bundle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
