import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signInWithCustomToken, UserCredential } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Language, TRANSLATIONS } from '../types';
import { Loader2, GraduationCap, Mail, Lock, LogIn } from 'lucide-react';

interface LoginScreenProps {
  lang: Language;
  externalError?: string | null;
  onClearError?: () => void;
}

const errorMessages: Record<string, string> = {
  'auth/wrong-password':
    'كلمة المرور غير صحيحة',
  'auth/user-not-found':
    'البريد الإلكتروني غير مسجل',
  'auth/invalid-email':
    'صيغة البريد الإلكتروني غير صحيحة',
  'auth/invalid-credential':
    'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'auth/user-disabled':
    'تم تعطيل هذا الحساب، تواصل مع الإدارة',
  'auth/network-request-failed':
    'خطأ في الشبكة — تحقق من الإنترنت وحاول مرة أخرى',
  'auth/timeout':
    'انتهت مهلة الاتصال — حاول مرة أخرى',
  'auth/too-many-requests':
    'تم تجاوز عدد المحاولات — انتظر قليلاً وحاول مرة أخرى',
  'auth/web-storage-unsupported':
    'متصفحك لا يدعم هذه الميزة — تحقق من إعدادات Safari',
  'auth/operation-not-allowed':
    'تسجيل الدخول بالبريد الإلكتروني غير مفعّل',
  'OFFLINE':
    'لا يوجد اتصال بالإنترنت',
};

const signInWithRetry = async (
  email: string,
  password: string,
  retries = 1
): Promise<UserCredential> => {
  try {
    const emailLower = email.trim().toLowerCase();
    
    // Check our custom backend first to get a custom token securely
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailLower, password: password.trim() })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMsg = data.error || 'Invalid credentials';
      
      const err = new Error(errorMsg);
      if (response.status === 401 || response.status === 404) {
        (err as any).code = 'auth/invalid-credential';
      } else if (response.status === 403) {
        (err as any).code = 'auth/user-disabled';
      } else {
        (err as any).code = 'auth/internal-error';
      }
      throw err;
    }

    const { token } = await response.json();
    return await signInWithCustomToken(auth, token);
  } catch (error: any) {
    if (
      retries > 0 &&
      (error.code === 'auth/network-request-failed' || error.message.includes('network-request-failed') || error.message.includes('Failed to fetch'))
    ) {
      await new Promise(r => setTimeout(r, 1500));
      return signInWithRetry(email, password, retries - 1);
    }
    if (error.message.includes('Failed to fetch')) {
      error.code = 'auth/network-request-failed';
    }
    throw error;
  }
};

const isIOSPrivateMode = async (): Promise<boolean> => {
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return false;
  } catch {
    return true;
  }
};

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' &&
   navigator.maxTouchPoints > 1);

export default function LoginScreen({ lang, externalError, onClearError }: LoginScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPrivateMode, setIsPrivateMode] = useState(false);

  React.useEffect(() => {
    const checkPrivateMode = async () => {
      if (isIOS() && await isIOSPrivateMode()) {
        setIsPrivateMode(true);
      }
    };
    checkPrivateMode();
  }, []);

  React.useEffect(() => {
    if (externalError) {
      setError(externalError);
      setIsLoading(false);
    }
  }, [externalError]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    if (onClearError) onClearError();
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check whitelist
      let userRole = 'student';

      if (result.user.email) {
        const emailLower = result.user.email.toLowerCase();
        
        const adminEmails = ["almdrydyl335@gmail.com"];
        const isMasterAdmin = adminEmails.includes(emailLower);
        
        if (isMasterAdmin) {
           userRole = 'admin'; // Will become master_admin by cloud function
        } else {
          // Check allowed_admins
          const adminDoc = await getDoc(doc(db, 'allowed_admins', emailLower));
          if (adminDoc.exists()) {
            const data = adminDoc.data();
            userRole = data.role || 'admin';
          } else {
            // Check students collection
            const studentDoc = await getDoc(doc(db, 'students', emailLower));
            if (studentDoc.exists()) {
              const data = studentDoc.data();
              if (!data.isActive) {
                return; // App.tsx will handle sign out
              }
              userRole = data.role || 'student';
            } else {
              return; // App.tsx will handle sign out
            }
          }
        }
      }

      // Check if user exists in Firestore
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        // Create new user document
        const initialName = result.user.displayName || (userRole === 'admin' ? 'Admin' : 'Student');
        await setDoc(userRef, {
          name: initialName,
          originalName: initialName,
          email: result.user.email,
          role: userRole,
          photoUrl: result.user.photoURL,
          createdAt: serverTimestamp(),
          favorites: [],
          studied: [],
          completedWeeklyTasks: [],
          notificationPreferences: { lectures: true, announcements: true }
        });
      } else {
        // If user exists but role is different from whitelist, update it
        const currentRole = userSnap.data().role;
        if (currentRole !== userRole && (userRole === 'admin')) {
          await setDoc(userRef, { role: userRole }, { merge: true });
        }
      }
    } catch (error: any) {
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        console.error('Error signing in:', error);
        if (!externalError) {
          let errorMsg = error.message || '';
          if (error.code === 'auth/network-request-failed' || errorMsg.includes('network-request-failed') || errorMsg.includes('Failed to fetch')) {
            setError(isRtl 
              ? 'خطأ في الشبكة. لحل المشكلة (خاصة لمستخدمي الآيفون):\n١- افتح الرابط في متصفح سفاري (Safari) أو كروم وليس من داخل التليجرام أو تطبيقات أخرى.\n٢- تأكد من صحة تاريخ ووقت الجهاز.\n٣- قم بإيقاف (Private Relay) من إعدادات الـ iCloud.\n٤- جرب شبكة إنترنت مختلفة.' 
              : 'Network error. Troubleshooting (iOS):\n1- Open directly in Safari/Chrome (not in-app browsers).\n2- Check device date/time.\n3- Disable Private Relay.\n4- Try a different network.');
          } else {
            setError(isRtl ? 'حدث خطأ أثناء تسجيل الدخول' : 'Error signing in');
          }
        }
      }
    } finally {
      if (!externalError) {
        setIsLoading(false);
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!navigator.onLine) {
      setError(errorMessages['OFFLINE']);
      return;
    }
    setError(null);
    setIsLoading(true);
    if (onClearError) onClearError();

    try {
      const result = await signInWithRetry(email, password);

      // Check if user exists in users collection
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      
      let userRole = 'student';
      let studentData: any = {};
      const emailLower = email.trim().toLowerCase();
      
      const allowedDoc = await getDoc(doc(db, 'allowed_admins', emailLower));
      
      const adminEmails = ["almdrydyl335@gmail.com"];
      const isMasterAdmin = adminEmails.includes(emailLower);
      
      if (isMasterAdmin) {
        userRole = 'admin';
      } else if (allowedDoc.exists()) {
        userRole = allowedDoc.data().role || 'admin';
      } else {
        try {
          const studentDoc = await getDoc(doc(db, 'students', emailLower));
          if (studentDoc.exists()) {
            studentData = studentDoc.data() || {};
            userRole = studentData.role || 'student';
          }
        } catch (e: any) {
          if (e.code === 'permission-denied') {
            console.log("User not in students whitelist or admin collection");
            throw new Error('غير مصرح لك بالدخول. يرجى التواصل مع الإدارة لإضافة بريدك الإلكتروني.');
          }
          throw e; // rethrow other errors
        }
      }
      
      if (!userSnap.exists()) {
        const initialName = studentData.name || (userRole === 'admin' ? 'Admin' : 'Student');
        
        await setDoc(userRef, {
          name: initialName,
          originalName: initialName,
          email: emailLower,
          role: userRole,
          examCode: studentData.examCode || '',
          createdAt: serverTimestamp(),
          favorites: [],
          studied: [],
          completedWeeklyTasks: [],
          notificationPreferences: { lectures: true, announcements: true }
        });
      } else {
        const currentRole = userSnap.data().role;
        if (currentRole !== userRole && (userRole === 'admin')) {
          await setDoc(userRef, { role: userRole }, { merge: true });
        }
      }

    } catch (err: any) {
      console.error('Email sign in error:', err);
      setError(
        errorMessages[err.code] ||
        errorMessages[err.message] ||
        `حدث خطأ غير متوقع (${err.code || 'unknown'})`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-zinc-800 text-center">
        <div className="w-20 h-20 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <GraduationCap className="w-10 h-10 text-sky-600 dark:text-sky-400" />
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 dark:text-stone-100 mb-2">
          {t.appName}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          {t.university} - {t.department}
        </p>

        {isPrivateMode && (
          <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-xl text-sm font-bold border border-orange-200 dark:border-orange-900/50 whitespace-pre-line text-center">
            ⚠️ أنت في وضع التصفح الخاص.
            <br />
            قد لا يعمل تسجيل الدخول بشكل صحيح.
            <br />
            يُنصح بفتح الرابط في متصفح عادي.
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold border border-red-100 dark:border-red-900/50 whitespace-pre-line">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="mb-6 space-y-4 text-left">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 px-1">
              {isRtl ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(e.target.value.trim())}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-zinc-700 rounded-xl leading-5 bg-slate-50 dark:bg-zinc-800 placeholder-slate-400 focus:outline-none focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-colors text-slate-900 dark:text-stone-100"
                placeholder="student@example.com"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 px-1">
              {isRtl ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="current-password"
                className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-zinc-700 rounded-xl leading-5 bg-slate-50 dark:bg-zinc-800 placeholder-slate-400 focus:outline-none focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-colors text-slate-900 dark:text-stone-100"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            style={{ opacity: isLoading ? 0.7 : 1 }}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white px-6 py-3.5 rounded-xl font-bold hover:bg-sky-700 transition-all disabled:opacity-50 mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري التحقق...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5 shrink-0" />
                <span>تسجيل الدخول ←</span>
              </>
            )}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-zinc-800"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-zinc-900 text-slate-500 dark:text-slate-400">
              {isRtl ? 'أو' : 'Or'}
            </span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          type="button"
          className="w-full flex items-center justify-center gap-3 bg-white dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-200 px-6 py-3.5 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-sky-600 shrink-0" />
          ) : (
            <>
              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>{isRtl ? 'المتابعة باستخدام جوجل' : 'Continue with Google'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
