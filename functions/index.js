const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

async function getTokensWithPreferences(preferenceKey) {
  const tokensSnapshot = await admin.firestore().collection('fcm_tokens').get();
  
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
    const usersSnapshot = await admin.firestore().collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
    
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
      const batch = admin.firestore().batch();
      failedTokens.forEach((userId) => {
        const ref = admin.firestore().collection('fcm_tokens').doc(userId);
        batch.delete(ref);
      });
      await batch.commit();
      console.log('Cleanup complete.');
    }
  }
}

exports.sendLectureNotification = functions.firestore
  .document('lectures/{lectureId}')
  .onCreate(async (snap, context) => {
    const lectureData = snap.data();
    const lectureTitle = lectureData.title || 'New Lecture';
    const lectureId = context.params.lectureId;

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

exports.sendAnnouncementNotification = functions.firestore
  .document('announcements/{announcementId}')
  .onCreate(async (snap, context) => {
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

exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
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
    } else if (post.photo) {
      announcement.type = 'image';
      announcement.text = post.caption || '';
      announcement.content = post.caption || '';
      
      const photo = post.photo[post.photo.length - 1];
      const fileId = photo.file_id;
      
      const fileResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
      const filePath = fileResponse.data.result.file_path;
      announcement.imageUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    } else if (post.video) {
      announcement.type = 'video';
      announcement.text = post.caption || '';
      announcement.content = post.caption || '';
      
      const fileId = post.video.file_id;
      const fileResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
      const filePath = fileResponse.data.result.file_path;
      announcement.videoUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    } else {
      return res.status(200).send('Unsupported message type');
    }

    await admin.firestore().collection('announcements').add(announcement);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing Telegram update:', error.response?.data || error.message);
    return res.status(200).send('Error but acknowledged'); // Acknowledge to Telegram to stop retries
  }
});

exports.sendHomeworkNotification = functions.firestore
  .document('homeworks/{homeworkId}')
  .onCreate(async (snap, context) => {
    const homeworkData = snap.data();
    const subject = homeworkData.subject || 'Unknown Subject';
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
