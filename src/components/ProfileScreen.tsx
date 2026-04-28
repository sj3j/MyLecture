import React, { useState, useRef } from 'react';
import { auth, db, storage } from '../lib/firebase';
import { signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Language, TRANSLATIONS, UserProfile } from '../types';
import { User, LogOut, LogIn, Shield, Loader2, AlertCircle, Edit2, Camera, Check, X, HardDrive, FileText, Bell, ChevronRight, Info } from 'lucide-react';
import NotificationsModal from './NotificationsModal';

interface ProfileScreenProps {
  user: UserProfile | null;
  lang: Language;
  setLang: (lang: Language) => void;
  setShowAdminManage?: (val: boolean) => void;
  setShowStudentManage?: (val: boolean) => void;
  setShowAdminGrades?: (val: boolean) => void;
  setShowStudentGrades?: (val: boolean) => void;
}

export default function ProfileScreen({ user, lang, setLang, setShowAdminManage, setShowStudentManage, setShowAdminGrades, setShowStudentGrades }: ProfileScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [showManageDownloads, setShowManageDownloads] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editExamCode, setEditExamCode] = useState(user?.examCode || '');
  const [editGroup, setEditGroup] = useState(user?.group || '');
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update local state when user prop changes
  React.useEffect(() => {
    if (user && !isEditing) {
      setEditName(user.name);
      setEditExamCode(user.examCode || '');
      setEditGroup(user.group || '');
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
      let permissions = undefined;
      
      if (isMasterAdmin) {
        role = 'admin';
        permissions = {
          manageLectures: true,
          manageAnnouncements: true,
          manageRecords: true,
          manageChat: true,
          manageHomeworks: true,
          manageStudents: true,
        };
      } else {
        // Check if email is in allowed_admins
        const allowedDoc = await getDoc(doc(db, 'allowed_admins', (result.user.email || '').toLowerCase()));
        if (allowedDoc.exists()) {
          role = allowedDoc.data().role || 'admin';
          permissions = allowedDoc.data().permissions;
        } else {
          // Check if they are already an admin or moderator in users collection
          const userDoc = await getDoc(doc(db, 'users', result.user.uid));
          if (userDoc.exists() && ['admin', 'moderator'].includes(userDoc.data().role)) {
            role = userDoc.data().role;
            permissions = userDoc.data().permissions;
          }
        }
      }

      // Save user to users collection
      const userData: any = {
        name: result.user.displayName || 'User',
        email: result.user.email || '',
        role: role
      };
      if (permissions) {
        userData.permissions = permissions;
      }

      await setDoc(doc(db, 'users', result.user.uid), userData, { merge: true });
      
      // If we get here, they are signed in. The auth state listener in App.tsx will handle setting the user state.
    } catch (err) {
      console.error('Login error:', err);
      setError(isRtl ? 'حدث خطأ أثناء تسجيل الدخول' : 'Error during login');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const adminEmails = ["almdrydyl335@gmail.com", "fenix.admin@gmail.com"];
  const isMasterAdminUser = !!user?.email && adminEmails.includes(user.email.toLowerCase());

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
        group: editGroup.trim(),
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

  const handleToggleNotification = async (type: 'lectures' | 'announcements' | 'chat' | 'records' | 'homeworks') => {
    if (!user) return;
    const currentPrefs = user.notificationPreferences || { lectures: true, announcements: true, chat: true, records: true, homeworks: true };
    const newPrefs = { ...currentPrefs, [type]: currentPrefs[type] === undefined ? false : !currentPrefs[type] };
    
    try {
      await setDoc(doc(db, 'users', user.uid), {
        notificationPreferences: newPrefs
      }, { merge: true });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
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
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>
            ) : (
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center text-sky-600 dark:text-sky-400 text-2xl font-bold overflow-hidden shadow-sm">
                {user!.photoUrl ? (
                  <img src={user!.photoUrl} alt={user!.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  user!.name.charAt(0).toUpperCase()
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
              <div className="space-y-3">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none font-bold text-slate-900 dark:text-stone-100"
                  placeholder={isRtl ? 'الاسم' : 'Name'}
                />
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-slate-900 dark:text-stone-100 truncate">{user!.name}</h2>
              </>
            )}
            <p className="text-slate-500 dark:text-slate-400 text-sm truncate mt-1">{user!.email}</p>
            {user!.role === 'admin' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-xs font-bold mt-2">
                <Shield className="w-3 h-3" />
                Admin
              </span>
            )}
            {user!.role === 'moderator' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-bold mt-2">
                <Shield className="w-3 h-3" />
                Moderator
              </span>
            )}
          </div>

          <div className={`absolute top-0 ${isRtl ? 'left-0' : 'right-0'}`}>
            {isEditing ? (
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(user!.name);
                    setEditPhotoPreview(user!.photoUrl || null);
                    setEditExamCode(user!.examCode || '');
                    setEditGroup(user!.group || '');
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
        </div>

        {user!.memberSince && (
          <div className="mb-6 text-sm text-slate-500 dark:text-slate-400 font-medium">
            {isRtl ? 'عضو منذ:' : 'Member since:'}{' '}
            {new Date(user!.memberSince.seconds ? user!.memberSince.seconds * 1000 : user!.memberSince).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        )}

        <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/30 rounded-2xl p-4 mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Shield className="w-24 h-24 text-orange-500" />
          </div>
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="text-sm font-bold text-orange-800 dark:text-orange-300 flex items-center gap-2">
              {isRtl ? 'حالة الستريك' : 'Streak Status'}
            </h3>
            <button 
              onClick={() => setShowStreakInfo(true)}
              className="p-1 rounded-full text-orange-500 bg-orange-100 dark:bg-orange-800/30 hover:bg-orange-200 dark:hover:bg-orange-800/50 transition-colors"
              title={isRtl ? 'معلومات الستريك' : 'Streak Info'}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 relative z-10">
            <div className="bg-white/60 dark:bg-zinc-800/50 p-3 rounded-xl border border-orange-200/50 dark:border-orange-700/30 text-center backdrop-blur-sm">
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-1">🔥 Current</p>
              <p className="text-xl font-bold text-orange-700 dark:text-orange-300">{user?.streakCount || 0}</p>
            </div>
            <div className="bg-white/60 dark:bg-zinc-800/50 p-3 rounded-xl border border-orange-200/50 dark:border-orange-700/30 text-center backdrop-blur-sm">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">🏆 Longest</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{Math.max(user?.longestStreak || 0, user?.streakCount || 0)}</p>
            </div>
            <div className="bg-white/60 dark:bg-zinc-800/50 p-3 rounded-xl border border-orange-200/50 dark:border-orange-700/30 text-center backdrop-blur-sm">
              <p className="text-xs text-sky-600 dark:text-sky-400 font-medium mb-1 flex items-center justify-center gap-1"><Shield className="w-3 h-3" /> Shields</p>
              <p className="text-xl font-bold text-sky-700 dark:text-sky-400">{Math.min(user?.freezeTokens ?? 1, 3)}/3</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-zinc-700 mb-6">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{isRtl ? 'المعلومات الأكاديمية' : 'Academic Information'}</h3>
          {isEditing ? (
            <div className="flex gap-4">
              <div className="flex-1 opacity-60">
                <label className="block text-xs text-slate-500 mb-1">{isRtl ? 'الكود الامتحاني (ثابت)' : 'Exam Code (Fixed)'}</label>
                <div className="w-full px-3 py-2 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg font-bold text-slate-400 dark:text-stone-500">
                  {user!.examCode || '---'}
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">{isRtl ? 'الكروب' : 'Group'}</label>
                <select
                  value={editGroup}
                  onChange={(e) => setEditGroup(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none font-bold text-slate-900 dark:text-stone-100"
                >
                  <option value="">{isRtl ? 'اختر الكروب' : 'Select Group'}</option>
                  {['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium">{isRtl ? 'الكود الامتحاني' : 'Exam Code'}</p>
                <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{user!.examCode || '---'}</p>
              </div>
              <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/50">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-1 font-medium">{isRtl ? 'الكروب' : 'Group'}</p>
                <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{user!.group || '---'}</p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowNotificationsModal(true)}
          className="w-full flex items-center justify-between px-4 py-4 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded-2xl font-bold transition-colors mb-6 mt-6 border border-sky-100 dark:border-sky-800/50"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5" />
            <span>{isRtl ? 'إشعارات المحادثة والتطبيق' : 'Chat & App Notifications'}</span>
          </div>
          <ChevronRight className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
        </button>

        <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-zinc-700">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{isRtl ? 'إعدادات الإشعارات' : 'Notification Settings'}</h3>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{isRtl ? 'إشعارات المحاضرات الجديدة' : 'New Lecture Notifications'}</span>
            <button
              onClick={() => handleToggleNotification('lectures')}
              className={`w-12 h-6 rounded-full transition-colors relative ${user!.notificationPreferences?.lectures !== false ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${user!.notificationPreferences?.lectures !== false ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{isRtl ? 'إشعارات التبليغات' : 'Announcement Notifications'}</span>
            <button
              onClick={() => handleToggleNotification('announcements')}
              className={`w-12 h-6 rounded-full transition-colors relative ${user!.notificationPreferences?.announcements !== false ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${user!.notificationPreferences?.announcements !== false ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{isRtl ? 'إشعارات الشات' : 'Chat Notifications'}</span>
            <button
              onClick={() => handleToggleNotification('chat')}
              className={`w-12 h-6 rounded-full transition-colors relative ${user!.notificationPreferences?.chat !== false ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${user!.notificationPreferences?.chat !== false ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{isRtl ? 'إشعارات التسجيلات' : 'Record Notifications'}</span>
            <button
              onClick={() => handleToggleNotification('records')}
              className={`w-12 h-6 rounded-full transition-colors relative ${user!.notificationPreferences?.records !== false ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${user!.notificationPreferences?.records !== false ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{isRtl ? 'إشعارات الواجبات' : 'Homework Notifications'}</span>
            <button
              onClick={() => handleToggleNotification('homeworks')}
              className={`w-12 h-6 rounded-full transition-colors relative ${user!.notificationPreferences?.homeworks !== false ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${user!.notificationPreferences?.homeworks !== false ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} />
            </button>
          </div>
          <div className="flex items-center justify-between mt-6">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{isRtl ? 'إخفاء اسمي من لوحة الصدارة' : 'Hide my name from Leaderboard'}</span>
            <button
              onClick={async () => {
                const newValue = !user!.hideNameOnLeaderboard;
                try {
                  await setDoc(doc(db, 'users', user!.uid), {
                    hideNameOnLeaderboard: newValue
                  }, { merge: true });
                } catch (error) {
                  console.error('Error updating leaderboard preference:', error);
                }
              }}
              className={`w-12 h-6 rounded-full transition-colors relative ${user!.hideNameOnLeaderboard ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${user!.hideNameOnLeaderboard ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} />
            </button>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{isRtl ? 'إخفاء صورتي من لوحة الصدارة' : 'Hide my photo from Leaderboard'}</span>
            <button
              onClick={async () => {
                const newValue = !user!.hidePhotoOnLeaderboard;
                try {
                  await setDoc(doc(db, 'users', user!.uid), {
                    hidePhotoOnLeaderboard: newValue
                  }, { merge: true });
                } catch (error) {
                  console.error('Error updating leaderboard preference:', error);
                }
              }}
              className={`w-12 h-6 rounded-full transition-colors relative ${user!.hidePhotoOnLeaderboard ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${user!.hidePhotoOnLeaderboard ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')}`} />
            </button>
          </div>
        </div>

        <div className="space-y-4 pt-6 mt-6 border-t border-slate-100 dark:border-zinc-700">
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

          {(user?.role === 'admin' && (user?.email === 'almdrydyl335@gmail.com' || user?.email === 'fenix.admin@gmail.com')) && setShowAdminManage && (
            <button
              onClick={() => setShowAdminManage(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors mt-4"
            >
              <Shield className="w-5 h-5" />
              {t.manageAdmins}
            </button>
          )}

          {((user?.role === 'admin' || user?.role === 'moderator') && user?.permissions?.manageStudents !== false) && setShowStudentManage && (
            <button
              onClick={() => setShowStudentManage(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors mt-4"
            >
              <User className="w-5 h-5" />
              {isRtl ? 'إدارة الطلاب' : 'Manage Students'}
            </button>
          )}

          {isMasterAdminUser && setShowAdminGrades && (
            <button
              onClick={() => setShowAdminGrades(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 rounded-xl font-bold hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900/50 transition-colors mt-4"
            >
              <HardDrive className="w-5 h-5" />
              {isRtl ? 'إدارة السعيّات والدرجات' : 'Manage Grades'}
            </button>
          )}

          {user?.role === 'student' && setShowStudentGrades && (
            <button
              onClick={() => setShowStudentGrades(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl font-bold hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors mt-4"
            >
              <Shield className="w-5 h-5" />
              {isRtl ? 'السعيّات والدرجات المعتمدة' : 'Official Grades'}
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors mt-4"
          >
            <LogOut className="w-5 h-5" />
            {isRtl ? 'تسجيل الخروج' : 'Logout'}
          </button>
        </div>
      </div>

      {showNotificationsModal && user && (
        <NotificationsModal
          user={user}
          lang={lang}
          onClose={() => setShowNotificationsModal(false)}
        />
      )}

      {showStreakInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative p-6">
            <button onClick={() => setShowStreakInfo(false)} className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full transition-colors z-10">
              <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-3xl flex items-center justify-center mx-auto mb-4 transform -rotate-6">
                <Shield className="w-10 h-10 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white capitalize">
                {isRtl ? 'كيف يعمل الستريك؟' : 'How the streak works'}
              </h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-xl shrink-0"><Check className="w-5 h-5 text-emerald-500" /></div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{isRtl ? 'تتبع نشاطك' : 'Track your activity'}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{isRtl ? 'كل يوم تفتح فيه التطبيق، يزداد الستريك الخاص بك.' : 'Every day you open the app, your streak increases by one day.'}</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-xl shrink-0"><Shield className="w-5 h-5 text-blue-500" /></div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{isRtl ? 'دروع التجميد (الحد: 3)' : 'Freeze Shields (Max: 3)'}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{isRtl ? 'بإمكانك امتلاك 3 دروع بحد أقصى. إذا نسيت الدخول للتطبيق، تمتص الدروع الضرر وتنقذ الستريك من الضياع.' : 'You can have up to 3 shields. If you miss a day, the shield will absorb the hit and save your streak from resetting.'}</p>
                </div>
              </div>
            </div>
            
            <div className="mt-8 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 rounded-2xl text-sm font-medium text-center">
              {isRtl ? 'واصل الحفاظ على تألقك ونجاحك اليومي!' : 'Keep up the daily grind to stay on fire!'}
            </div>
            
            <button
               onClick={() => setShowStreakInfo(false)}
               className="w-full mt-6 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-orange-500/30"
            >
              {isRtl ? 'حسناً، فهمت' : 'Got it!'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
