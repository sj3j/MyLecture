const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const axios = require('axios');

setGlobalOptions({ region: 'me-west1' });

admin.initializeApp();

const db = admin.firestore();
db.settings({ databaseId: '(default)' });

async function getTokensWithPreferences(preferenceKey) {
  const tokensSnapshot = await db.collection('fcm_tokens').get();
  
  if (tokensSnapshot.empty) {
    return { tokens: [], tokenDocs: [] };
  }

  const userIds = [];
  const tokenMap = new Map();

  tokensSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.token) {
      userIds.push(doc.id);
      tokenMap.set(doc.id, data.token);
    }
  });

  if (userIds.length === 0) {
    return { tokens: [], tokenDocs: [] };
  }

  // Fetch user preferences in chunks of 30
  const tokens = [];
  const tokenDocs = [];
  const fetchedUserIds = new Set();

  for (let i = 0; i < userIds.length; i += 30) {
    const chunk = userIds.slice(i, i + 30);
    const usersSnapshot = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
    
    usersSnapshot.forEach((doc) => {
      fetchedUserIds.add(doc.id);
      const userData = doc.data();
      const prefs = userData.notificationPreferences || {};
      // If preference is not explicitly false, it's true by default
      if (prefs[preferenceKey] !== false) {
        const token = tokenMap.get(doc.id);
        if (token) {
          tokens.push(token);
          tokenDocs.push(doc.id);
        }
      }
    });
  }

  // Also include tokens for users who might not have a user document yet (default to true)
  userIds.forEach(uid => {
    if (!fetchedUserIds.has(uid)) {
      tokens.push(tokenMap.get(uid));
      tokenDocs.push(uid);
    }
  });

  return { tokens, tokenDocs };
}

async function cleanupTokens(response, tokenDocs) {
  if (response.failureCount > 0) {
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const error = resp.error;
        if (
          error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered'
        ) {
          failedTokens.push(tokenDocs[idx]);
        }
      }
    });

    if (failedTokens.length > 0) {
      console.log(`Cleaning up ${failedTokens.length} invalid tokens.`);
      const batch = db.batch();
      failedTokens.forEach((userId) => {
        const ref = db.collection('fcm_tokens').doc(userId);
        batch.delete(ref);
      });
      await batch.commit();
      console.log('Cleanup complete.');
    }
  }
}

exports.sendLectureNotificationV3 = onDocumentCreated({
  document: 'lectures/{lectureId}',
  database: '(default)'
}, async (event) => {
    const snap = event.data;
    if (!snap) return;
    const lectureId = event.params.lectureId;

    const notifLockRef = db.doc(`sentNotifications/${lectureId}_sendLectureNotificationV3`);
    const lockSnap = await notifLockRef.get();
    if (lockSnap.exists) {
      console.log('Already sent, skipping');
      return null;
    }
    await notifLockRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });

    const lectureData = snap.data();
    const lectureTitle = lectureData.title || 'New Lecture';

    console.log('New lecture created:', lectureTitle);

    const { tokens, tokenDocs } = await getTokensWithPreferences('lectures');

    if (tokens.length === 0) {
      console.log('No valid tokens found for lecture notifications.');
      return null;
    }

    const payload = {
      notification: {
        title: 'New Lecture Uploaded!',
        body: lectureTitle,
      },
      data: {
        url: `/?lecture=${lectureId}`,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    console.log(`Sending lecture notifications to ${tokens.length} devices.`);

    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      notification: payload.notification,
      data: payload.data,
      webpush: {
        fcmOptions: {
          link: `/?lecture=${lectureId}`
        }
      }
    });

    console.log('Successfully sent messages:', response.successCount);
    console.log('Failed messages:', response.failureCount);

    await cleanupTokens(response, tokenDocs);

    return null;
  });

exports.sendAnnouncementNotificationV3 = onDocumentCreated({
  document: 'announcements/{announcementId}',
  database: '(default)'
}, async (event) => {
    const snap = event.data;
    if (!snap) return;
    
    const announcementId = event.params.announcementId;
    const notifLockRef = db.doc(`sentNotifications/${announcementId}_sendAnnouncementNotificationV3`);
    const lockSnap = await notifLockRef.get();
    if (lockSnap.exists) {
      console.log('Already sent, skipping');
      return null;
    }
    await notifLockRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });

    const announcementData = snap.data();
    let content = announcementData.text || announcementData.content || 'إعلان جديد';
    // Truncate content for notification body
    if (content.length > 100) {
      content = content.substring(0, 97) + '...';
    }

    console.log('New announcement created:', content);

    const { tokens, tokenDocs } = await getTokensWithPreferences('announcements');

    if (tokens.length === 0) {
      console.log('No valid tokens found for announcement notifications.');
      return null;
    }

    const payload = {
      notification: {
        title: 'إعلان جديد 📢',
        body: content,
      },
      data: {
        url: `/?tab=announcements`,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    console.log(`Sending announcement notifications to ${tokens.length} devices.`);

    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      notification: payload.notification,
      data: payload.data,
      webpush: {
        fcmOptions: {
          link: `/?tab=announcements`
        }
      }
    });

    console.log('Successfully sent messages:', response.successCount);
    console.log('Failed messages:', response.failureCount);

    await cleanupTokens(response, tokenDocs);

    return null;
  });

exports.telegramWebhookV3 = onRequest(async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  const update = req.body;
  
  // Telegram sends channel posts as 'channel_post'
  if (!update || !update.channel_post) {
    return res.status(200).send('Not a channel post');
  }

  const post = update.channel_post;
  
  // Filter by channel ID or username
  if (channelId) {
    const chat = post.chat;
    const isMatch = String(chat.id) === String(channelId) || 
                    (chat.username && chat.username === channelId.replace('@', ''));
    
    if (!isMatch) {
      console.log('Message from unauthorized channel:', chat.id, chat.username);
      return res.status(200).send('Unauthorized channel');
    }
  }

  let announcement = {
    date: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(), // For backward compatibility
    type: 'text',
    text: '',
    content: '', // For backward compatibility
    createdBy: 'telegram_bot',
    authorName: 'Telegram Channel',
  };

  try {
    if (post.text) {
      announcement.type = 'text';
      announcement.text = post.text;
      announcement.content = post.text;
    } else if (post.photo || post.video) {
      const isVideo = !!post.video;
      announcement.type = isVideo ? 'video' : 'image';
      announcement.text = post.caption || '';
      announcement.content = post.caption || '';
      
      const fileId = isVideo ? post.video.file_id : post.photo[post.photo.length - 1].file_id;
      
      const fileResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
      const filePath = fileResponse.data.result.file_path;
      const telegramFileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      
      // CRITICAL SECURITY FIX: Never expose the bot token to the frontend.
      // Download the file and upload it to Firebase Storage.
      const fileData = await axios.get(telegramFileUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(fileData.data, 'binary');
      
      const bucket = admin.storage().bucket();
      const fileName = `announcements/${Date.now()}_${filePath.split('/').pop()}`;
      const file = bucket.file(fileName);
      
      await file.save(buffer, {
        metadata: { contentType: fileData.headers['content-type'] }
      });
      
      // Construct public URL
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
      
      if (isVideo) {
        announcement.videoUrl = publicUrl;
      } else {
        announcement.imageUrl = publicUrl;
      }
    } else {
      return res.status(200).send('Unsupported message type');
    }

    await db.collection('announcements').add(announcement);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing Telegram update:', error.response?.data || error.message);
    return res.status(200).send('Error but acknowledged'); // Acknowledge to Telegram to stop retries
  }
});

exports.sendHomeworkNotificationV3 = onDocumentCreated({
  document: 'homeworks/{homeworkId}',
  database: '(default)'
}, async (event) => {
    const snap = event.data;
    if (!snap) return;

    const homeworkId = event.params.homeworkId;
    const notifLockRef = db.doc(`sentNotifications/${homeworkId}_sendHomeworkNotificationV3`);
    const lockSnap = await notifLockRef.get();
    if (lockSnap.exists) {
      console.log('Already sent, skipping');
      return null;
    }
    await notifLockRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });

    const homeworkData = snap.data();
    
    // Translate subject to Arabic
    const subjectMap = {
      'pharmacology': 'فارما',
      'pharmacognosy': 'عقاقير',
      'organic_chemistry': 'عضوية',
      'biochemistry': 'بايو',
      'cosmetics': 'تكنو'
    };
    const subject = subjectMap[homeworkData.subject] || homeworkData.subject || 'مادة غير معروفة';
    const type = homeworkData.type === 'theoretical' ? 'نظري' : 'عملي';
    
    // Extract lecture numbers
    const lectureNumbers = homeworkData.lectures
      .map(l => l.label)
      .join(', ');

    const title = '📚 واجب جديد!';
    const body = `${subject} - ${type} | ${lectureNumbers}`;

    console.log('New homework created:', body);

    // Assuming we want to send to everyone who wants announcements for now
    // Or we could add a specific 'homework' preference later
    const { tokens, tokenDocs } = await getTokensWithPreferences('announcements');

    if (tokens.length === 0) {
      console.log('No valid tokens found for homework notifications.');
      return null;
    }

    const payload = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        url: `/?tab=weekly`,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    console.log(`Sending homework notifications to ${tokens.length} devices.`);

    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      notification: payload.notification,
      data: payload.data,
      webpush: {
        fcmOptions: {
          link: `/?tab=weekly`
        }
      }
    });

    console.log('Successfully sent messages:', response.successCount);
    console.log('Failed messages:', response.failureCount);

    await cleanupTokens(response, tokenDocs);

    return null;
  });

exports.sendSystemNotificationV3 = onDocumentCreated({
  document: 'systemNotifications/{notificationId}',
  database: '(default)'
}, async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notificationId = event.params.notificationId;
    const notifLockRef = db.doc(`sentNotifications/${notificationId}_sendSystemNotificationV3`);
    const lockSnap = await notifLockRef.get();
    if (lockSnap.exists) {
      console.log('Already sent, skipping');
      return null;
    }
    await notifLockRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });

    const data = snap.data();
    const userId = data.userId;
    if (!userId) return null;

    console.log(`New system notification for user: ${userId}`);

    // Fetch token for this specific user
    const tokenDoc = await db.collection('fcm_tokens').doc(userId).get();
    if (!tokenDoc.exists || !tokenDoc.data().token) {
      console.log('No valid token found for user.');
      return null;
    }

    const payload = {
      notification: {
        title: data.title || 'إشعار إداري',
        body: data.body || '',
      },
      data: {
        url: `/?tab=profile`,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    try {
      const response = await admin.messaging().send({
        token: tokenDoc.data().token,
        notification: payload.notification,
        data: payload.data,
        webpush: {
          fcmOptions: {
            link: `/?tab=profile`
          }
        }
      });
      console.log('Successfully sent message:', response);
    } catch (error) {
      console.error('Error sending message:', error);
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
         await db.collection('fcm_tokens').doc(userId).delete();
         console.log('Cleaned up invalid token for user', userId);
      }
    }

    return null;
  });

exports.onFirstAttemptComplete = onDocumentCreated(
  {
    document: 'userMCQAnswers/{userId}/lectures/{lectureId}',
    region: 'me-west1'
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    if (!data.hasCompletedFirstAttempt) {
      return;
    }

    const { userId, lectureId } = event.params;
    const { firstAttemptCorrect, firstAttemptTotal } = data;

    const subjectId = data.subjectId || 'unknown_subject';

    const userStatsRef = db.collection('userMCQStats').doc(userId);

    try {
      await db.runTransaction(async (transaction) => {
        const statsDoc = await transaction.get(userStatsRef);

        let stats = statsDoc.exists ? statsDoc.data() : {
          userId,
          totalFirstAttemptCorrect: 0,
          totalFirstAttemptAnswered: 0,
          lecturesAttempted: 0,
          mcqLeaderboardScore: 0,
          accuracy: 0,
          subjectStats: {}
        };

        stats.totalFirstAttemptCorrect += firstAttemptCorrect;
        stats.totalFirstAttemptAnswered += firstAttemptTotal;
        stats.lecturesAttempted += 1;

        if (!stats.subjectStats) stats.subjectStats = {};
        if (!stats.subjectStats[subjectId]) {
          stats.subjectStats[subjectId] = { correct: 0, total: 0, lecturesAttempted: 0 };
        }
        stats.subjectStats[subjectId].correct += firstAttemptCorrect;
        stats.subjectStats[subjectId].total += firstAttemptTotal;
        stats.subjectStats[subjectId].lecturesAttempted += 1;

        if (stats.totalFirstAttemptAnswered > 0) {
          stats.mcqLeaderboardScore = (stats.totalFirstAttemptCorrect / stats.totalFirstAttemptAnswered) * Math.sqrt(stats.totalFirstAttemptAnswered) * 100;
          stats.accuracy = (stats.totalFirstAttemptCorrect / stats.totalFirstAttemptAnswered) * 100;
        }

        stats.lastUpdated = admin.firestore.FieldValue.serverTimestamp();

        transaction.set(userStatsRef, stats, { merge: true });
      });
      console.log(`Successfully updated MCQ stats for user: ${userId}`);
    } catch (error) {
      console.error(`Error updating MCQ stats for user ${userId}:`, error);
    }
    
    return null;
  }
);

const { onCall, HttpsError } = require('firebase-functions/v2/https');

exports.confirmDegreeBatch = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const userRoleDoc = await db.collection('users').doc(request.auth.uid).get();
    const role = userRoleDoc.exists ? userRoleDoc.data().role : null;
    const email = request.auth.token.email;
    const isMasterAdmin = email === 'almdrydyl335@gmail.com' || email === 'fenix.admin@gmail.com';

    if (!isMasterAdmin && role !== 'admin' && role !== 'moderator') {
      throw new HttpsError('permission-denied', 'Only admins can confirm batches.');
    }

    const { examName, confirmedResults } = request.data;
    if (!examName || !Array.isArray(confirmedResults)) {
      throw new HttpsError('invalid-argument', 'Missing or invalid parameters.');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const examId = `exam_${batchId}`;
    
    let saved = 0;
    let failed = 0;
    const studentIds = [];

    // Chunk size of 400 to stay safely under the 500 limit
    const chunkSize = 400;
    
    for (let i = 0; i < confirmedResults.length; i += chunkSize) {
      const chunk = confirmedResults.slice(i, i + chunkSize);
      const batch = db.batch();
      
      for (const result of chunk) {
        if (result.matchedUserId) {
          const studentId = result.matchedUserId;
          studentIds.push(studentId);
          const degreeRef = db.collection(`degrees/${studentId}/exams`).doc(examId);
          
          batch.set(degreeRef, {
            examName,
            degree: result.degree || 0,
            batchId: batchId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          saved++;
        } else {
          failed++;
        }
      }
      
      // On the last chunk, also write the degreeBatches document
      if (i + chunkSize >= confirmedResults.length) {
        const batchRef = db.collection('degreeBatches').doc(batchId);
        batch.set(batchRef, {
          id: batchId,
          examName,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: request.auth.uid,
          status: 'confirmed',
          studentIds: studentIds,
          stats: {
            totalRows: confirmedResults.length,
            matched: saved,
            unmatched: failed
          }
        });
      }

      await batch.commit();
    }

    // Handle case where confirmedResults mapping matched nothing, still write batch
    if (confirmedResults.length === 0) {
      const batch = db.batch();
      const batchRef = db.collection('degreeBatches').doc(batchId);
      batch.set(batchRef, {
        id: batchId,
        examName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
        status: 'confirmed',
        studentIds: studentIds,
        stats: {
          totalRows: 0,
          matched: 0,
          unmatched: 0
        }
      });
      await batch.commit();
    }

    return { saved, failed, batchId };
  } catch (error) {
    console.error('Error confirming degree batch:', error);
    
    // Log error to Firestore
    try {
      await db.collection('debug_logs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        message: error.message || error.toString(),
        stack: error.stack || null,
        function: 'confirmDegreeBatch'
      });
    } catch (e) {
      // Ignored
    }

    if (error instanceof HttpsError) {
      throw error;
    }
    // Changed to 'unknown' so Firebase doesn't strip the error message from the client
    throw new HttpsError('unknown', 'An internal error occurred: ' + (error.message || error.toString()));
  }
});

exports.migrateOriginalNames = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in.');
  }

  const userRoleDoc = await db.collection('users').doc(request.auth.uid).get();
  const role = userRoleDoc.exists ? userRoleDoc.data().role : null;
  const email = request.auth.token.email;
  const isMasterAdmin = email === 'almdrydyl335@gmail.com' || email === 'fenix.admin@gmail.com';

  if (!isMasterAdmin && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can run migration.');
  }

  try {
    const usersSnap = await db.collection('users').get();
    let migratedCount = 0;
    let batch = db.batch();
    const batchSizeLimit = 400; // safe arbitrary margin below 500

    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data();
      if (!data.originalName) {
        // Migration: set originalName to the current name (their real registered name initially or their current name)
        batch.update(docSnap.ref, {
          originalName: data.name || 'Unknown'
        });
        migratedCount++;

        if (migratedCount % batchSizeLimit === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }
    }

    if (migratedCount % batchSizeLimit !== 0) {
      await batch.commit();
    }

    return { success: true, migratedCount };
  } catch (err) {
    console.error('Error during original name migration', err);
    throw new HttpsError('internal', 'Migration failed: ' + err.message);
  }
});
