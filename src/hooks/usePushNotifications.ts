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

  const requestToken = async () => {
    if (!user) return;
    try {
      const msg = await messaging();
      if (!msg) return;
      
      const registration = await navigator.serviceWorker.ready;
      const currentToken = await getToken(msg, {
        serviceWorkerRegistration: registration,
      });

      if (currentToken) {
        await setDoc(doc(db, 'fcm_tokens', user.uid), {
          token: currentToken,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const requestPermission = async () => {
    if (!user) return;
    try {
      // Request permission FIRST before any async operations to preserve user gesture context
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        console.log('Notification permission granted.');
        await requestToken();
      } else {
        console.log('Notification permission denied.');
      }
    } catch (error) {
      console.error('An error occurred while setting up notifications:', error);
    }
  };

  useEffect(() => {
    if (!user) return;

    let unsubscribe: (() => void) | undefined;

    const setupForegroundListener = async () => {
      try {
        const msg = await messaging();
        if (!msg) return;

        // Handle foreground messages and save the unsubscribe function
        unsubscribe = onMessage(msg, (payload) => {
          console.log('Message received. ', payload);
          
          // Show a native notification even when the app is in the foreground
          if (Notification.permission === 'granted') {
            const title = payload.notification?.title || 'New Notification';
            const options = {
              body: payload.notification?.body || '',
              icon: '/icon-192.png',
              data: payload.data,
            };
            
            navigator.serviceWorker.ready.then((registration) => {
              registration.showNotification(title, options);
            });
          }
        });
      } catch (error) {
        console.error('Error setting up foreground listener:', error);
      }
    };

    setupForegroundListener();

    // If permission is already granted, refresh the token
    if (permission === 'granted') {
      requestToken();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user?.uid, permission]);

  return { permission, requestPermission };
}
