const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.sendLectureNotification = functions.firestore
  .document('lectures/{lectureId}')
  .onCreate(async (snap, context) => {
    const lectureData = snap.data();
    const lectureTitle = lectureData.title || 'New Lecture';
    const lectureId = context.params.lectureId;

    console.log('New lecture created:', lectureTitle);

    // Fetch all FCM tokens
    const tokensSnapshot = await admin.firestore().collection('fcm_tokens').get();
    
    if (tokensSnapshot.empty) {
      console.log('No FCM tokens found. Skipping notification.');
      return null;
    }

    const tokens = [];
    const tokenDocs = [];

    tokensSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token) {
        tokens.push(data.token);
        tokenDocs.push(doc.id);
      }
    });

    if (tokens.length === 0) {
      console.log('No valid tokens found.');
      return null;
    }

    const payload = {
      notification: {
        title: 'New Lecture Uploaded!',
        body: lectureTitle,
      },
      data: {
        url: `/?lecture=${lectureId}`, // Or whatever URL structure you want to open
        click_action: 'FLUTTER_NOTIFICATION_CLICK', // Often useful for TWA/Flutter
      },
    };

    console.log(`Sending notifications to ${tokens.length} devices.`);

    // Send multicast message
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

    // Clean up invalid tokens
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

    return null;
  });
