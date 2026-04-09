import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, getDocs, where, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Lecture, UserProfile, Category, CATEGORIES, Language, TRANSLATIONS } from './types';
import Navbar from './components/Navbar';
import LectureCard from './components/LectureCard';
import AdminUpload from './components/AdminUpload';
import AdminManagement from './components/AdminManagement';
import { Loader2, BookOpen, SearchX, Lock, Shield, Users, UserCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedType, setSelectedType] = useState<LectureType | 'all'>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginStep, setLoginStep] = useState<'password' | 'choice' | 'google' | 'subadmin'>('password');
  const [showAdminManage, setShowAdminManage] = useState(false);
  
  // Sub-admin login states
  const [subUsername, setSubUsername] = useState('');
  const [subPassword, setSubPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRtl]);

  // Auth Listener
  useEffect(() => {
    const adminEmails = ["almdrydyl335@gmail.com", "fenix.admin@gmail.com"];
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (adminEmails.includes(firebaseUser.email || '')) {
          setUser({ 
            uid: firebaseUser.uid, 
            name: 'Admin', 
            email: firebaseUser.email || '', 
            role: 'admin' 
          });
        } else if (firebaseUser.isAnonymous) {
          const subAdmin = localStorage.getItem('subAdmin');
          if (subAdmin) {
            setUser(JSON.parse(subAdmin));
          } else {
            // Logged in anonymously but no sub-admin info? Logout.
            await signOut(auth);
            setUser(null);
          }
        }
      } else {
        const subAdmin = localStorage.getItem('subAdmin');
        if (subAdmin) {
          // We have sub-admin info but no firebase user? 
          // This happens on refresh. We need to re-auth anonymously.
          // But we can't easily re-verify the password here without storing it (insecure).
          // For now, we'll just clear it and force login, or assume the session is dead.
          localStorage.removeItem('subAdmin');
          setUser(null);
        } else {
          setUser(null);
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Lectures Listener
  useEffect(() => {
    const q = query(collection(db, 'lectures'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lecture));
      setLectures(docs);
      setIsLoading(false);
    }, (error) => {
      console.error('Firestore Error:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === '1234FENIX') {
      setLoginStep('choice');
      setLoginError('');
    } else {
      setLoginError(t.incorrectPassword);
    }
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowAdminLogin(false);
    } catch (error) {
      console.error('Login failed:', error);
      setLoginError(isRtl ? 'فشل تسجيل الدخول' : 'Login failed');
    }
  };

  const loginAsSubAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setLoginError('');

    try {
      const q = query(
        collection(db, 'sub_admins'), 
        where('username', '==', subUsername),
        where('password', '==', subPassword)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const adminData = snapshot.docs[0].data();
        
        // Sign in anonymously to get a real Firebase UID for Storage/Firestore rules
        const anonUser = await signInAnonymously(auth);
        
        // Register this UID as an active admin session in Firestore
        // The rules will allow this ONLY if the username/password provided matches the sub_admins record
        await setDoc(doc(db, 'active_admins', anonUser.user.uid), {
          username: subUsername,
          password: subPassword, // Passed to rules for validation
          createdAt: serverTimestamp()
        });

        const subAdminUser: UserProfile = {
          uid: anonUser.user.uid,
          name: adminData.username,
          email: 'sub-admin@lectures.com',
          role: 'admin'
        };
        setUser(subAdminUser);
        localStorage.setItem('subAdmin', JSON.stringify(subAdminUser));
        setShowAdminLogin(false);
        setSubUsername('');
        setSubPassword('');
      } else {
        setLoginError(t.invalidCredentials);
      }
    } catch (err) {
      console.error('Sub-admin login error:', err);
      setLoginError(isRtl ? 'حدث خطأ أثناء تسجيل الدخول' : 'Error during login');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('subAdmin');
    setUser(null);
  };

  const filteredLectures = lectures.filter(lecture => {
    const matchesSearch = lecture.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         lecture.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || lecture.category === selectedCategory;
    const matchesType = selectedType === 'all' || lecture.type === selectedType;
    return matchesSearch && matchesCategory && matchesType;
  });

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
      <Navbar
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onShowUpload={() => setShowUpload(true)}
        lang={lang}
        setLang={setLang}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* University Header */}
        <div className={`mb-12 text-center ${isRtl ? 'sm:text-right' : 'sm:text-left'}`}>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <div className={`flex items-center justify-center ${isRtl ? 'sm:justify-start' : 'sm:justify-start'} gap-3 mb-3`}>
                <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-[0.2em]">
                  {t.byFenix}
                </span>
                <span className="text-gray-400 font-bold text-xs uppercase tracking-widest">
                  {t.university}
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-2">
                {t.department}
              </h1>
              <p className="text-gray-500 font-medium text-lg">
                {t.resourceHub}
              </p>
            </div>
            
            {user && (
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowAdminManage(true)}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-indigo-600 rounded-2xl text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-all"
                >
                  <Users className="w-4 h-4" />
                  {t.manageAdmins}
                </button>
                <button 
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-red-50 border-2 border-red-100 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-100 transition-all"
                >
                  <Lock className="w-4 h-4" />
                  {isRtl ? 'تسجيل الخروج' : 'Logout'}
                </button>
              </div>
            )}
            {!user && (
              <button 
                onClick={() => {
                  setShowAdminLogin(true);
                  setLoginStep('password');
                  setAdminPassword('');
                  setLoginError('');
                }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-gray-100 rounded-2xl text-sm font-bold text-gray-400 hover:text-indigo-600 hover:border-indigo-100 transition-all"
              >
                <Lock className="w-4 h-4" />
                {t.adminPortal}
              </button>
            )}
          </div>
        </div>

        {/* Primary Filters (Type) */}
        <div className="flex flex-wrap gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setSelectedType('all')}
            className={`px-6 py-3 rounded-2xl text-sm font-black transition-all whitespace-nowrap ${
              selectedType === 'all'
                ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {isRtl ? 'الكل' : 'All'}
          </button>
          <button
            onClick={() => setSelectedType('theoretical')}
            className={`px-6 py-3 rounded-2xl text-sm font-black transition-all whitespace-nowrap ${
              selectedType === 'theoretical'
                ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {t.theoretical}
          </button>
          <button
            onClick={() => setSelectedType('practical')}
            className={`px-6 py-3 rounded-2xl text-sm font-black transition-all whitespace-nowrap ${
              selectedType === 'practical'
                ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {t.practical}
          </button>
        </div>

        {/* Secondary Filters (Sub-categories) */}
        <div className="flex flex-wrap gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {t.allSubjects}
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
                selectedCategory === cat.value
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {t[cat.labelKey]}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-gray-500 font-medium">{t.loading}</p>
          </div>
        ) : filteredLectures.length > 0 ? (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            <AnimatePresence mode="popLayout">
              {filteredLectures.map((lecture: Lecture) => (
                <LectureCard key={lecture.id} lecture={lecture} lang={lang} />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-[2rem] border border-dashed border-gray-300"
          >
            <div className="bg-gray-50 p-6 rounded-full mb-4">
              <SearchX className="w-12 h-12 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">{t.noLectures}</h3>
            <p className="text-gray-500 max-w-xs mx-auto">
              {t.noLecturesDesc}
            </p>
          </motion.div>
        )}
      </main>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminLogin && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdminLogin(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Shield className="w-8 h-8 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-black text-center text-gray-900 mb-2">{t.adminAccess}</h2>
                <p className="text-center text-gray-500 mb-8">{t.enterPassword}</p>

                {loginStep === 'password' && (
                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={t.password}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-center text-xl tracking-widest"
                    />
                    {loginError && (
                      <div className="flex items-center gap-2 text-red-600 text-sm font-bold justify-center">
                        <AlertCircle className="w-4 h-4" />
                        {loginError}
                      </div>
                    )}
                    <button
                      type="submit"
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      {t.verifyPassword}
                    </button>
                  </form>
                )}

                {loginStep === 'choice' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 border border-green-100 rounded-2xl text-green-700 text-sm font-bold text-center mb-6">
                      {t.passwordCorrect}
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={loginWithGoogle}
                        className="flex items-center justify-center gap-3 w-full py-4 bg-white border-2 border-gray-200 rounded-2xl font-bold hover:bg-gray-50 transition-all"
                      >
                        <UserCircle className="w-5 h-5 text-gray-600" />
                        {t.confirmIdentity}
                      </button>
                      <button
                        onClick={() => setLoginStep('subadmin')}
                        className="flex items-center justify-center gap-3 w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                      >
                        <Users className="w-5 h-5" />
                        {t.subAdminLogin}
                      </button>
                    </div>
                  </div>
                )}

                {loginStep === 'google' && (
                  <div className="space-y-6">
                    <button
                      onClick={loginWithGoogle}
                      className="flex items-center justify-center gap-3 w-full py-4 bg-white border-2 border-gray-200 rounded-2xl font-bold hover:bg-gray-50 transition-all"
                    >
                      <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                      {t.confirmIdentity}
                    </button>
                    <button onClick={() => setLoginStep('choice')} className="w-full text-sm text-gray-400 font-bold hover:text-gray-600">
                      {isRtl ? 'رجوع' : 'Back'}
                    </button>
                  </div>
                )}

                {loginStep === 'subadmin' && (
                  <form onSubmit={loginAsSubAdmin} className="space-y-4">
                    <input
                      required
                      type="text"
                      placeholder={t.username}
                      value={subUsername}
                      onChange={(e) => setSubUsername(e.target.value)}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    <input
                      required
                      type="password"
                      placeholder={t.password}
                      value={subPassword}
                      onChange={(e) => setSubPassword(e.target.value)}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                    {loginError && (
                      <div className="flex items-center gap-2 text-red-600 text-sm font-bold justify-center">
                        <AlertCircle className="w-4 h-4" />
                        {loginError}
                      </div>
                    )}
                    <button
                      disabled={isSubmitting}
                      type="submit"
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
                      {t.login}
                    </button>
                    <button type="button" onClick={() => setLoginStep('choice')} className="w-full text-sm text-gray-400 font-bold hover:text-gray-600">
                      {isRtl ? 'رجوع' : 'Back'}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AdminUpload isOpen={showUpload} onClose={() => setShowUpload(false)} lang={lang} />
      <AdminManagement isOpen={showAdminManage} onClose={() => setShowAdminManage(false)} lang={lang} />
      
      <footer className="mt-20 border-t border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-gray-900">{t.appName}</span>
          </div>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">
            {t.university} • {t.department}
          </p>
          <p className="text-[10px] text-gray-400 font-medium">
            &copy; 2026 {t.byFenix}. {t.allRights}
          </p>
        </div>
      </footer>
    </div>
  );
}
