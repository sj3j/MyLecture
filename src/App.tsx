import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, getDocs, where, doc, setDoc, serverTimestamp, getDoc, limit, updateDoc } from 'firebase/firestore';
import { Lecture, UserProfile, Category, CATEGORIES, Language, TRANSLATIONS, LectureType } from './types';
import Navbar from './components/Navbar';
import LectureCard from './components/LectureCard';
import AdminUpload from './components/AdminUpload';
import AdminManagement from './components/AdminManagement';
import StudentManagement from './components/StudentManagement';
import StreakManagement from './components/StreakManagement';
import AdminGradesScreen from './components/grades/AdminGradesScreen';
import AdminQuestionBankScreen from './components/questionBank/AdminQuestionBankScreen';
import StudentGradesScreen from './components/grades/StudentGradesScreen';
import AntiCheatDashboard from './components/AntiCheatDashboard';
import BottomNav, { Tab } from './components/BottomNav';
import AnnouncementsScreen from './components/AnnouncementsScreen';
import WeeklyListScreen from './components/WeeklyListScreen';
import ProfileScreen from './components/ProfileScreen';
import RecordsScreen from './components/RecordsScreen';
import ChatScreen from './components/ChatScreen';
import SubjectBrowser from './components/SubjectBrowser';
import HomeScreen from './components/HomeScreen';
import LoginScreen from './components/LoginScreen';
import OnboardingScreen from './components/OnboardingScreen';
import OnboardingSlides from './components/OnboardingSlides';
import GlobalAudioPlayer from './components/GlobalAudioPlayer';
import MCQOverlay from './components/MCQOverlay';
import { Loader2, BookOpen, SearchX, Lock, Shield, Users, UserCircle, AlertCircle, ArrowUp, ArrowDown, Flame, GraduationCap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Fuse from 'fuse.js';
import { usePushNotifications } from './hooks/usePushNotifications';
import { syncPendingSubmissions } from './services/mcqAnswerService';

type SortField = 'title' | 'date' | 'number';
type SortOrder = 'asc' | 'desc';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    // Attempt to sync any offline MCQ submissions when the app loads or comes online
    syncPendingSubmissions();
    const handleOnline = () => syncPendingSubmissions();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('hasSeenOnboarding');
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedType, setSelectedType] = useState<LectureType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortField>('number');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [currentTab, setCurrentTab] = useState<Tab>('home');
  const [showUpload, setShowUpload] = useState(false);
  const [lectureToEdit, setLectureToEdit] = useState<Lecture | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdminManage, setShowAdminManage] = useState(false);
  const [showStudentManage, setShowStudentManage] = useState(false);
  const [showStreakManage, setShowStreakManage] = useState(false);
  const [showAdminGrades, setShowAdminGrades] = useState(false);
  const [showAdminBank, setShowAdminBank] = useState(false);
  const [showAntiCheat, setShowAntiCheat] = useState(false);
  const [showStudentGrades, setShowStudentGrades] = useState(false);

  useEffect(() => {
    const handleOpenAntiCheat = () => setShowAntiCheat(true);
    const handleOpenBank = () => setShowAdminBank(true);
    window.addEventListener('open-anti-cheat-board', handleOpenAntiCheat);
    window.addEventListener('open-admin-bank', handleOpenBank);
    return () => {
      window.removeEventListener('open-anti-cheat-board', handleOpenAntiCheat);
      window.removeEventListener('open-admin-bank', handleOpenBank);
    };
  }, []);
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [mcqLecture, setMcqLecture] = useState<Lecture | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    }
    return 'light';
  });

  const { permission, requestPermission, isRequesting } = usePushNotifications(user);
  const [hideNotificationBanner, setHideNotificationBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hideNotificationBanner') === 'true';
    }
    return false;
  });

  const handleDismissNotification = () => {
    setHideNotificationBanner(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hideNotificationBanner', 'true');
    }
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRtl]);

  // Auth Listener
  useEffect(() => {
    const adminEmails = ["almdrydyl335@gmail.com", "fenix.admin@gmail.com"];
    let userUnsubscribe: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userEmail = firebaseUser.email || firebaseUser.uid;
        const isMasterAdmin = adminEmails.includes(userEmail?.toLowerCase() || '');
        
        let studentData: any = null;

        if (!isMasterAdmin && userEmail) {
          try {
            const emailLower = userEmail.toLowerCase();
            
            // Check allowed_admins
            const adminDoc = await getDoc(doc(db, 'allowed_admins', emailLower));
            if (adminDoc.exists()) {
              const data = adminDoc.data();
              studentData = {
                name: data.role === 'moderator' ? 'Moderator' : 'Admin',
                email: emailLower,
                isActive: true,
                role: data.role || 'admin',
                permissions: data.permissions
              };
            } else {
              // Check students collection
              const studentDoc = await getDoc(doc(db, 'students', emailLower));
              if (studentDoc.exists()) {
                const data = studentDoc.data();
                studentData = {
                  ...data,
                  id: studentDoc.id
                };
              }
            }

            if (!studentData) {
              await signOut(auth);
              setLoginError(isRtl ? 'هذا الحساب غير مسجل في التطبيق. يرجى التواصل مع الإدارة.' : 'This account is not registered. Please contact administration.');
              setUser(null);
              setIsAuthReady(true);
              return;
            }
            
            if (!studentData.isActive) {
              await signOut(auth);
              setLoginError(isRtl ? 'تم تعطيل حسابك. يرجى التواصل مع الإدارة.' : 'Your account has been deactivated. Please contact administration.');
              setUser(null);
              setIsAuthReady(true);
              return;
            }
          } catch (error) {
            console.error("Error checking student whitelist:", error);
            await signOut(auth);
            setLoginError(isRtl ? 'حدث خطأ أثناء التحقق من الحساب.' : 'Error verifying account.');
            setUser(null);
            setIsAuthReady(true);
            return;
          }
        }

        // Listen to user document
        userUnsubscribe = onSnapshot(doc(db, 'users', firebaseUser.uid), (userDoc) => {
          if (userDoc.exists()) {
            const whitelistRole = studentData?.role === 'admin' || studentData?.role === 'moderator' ? studentData.role : null;
            
            const defaultEmailName = firebaseUser.email ? firebaseUser.email.split('@')[0] : '';
            const isDefaultName = userDoc.data().name === defaultEmailName || 
                                  userDoc.data().name === 'Admin' || 
                                  userDoc.data().name === 'Moderator' || 
                                  userDoc.data().name === 'Student';
            
            // If the user has a custom name in their profile, use it.
            // Otherwise, prefer the name from the students collection (studentData.name),
            // then fallback to the default generated name.
            const resolvedName = (!isDefaultName && userDoc.data().name) 
              ? userDoc.data().name 
              : (studentData?.name && studentData.name !== 'Admin' && studentData.name !== 'Moderator' ? studentData.name : (userDoc.data().name || firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student')));

            const masterAdminPermissions = isMasterAdmin ? {
              manageLectures: true,
              manageAnnouncements: true,
              manageRecords: true,
              manageChat: true,
              manageHomeworks: true,
              manageStudents: true,
              manageGrades: true
            } : undefined;

            setUser({
              uid: firebaseUser.uid,
              name: resolvedName,
              email: firebaseUser.email || userDoc.data().email || firebaseUser.uid || '',
              role: isMasterAdmin ? 'admin' : (whitelistRole || userDoc.data().role || 'student'),
              isMasterAdmin,
              photoUrl: userDoc.data().photoUrl || firebaseUser.photoURL || undefined,
              streakCount: userDoc.data().streakCount || 0,
              lastActiveDate: userDoc.data().lastActiveDate || undefined,
              lastStreakDate: userDoc.data().lastStreakDate || undefined,
              examCode: studentData?.examCode || userDoc.data().examCode || undefined,
              group: userDoc.data().group || undefined,
              favorites: userDoc.data().favorites || [],
              studied: userDoc.data().studied || [],
              completedWeeklyTasks: userDoc.data().completedWeeklyTasks || [],
              notificationPreferences: userDoc.data().notificationPreferences || { lectures: true, announcements: true, chat: true, records: true, homeworks: true },
              memberSince: studentData?.createdAt || userDoc.data().createdAt,
              permissions: masterAdminPermissions || userDoc.data().permissions || studentData?.permissions,
              hideNameOnLeaderboard: userDoc.data().hideNameOnLeaderboard,
              hidePhotoOnLeaderboard: userDoc.data().hidePhotoOnLeaderboard
            });
          } else {
            const masterAdminPermissions = isMasterAdmin ? {
              manageLectures: true,
              manageAnnouncements: true,
              manageRecords: true,
              manageChat: true,
              manageHomeworks: true,
              manageStudents: true,
              manageGrades: true
            } : undefined;

            setUser({
              uid: firebaseUser.uid,
              name: studentData?.name || firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student'),
              email: firebaseUser.email || firebaseUser.uid || '',
              role: isMasterAdmin ? 'admin' : (studentData?.role || 'student'),
              isMasterAdmin,
              photoUrl: firebaseUser.photoURL || undefined,
              examCode: studentData?.examCode || undefined,
              favorites: [],
              studied: [],
              completedWeeklyTasks: [],
              notificationPreferences: { lectures: true, announcements: true, chat: true, records: true, homeworks: true },
              memberSince: studentData?.createdAt,
              permissions: masterAdminPermissions || studentData?.permissions,
              hideNameOnLeaderboard: false,
              hidePhotoOnLeaderboard: false
            });
          }
          setIsAuthReady(true);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          // Fallback if permission denied
          const masterAdminPermissions = isMasterAdmin ? {
            manageLectures: true,
            manageAnnouncements: true,
            manageRecords: true,
            manageChat: true,
            manageHomeworks: true,
            manageStudents: true,
            manageGrades: true
          } : undefined;

          setUser({
            uid: firebaseUser.uid,
            name: studentData?.name || firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student'),
            email: firebaseUser.email || '',
            role: isMasterAdmin ? 'admin' : (studentData?.role || 'student'),
            isMasterAdmin,
            photoUrl: firebaseUser.photoURL || undefined,
            examCode: studentData?.examCode || undefined,
            favorites: [],
            studied: [],
            completedWeeklyTasks: [],
            notificationPreferences: { lectures: true, announcements: true, chat: true, records: true, homeworks: true },
            memberSince: studentData?.createdAt,
            permissions: masterAdminPermissions || studentData?.permissions,
            hideNameOnLeaderboard: false,
            hidePhotoOnLeaderboard: false
          });
          setIsAuthReady(true);
        });
      } else {
        if (userUnsubscribe) {
          userUnsubscribe();
        }
        
        setUser(null);
        setIsAuthReady(true);
      }
    });
    return () => {
      unsubscribe();
      if (userUnsubscribe) {
        userUnsubscribe();
      }
    };
  }, []);

  // Streak Logic
  useEffect(() => {
    // We will just call the API once per mount if user is present
    if (user?.uid) {
      const recordActivity = async () => {
        try {
           const token = await auth.currentUser?.getIdToken();
           if (!token) return;
           const res = await fetch("/api/record-activity", {
             method: "POST",
             headers: {
               "Content-Type": "application/json",
               "Authorization": `Bearer ${token}`
             }
           });
           const data = await res.json();
           if (data.success && data.freezeUsed) {
              console.log('Freeze token used!');
           }
        } catch (e) {
          console.error("Failed to record activity", e);
        }
      };
      
      recordActivity();
    }
  }, [user?.uid]); // Only call when user uid is available on initial mount

  // Announcements Listener for Notifications
  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const latestPost = snapshot.docs[0].data();
        const latestTime = latestPost.createdAt?.toMillis?.() || 0;
        const lastRead = parseInt(localStorage.getItem('lastReadAnnouncement') || '0', 10);
        
        if (latestTime > lastRead && currentTab !== 'announcements') {
          setHasUnreadAnnouncements(true);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements');
    });
    return () => unsubscribe();
  }, [currentTab, user]);

  useEffect(() => {
    if (currentTab === 'announcements') {
      setHasUnreadAnnouncements(false);
      localStorage.setItem('lastReadAnnouncement', Date.now().toString());
    }
  }, [currentTab]);

  // Lectures Listener
  useEffect(() => {
    if (!user) {
      setLectures([]);
      setIsLoading(false);
      return;
    }

    const q = query(collection(db, 'lectures'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } as Lecture));
      setLectures(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'lectures');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredLectures = React.useMemo(() => {
    let base = lectures.filter(lecture => {
      const matchesCategory = selectedCategory === 'all' || lecture.category === selectedCategory;
      const matchesType = selectedType === 'all' || lecture.type === selectedType;
      return matchesCategory && matchesType;
    });

    if (searchQuery.trim()) {
      const fuse = new Fuse(base, {
        keys: ['title', 'description'],
        threshold: 0.4,
        ignoreLocation: true,
      });
      base = fuse.search(searchQuery).map(result => result.item);
    }

    return base.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title, lang === 'ar' ? 'ar' : 'en');
      } else if (sortBy === 'date') {
        const dateA = a.createdAt?.toMillis?.() || 0;
        const dateB = b.createdAt?.toMillis?.() || 0;
        comparison = dateA - dateB;
      } else if (sortBy === 'number') {
        const numA = a.number || 0;
        const numB = b.number || 0;
        comparison = numA - numB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [lectures, selectedCategory, selectedType, searchQuery, sortBy, sortOrder, lang]);

  const handleNavigateToChat = useCallback(() => setCurrentTab('chat'), []);
  const handleEditLecture = useCallback((l: Lecture) => { setLectureToEdit(l); setShowUpload(true); }, []);
  const handleOpenMCQ = useCallback((l: Lecture) => setMcqLecture(l), []);
  const handleCloseUpload = useCallback(() => { setShowUpload(false); setLectureToEdit(null); }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <Loader2 className="w-10 h-10 text-sky-600 dark:text-sky-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen lang={lang} externalError={loginError} onClearError={() => setLoginError(null)} />;
  }

  if (!user.group && user.role === 'student') {
    return <OnboardingScreen user={user} lang={lang} />;
  }

  if (showOnboarding) {
    return (
      <OnboardingSlides 
        onComplete={() => {
          localStorage.setItem('hasSeenOnboarding', 'true');
          setShowOnboarding(false);
        }} 
      />
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return isRtl ? 'صباح الخير' : 'Good morning';
    if (hour < 18) return isRtl ? 'مساء الخير' : 'Good afternoon';
    return isRtl ? 'مساء الخير' : 'Good evening';
  };



  const isAnyOverlayOpen = showUpload || showAdminManage || showStudentManage || showAdminGrades || showAdminBank || showStudentGrades || showAntiCheat || (mcqLecture !== null);

  return (
    <div className={`min-h-screen bg-stone-50 dark:bg-zinc-900 text-slate-900 dark:text-stone-100 ${currentTab === 'chat' ? '' : 'pb-20'} font-sans transition-colors duration-300`} dir={isRtl ? 'rtl' : 'ltr'}>
      {!isAnyOverlayOpen && (
        <Navbar
          user={user}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onShowUpload={() => setShowUpload(true)}
          lang={lang}
          setLang={setLang}
          currentTab={currentTab}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}

      {user && permission === 'default' && !hideNotificationBanner && (
        <div className="bg-sky-600 text-white px-4 py-3 sm:px-6 lg:px-8 flex items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">
              {isRtl ? 'قم بتفعيل الإشعارات لتلقي تنبيهات عند إضافة محاضرات جديدة.' : 'Enable notifications to receive alerts when new lectures are added.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={requestPermission}
              disabled={isRequesting}
              className="px-4 py-1.5 bg-white text-sky-600 text-sm font-bold rounded-lg hover:bg-sky-50 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRequesting ? (isRtl ? 'جاري التفعيل...' : 'Enabling...') : (isRtl ? 'تفعيل' : 'Enable')}
            </button>
            <button onClick={handleDismissNotification} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" title="Dismiss">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {['home', 'lectures', 'weekly', 'records', 'leaderboard', 'downloads'].includes(currentTab) && (
        <HomeScreen 
          user={user} 
          lang={lang} 
          lectures={lectures} 
          searchQuery={searchQuery} 
          isLoading={isLoading} 
          onNavigateToChat={handleNavigateToChat} 
          onEdit={handleEditLecture} 
          onOpenMCQ={handleOpenMCQ}
          setShowStudentManage={setShowStudentManage}
            setShowStreakManage={setShowStreakManage} 
          setShowAdminManage={setShowAdminManage} 
          initialTab={currentTab === 'home' ? 'lectures' : currentTab as any} 
        />
      )}
      {currentTab === 'announcements' && (
        <AnnouncementsScreen user={user} lang={lang} lectures={lectures} onNavigateToChat={handleNavigateToChat} onOpenMCQ={handleOpenMCQ} />
      )}
      {currentTab === 'chat' && (
        <ChatScreen user={user} lang={lang} setCurrentTab={setCurrentTab} />
      )}
      {currentTab === 'profile' && (
        <ProfileScreen user={user} lang={lang} setLang={setLang} setShowAdminManage={setShowAdminManage} setShowStudentManage={setShowStudentManage} setShowStreakManage={setShowStreakManage} setShowAdminGrades={setShowAdminGrades} setShowStudentGrades={setShowStudentGrades} />
      )}

      <AdminUpload 
        isOpen={showUpload} 
        onClose={handleCloseUpload} 
        lang={lang} 
        lectureToEdit={lectureToEdit}
        user={user}
      />
      <AdminManagement isOpen={showAdminManage} onClose={() => setShowAdminManage(false)} lang={lang} />
      <StreakManagement isOpen={showStreakManage} onClose={() => setShowStreakManage(false)} lang={lang} user={user} />
      <StudentManagement isOpen={showStudentManage} onClose={() => setShowStudentManage(false)} lang={lang} user={user} />
      <AdminGradesScreen isOpen={showAdminGrades} onClose={() => setShowAdminGrades(false)} user={user} />
      <AdminQuestionBankScreen isOpen={showAdminBank} onClose={() => setShowAdminBank(false)} lang={lang} />
      <AntiCheatDashboard isOpen={showAntiCheat} onClose={() => setShowAntiCheat(false)} lang={lang} />
      <StudentGradesScreen isOpen={showStudentGrades} onClose={() => setShowStudentGrades(false)} />
      
      {mcqLecture && user && (
        <MCQOverlay 
          lecture={mcqLecture} 
          user={user} 
          lang={lang} 
          onClose={() => setMcqLecture(null)} 
        />
      )}

      <GlobalAudioPlayer isRtl={isRtl} />
      {!isAnyOverlayOpen && (
        <BottomNav currentTab={currentTab} setCurrentTab={setCurrentTab} lang={lang} hasUnreadAnnouncements={hasUnreadAnnouncements} />
      )}
    </div>
  );
}
