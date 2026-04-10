import React, { useState, useRef } from 'react';
import { auth, db, storage } from '../lib/firebase';
import { signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Language, TRANSLATIONS, UserProfile } from '../types';
import { User, LogOut, LogIn, Shield, Loader2, AlertCircle, Edit2, Camera, Check, X } from 'lucide-react';

interface ProfileScreenProps {
  user: UserProfile | null;
  lang: Language;
  setLang: (lang: Language) => void;
}

export default function ProfileScreen({ user, lang, setLang }: ProfileScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update local state when user prop changes
  React.useEffect(() => {
    if (user && !isEditing) {
      setEditName(user.name);
      setEditPhotoPreview(user.photoUrl || null);
    }
  }, [user, isEditing]);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if user is in users collection or is master admin
      const adminEmails = ["almdrydyl335@gmail.com", "fenix.admin@gmail.com"];
      const isMasterAdmin = adminEmails.includes(result.user.email || '');
      
      let role = 'student';
      
      if (isMasterAdmin) {
        role = 'admin';
      } else {
        // Check if email is in allowed_admins
        const allowedDoc = await getDoc(doc(db, 'allowed_admins', (result.user.email || '').toLowerCase()));
        if (allowedDoc.exists()) {
          role = 'admin';
        } else {
          // Check if they are already an admin in users collection
          const userDoc = await getDoc(doc(db, 'users', result.user.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') {
            role = 'admin';
          }
        }
      }

      // Save user to users collection
      await setDoc(doc(db, 'users', result.user.uid), {
        name: result.user.displayName || 'User',
        email: result.user.email || '',
        role: role
      }, { merge: true });
      
      // If we get here, they are signed in. The auth state listener in App.tsx will handle setting the user state.
    } catch (err) {
      console.error('Login error:', err);
      setError(isRtl ? 'حدث خطأ أثناء تسجيل الدخول' : 'Error during login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setError(isRtl ? 'حجم الصورة يجب أن يكون أقل من 5 ميجابايت' : 'Image size must be less than 5MB');
        return;
      }
      setEditPhotoFile(file);
      setEditPhotoPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!editName.trim()) {
      setError(isRtl ? 'الاسم مطلوب' : 'Name is required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      let photoUrl = user.photoUrl;

      if (editPhotoFile) {
        const safeFileName = editPhotoFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `profiles/${user.uid}_${Date.now()}_${safeFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, editPhotoFile);

        photoUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed', 
            null, 
            (err) => reject(err), 
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (err) {
                reject(err);
              }
            }
          );
        });
      }

      await setDoc(doc(db, 'users', user.uid), {
        name: editName.trim(),
        role: user.role,
        email: user.email,
        ...(photoUrl ? { photoUrl } : {})
      }, { merge: true });

      setIsEditing(false);
      setEditPhotoFile(null);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(isRtl ? 'حدث خطأ أثناء حفظ التغييرات' : 'Error saving changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-sky-100 dark:bg-sky-900/30 rounded-2xl text-sky-600 dark:text-sky-400">
          <User className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-stone-100">{t.navProfile}</h1>
      </div>

      {user ? (
        <div className="bg-white dark:bg-zinc-800 rounded-3xl p-6 border border-slate-200 dark:border-zinc-700 shadow-sm mb-6">
          {error && isEditing && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          
          <div className="flex items-center gap-4 mb-6 relative">
            <div className="relative">
              {isEditing ? (
                <div 
                  className="w-20 h-20 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center text-sky-600 dark:text-sky-400 text-2xl font-bold cursor-pointer overflow-hidden group border-2 border-dashed border-sky-300 dark:border-sky-700 hover:border-sky-500 dark:hover:border-sky-500 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {editPhotoPreview ? (
                    <img src={editPhotoPreview} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Camera className="w-8 h-8 text-sky-400 dark:text-sky-500 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors" />
                  )}
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </div>
              ) : (
                <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center text-sky-600 dark:text-sky-400 text-2xl font-bold overflow-hidden shadow-sm">
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handlePhotoChange} 
                accept="image/*" 
                className="hidden" 
              />
            </div>
            
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none font-bold text-slate-900 dark:text-stone-100 mb-1"
                  placeholder={isRtl ? 'الاسم' : 'Name'}
                />
              ) : (
                <h2 className="text-xl font-bold text-slate-900 dark:text-stone-100 truncate">{user.name}</h2>
              )}
              <p className="text-slate-500 dark:text-slate-400 text-sm truncate">{user.email}</p>
              {user.role === 'admin' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-xs font-bold mt-2">
                  <Shield className="w-3 h-3" />
                  Admin
                </span>
              )}
            </div>

            {user.role === 'admin' && (
              <div className="absolute top-0 right-0 (isRtl ? 'left-0 right-auto' : '')">
                {isEditing ? (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setIsEditing(false);
                        setEditName(user.name);
                        setEditPhotoPreview(user.photoUrl || null);
                        setEditPhotoFile(null);
                        setError('');
                      }}
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="p-2 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-full transition-colors disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="p-2 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-full transition-colors"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-zinc-700">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{isRtl ? 'اللغة' : 'Language'}</span>
              <div className="flex bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl">
                <button
                  onClick={() => setLang('ar')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${lang === 'ar' ? 'bg-white dark:bg-zinc-800 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                  العربية
                </button>
                <button
                  onClick={() => setLang('en')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${lang === 'en' ? 'bg-white dark:bg-zinc-800 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                  English
                </button>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors mt-4"
            >
              <LogOut className="w-5 h-5" />
              {isRtl ? 'تسجيل الخروج' : 'Logout'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-800 rounded-3xl p-8 border border-slate-200 dark:border-zinc-700 shadow-sm text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-stone-100 mb-2">{isRtl ? 'تسجيل الدخول' : 'Sign In'}</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
            {isRtl 
              ? 'قم بتسجيل الدخول بحساب جوجل لحفظ تقدمك في المهام الأسبوعية، أو للوصول إلى لوحة تحكم الإدارة.' 
              : 'Sign in with Google to save your weekly tasks progress, or to access the admin dashboard.'}
          </p>
          
          {error && (
            <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium flex items-center gap-2 justify-center">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 rounded-xl text-slate-700 dark:text-stone-100 font-bold hover:bg-slate-50 dark:hover:bg-zinc-700 hover:border-sky-200 dark:hover:border-sky-700 transition-all disabled:opacity-50"
          >
            {isLoggingIn ? (
              <Loader2 className="w-5 h-5 animate-spin text-sky-600 dark:text-sky-400" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {isRtl ? 'تسجيل الدخول باستخدام جوجل' : 'Sign in with Google'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
