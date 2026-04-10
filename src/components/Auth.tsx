import React from 'react';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { BookOpen, GraduationCap } from 'lucide-react';
import { motion } from 'motion/react';

export default function Auth() {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user profile exists
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        // Create student profile by default
        // If it's the admin email, we can set it to admin
        const isAdmin = user.email === 'almdrydyl335@gmail.com';
        await setDoc(doc(db, 'users', user.uid), {
          name: user.displayName || 'Student',
          email: user.email,
          role: isAdmin ? 'admin' : 'student',
        });
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-xl shadow-emerald-100/50 dark:shadow-none p-8 text-center border border-slate-100 dark:border-zinc-800"
      >
        <div className="inline-flex p-4 bg-emerald-600 dark:bg-teal-600 rounded-3xl mb-6 shadow-lg shadow-emerald-200/50 dark:shadow-none">
          <BookOpen className="w-10 h-10 text-white" />
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 dark:text-stone-100 mb-2 tracking-tight">محاضراتي</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-10 font-medium">Access your pharmacy lectures anytime, anywhere.</p>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl font-bold text-slate-700 dark:text-stone-100 hover:bg-slate-50 dark:hover:bg-zinc-700 hover:border-emerald-100 dark:hover:border-teal-900/50 transition-all group"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>
          
          <div className="pt-6 flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
            <GraduationCap className="w-4 h-4" />
            Student Portal
          </div>
        </div>
      </motion.div>
    </div>
  );
}
