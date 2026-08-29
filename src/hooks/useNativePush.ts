import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

/**
 * Push notifications for the Capacitor build.
 *
 * The existing usePushNotifications hook uses firebase/messaging, which is WEB
 * push - a service worker plus the Push API. Neither exists inside an Android
 * WebView, so on the installed app that hook silently registers nothing and no
 * notification ever arrives. Native builds have to go through the OS via
 * @capacitor/push-notifications and FCM's Android SDK instead.
 *
 * Both paths end at the same place: an FCM token on `users/{uid}.fcmToken`,
 * which is what /api/cron/streak-warnings and /api/notify already send to. So
 * nothing on the server needed to change.
 *
 * The plugin is imported dynamically so the web bundle never pulls it in.
 */
export function useNativePush(user: UserProfile | null) {
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      let Capacitor: any, PushNotifications: any;
      try {
        ({ Capacitor } = await import('@capacitor/core'));
        if (!Capacitor?.isNativePlatform?.()) return; // web handles itself
        ({ PushNotifications } = await import('@capacitor/push-notifications'));
      } catch {
        return; // plugin absent - web build
      }

      try {
        // Android 13+ requires a runtime prompt; below that this resolves granted.
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          perm = await PushNotifications.requestPermissions();
        }
        if (cancelled) return;

        if (perm.receive !== 'granted') {
          setPermission('denied');
          return;
        }
        setPermission('granted');

        const onReg = await PushNotifications.addListener('registration', async (t: { value: string }) => {
          if (cancelled) return;
          setToken(t.value);
          try {
            // Same field the web path writes, so the existing senders just work.
            await setDoc(doc(db, 'users', user.uid), {
              fcmToken: t.value,
              fcmPlatform: 'android',
              fcmUpdatedAt: new Date().toISOString(),
            }, { merge: true });
          } catch (err) {
            console.error('Failed to save push token:', err);
          }
        });

        const onErr = await PushNotifications.addListener('registrationError', (err: any) => {
          console.error('Push registration failed:', err);
        });

        await PushNotifications.register();

        cleanup = () => { onReg.remove?.(); onErr.remove?.(); };
      } catch (err) {
        console.error('Native push setup failed:', err);
      }
    })();

    return () => { cancelled = true; cleanup?.(); };
  }, [user?.uid]);

  return { token, permission };
}
