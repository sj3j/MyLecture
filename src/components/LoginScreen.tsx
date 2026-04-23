import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Language, TRANSLATIONS } from '../types';
import { Loader2, GraduationCap, Mail, Lock, LogIn } from 'lucide-react';

interface LoginScreenProps {
  lang: Language;
  externalError?: string | null;
  onClearError?: () => void;
}

export default function LoginScreen({ lang, externalError, onClearError }: LoginScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      
      // Check whitelist FIRST
      const adminEmails = ["almdrydyl335@gmail.com", "fenix.admin@gmail.com"];
      const isMasterAdmin = adminEmails.includes(result.user.email || '');
      
      let userRole = isMasterAdmin ? 'admin' : 'student';

      if (!isMasterAdmin && result.user.email) {
        const emailLower = result.user.email.toLowerCase();
        
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

      // Check if user exists in Firestore
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        // Create new user document
        const initialName = result.user.displayName || (userRole === 'admin' ? 'Admin' : userRole === 'moderator' ? 'Moderator' : 'Student');
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
        if (currentRole !== userRole && (userRole === 'admin' || userRole === 'moderator')) {
          await setDoc(userRef, { role: userRole }, { merge: true });
        }
      }
    } catch (error: any) {
      console.error('Error signing in:', error);
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        if (!externalError) {
          setError(isRtl ? 'حدث خطأ أثناء تسجيل الدخول' : 'Error signing in');
        }
      }
    } finally {
      if (!externalError) {
        setIsLoading(false);
      }
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError(null);
    if (onClearError) onClearError();

    try {
      const emailLower = email.trim().toLowerCase();
      
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailLower, password })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || (isRtl ? 'الباسورد أو الإيميل خطأ' : 'Invalid credentials'));
      }

      const { token } = await response.json();
      const result = await signInWithCustomToken(auth, token);

      // Check if user exists in users collection
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        const studentDoc = await getDoc(doc(db, 'students', emailLower));
        const studentData = studentDoc.data() || {};
        const initialName = studentData.name || 'Student';
        
        await setDoc(userRef, {
          name: initialName,
          originalName: initialName,
          email: emailLower,
          role: studentData.role || 'student',
          examCode: studentData.examCode || '',
          createdAt: serverTimestamp(),
          favorites: [],
          studied: [],
          completedWeeklyTasks: [],
          notificationPreferences: { lectures: true, announcements: true }
        });
      }

    } catch (err: any) {
      console.error('Email sign in error:', err);
      setError(err.message || (isRtl ? 'الباسورد أو الإيميل خطأ' : 'Invalid credentials'));
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

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold border border-red-100 dark:border-red-900/50">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailSignIn} className="mb-6 space-y-4 text-left">
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
                className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-zinc-700 rounded-xl leading-5 bg-slate-50 dark:bg-zinc-800 placeholder-slate-400 focus:outline-none focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 sm:text-sm transition-colors text-slate-900 dark:text-stone-100"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white px-6 py-3.5 rounded-xl font-bold hover:bg-sky-700 transition-all disabled:opacity-50 mt-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5 shrink-0" />
                <span>{isRtl ? 'تسجيل الدخول' : 'Sign In'}</span>
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
