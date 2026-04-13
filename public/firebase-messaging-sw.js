importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.11.0/firebase-messaging-compat.js');

const firebaseConfig = {
  projectId: "gen-lang-client-0712465288",
  appId: "1:204896817368:web:976ca869b597c3c427c7ad",
  apiKey: "AIzaSyBd27jVmdRBCP2kHTMHqxHfupyDQUUZCg4",
  authDomain: "gen-lang-client-0712465288.firebaseapp.com",
  messagingSenderId: "204896817368",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Dummy push event listener to satisfy PWABuilder's static analysis.
// Firebase Messaging handles the actual push event internally.
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Push event received');
});

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icon.png', // We will assume the user puts their icon here or we will create a placeholder
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
