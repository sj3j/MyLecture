import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

const blurListeners = new Map<string, () => void>();

export function enableAntiScreenshot(userId: string, lectureId: string, onScreenshot?: () => void) {
  // Web equivalents for screenshot prevention attempts
  // 1. Prevent standard selection and context menu
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';
  
  const blockContextMenu = (e: Event) => e.preventDefault();
  document.addEventListener('contextmenu', blockContextMenu);
  
  // 2. Track window blur (leaving the app)
  const onBlur = async () => {
    try {
      await logSuspiciousActivity(userId, lectureId, 'app_backgrounded');
      if (onScreenshot) onScreenshot();
    } catch (err) {
      console.error(err);
    }
  };
  
  window.addEventListener('blur', onBlur);

  // 3. Track common screenshot shortcuts (minimal effort on web, but catches some)
  const onKeyDown = async (e: KeyboardEvent) => {
    // PrintScreen key or Cmd+Shift+3/4 on Mac
    if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4'))) {
      try {
        await handleScreenshotDetected(userId, lectureId);
        if (onScreenshot) onScreenshot();
      } catch (err) {
        console.error(err);
      }
    }
  };
  window.addEventListener('keydown', onKeyDown);

  blurListeners.set(`${userId}_${lectureId}`, () => {
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    document.removeEventListener('contextmenu', blockContextMenu);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('keydown', onKeyDown);
  });
}

export function disableAntiScreenshot(userId: string, lectureId: string) {
  const cleanup = blurListeners.get(`${userId}_${lectureId}`);
  if (cleanup) {
    cleanup();
    blurListeners.delete(`${userId}_${lectureId}`);
  }
}

export async function handleScreenshotDetected(userId: string, lectureId: string) {
  await logSuspiciousActivity(userId, lectureId, 'screenshot');
  const count = await getScreenshotCount(userId, lectureId);
  if (count >= 3) {
    await flagAttemptAsSuspicious(userId, lectureId);
  }
}

export async function logSuspiciousActivity(userId: string, lectureId: string, type: string, questionIndex?: number) {
  try {
    await addDoc(collection(db, 'antiCheatLogs'), {
      userId,
      lectureId,
      type,
      questionIndex: questionIndex ?? null,
      platform: 'web',
      timestamp: serverTimestamp(),
      deviceInfo: navigator.userAgent
    });
  } catch (err) {
    console.error('Failed to log suspicious activity', err);
  }
}

export async function getScreenshotCount(userId: string, lectureId: string): Promise<number> {
  // Normally we would query the collection here, but to avoid large reads client-side,
  // we could keep a running count in a specific doc. 
  // For now we'll just mock it or you could implement the query if needed.
  return 1; // Simplified for client. Server should calculate this.
}

export async function flagAttemptAsSuspicious(userId: string, lectureId: string) {
  // Suspend MCQ access
  const userRef = doc(db, `users/${userId}`);
  await updateDoc(userRef, {
    mcqBanned: true
  });
}

export async function checkMCQBanStatus(userId: string): Promise<boolean> {
  try {
    const userSnap = await getDoc(doc(db, `users/${userId}`));
    if (userSnap.exists()) {
      return userSnap.data().mcqBanned === true;
    }
  } catch(e) {}
  return false;
}
