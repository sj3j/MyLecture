import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { messaging, db } from '../lib/firebase';
import { UserProfile } from '../types';

export function usePushNotifications(user: UserProfile | null) {
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!user) return;
    try {
      const msg = await messaging();
      if (!msg) {
        console.log('Firebase Messaging is not supported in this browser.');
        return;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        console.log('Notification permission granted.');
        const currentToken = await getToken(msg, {
          // vapidKey: 'YOUR_PUBLIC_VAPID_KEY_HERE'
        });

        if (currentToken) {
          console.log('FCM Token retrieved:', currentToken);
          await setDoc(doc(db, 'fcm_tokens', user.uid), {
            token: currentToken,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } else {
          console.log('No registration token available. Request permission to generate one.');
        }
      } else {
        console.log('Notification permission denied.');
      }
    } catch (error) {
      console.error('An error occurred while setting up notifications:', error);
    }
  };

  useEffect(() => {
    if (!user) return;

    const setupForegroundListener = async () => {
      try {
        const msg = await messaging();
        if (!msg) return;

        // Handle foreground messages
        onMessage(msg, (payload) => {
          console.log('Message received. ', payload);
          // You could show a toast notification here
        });
      } catch (error) {
        console.error('Error setting up foreground listener:', error);
      }
    };

    setupForegroundListener();

    // If permission is already granted, refresh the token
    if (permission === 'granted') {
      requestPermission();
    }
  }, [user, permission]);

  return { permission, requestPermission };
}
