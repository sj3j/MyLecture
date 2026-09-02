import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, getDocs, where, doc, setDoc, serverTimestamp, getDoc, limit, updateDoc } from 'firebase/firestore';
import { Lecture, UserProfile, Category, CATEGORIES, Language, TRANSLATIONS, LectureType } from './types';
import Navbar from './components/Navbar';
import { useStageContext } from './contexts/StageContext';
import LectureCard from './components/LectureCard';
import AdminUpload from './components/AdminUpload';
import AdminManagement from './components/AdminManagement';
import StudentManagement from './components/StudentManagement';
import StreakManagement from './components/StreakManagement';
import AcademicCalendarModal from './components/AcademicCalendarModal';
import SettingsScreen from './components/settings/SettingsScreen';
import ProgressionScreen from './components/ProgressionScreen';
import { useAcademicPhase } from './hooks/useAcademicPhase';
import { useTheme } from './hooks/useTheme';
import { useNativePush } from './hooks/useNativePush';
import { nextProgressionStep, ProgressionRound } from '../shared/progression';
import AdminGradesScreen from './components/grades/AdminGradesScreen';
import AdminQuestionBankScreen from './components/questionBank/AdminQuestionBankScreen';
import StudentGradesScreen from './components/grades/StudentGradesScreen';
import AntiCheatDashboard from './components/AntiCheatDashboard';
import AdminLogsScreen from './components/AdminLogsScreen';
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
// Lazy: pdf.js and its worker are ~1MB and must not land in the main chunk.
const PdfReaderOverlay = lazy(() => import('./components/pdf/PdfReaderOverlay'));
import NotificationsModal from './components/NotificationsModal';
import SubscriptionScreen from './components/SubscriptionScreen';
import SubscriptionManagement from './components/SubscriptionManagement';
import SubscriptionPaywall from './components/SubscriptionPaywall';
import { Loader2, BookOpen, SearchX, Lock, Shield, Users, UserCircle, AlertCircle, ArrowUp, ArrowDown, Flame, GraduationCap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Fuse from 'fuse.js';
import { usePushNotifications } from './hooks/usePushNotifications';
import { syncPendingSubmissions } from './services/mcqAnswerService';
import { apiUrl } from './lib/apiBase';

type SortField = 'title' | 'date' | 'number';
type SortOrder = 'asc' | 'desc';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const { effectiveStageId, setActiveUser } = useStageContext();

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

  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [hasUnreadInbox, setHasUnreadInbox] = useState(false);
  // Which end-of-year question is open comes from the academic calendar's
  // results dates, replacing the old settings/app_settings.isProgressionSeasonActive
  // flag that nothing ever wrote.
  const {
    gate: progressionGateNow,
    yearLabel: academicYearLabel,
    calendar: academicCalendar,
  } = useAcademicPhase();

  /**
   * The question currently on screen. Latched rather than derived, because the
   * user doc is live: the moment the answer is written the step becomes 'none',
   * which would rip the congratulations screen away before it is read.
   */
  const [progressionRound, setProgressionRound] = useState<ProgressionRound | null>(null);


  const [user, setUser] = useState<UserProfile | null>(null);
  useEffect(() => {
    if (!user) { setProgressionRound(null); return; }
    const step = nextProgressionStep({
      gate: progressionGateNow,
      yearLabel: academicYearLabel,
      stages: academicCalendar.progressionStages,
      user: {
        role: user.role,
        stageId: user.stageId,
        progressionYear: user.progressionYear,
        progressionState: user.progressionState,
        graduated: user.graduated,
        isMasterAdmin: user.isMasterAdmin,
      },
    });
    // Only ever latches ON here; it is cleared when the student dismisses the
    // screen, so answering does not yank the congratulations away.
    if (step !== 'none') setProgressionRound(step);
  }, [user, progressionGateNow, academicYearLabel, academicCalendar]);
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
  const [showCalendarSettings, setShowCalendarSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdminGrades, setShowAdminGrades] = useState(false);
  const [showAdminBank, setShowAdminBank] = useState(false);
  const [showAntiCheat, setShowAntiCheat] = useState(false);
  const [showAdminLogs, setShowAdminLogs] = useState(false);
  const [showStudentGrades, setShowStudentGrades] = useState(false);
  const [showSubManage, setShowSubManage] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // Return leg of a ZainCash payment: the gateway sends the customer back to
  // /?payment=... , which lands on the default tab. Surface the subscription
  // screen so the result is visible; that screen reads and clears the param.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('payment')) {
      setCurrentTab('subscription');
    }
  }, []);

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
  const [readerLecture, setReaderLecture] = useState<Lecture | null>(null);
  const [isMobileChatOpenApp, setIsMobileChatOpenApp] = useState(false);
  const { theme, setTheme, cycleTheme } = useTheme();

  const { permission, requestPermission, isRequesting } = usePushNotifications(user);
  // Native builds need the OS push channel; the web hook above is a no-op there.
  useNativePush(user);
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
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRtl]);

  // Auth Listener
  useEffect(() => {
    let userUnsubscribe: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (userUnsubscribe) {
        userUnsubscribe();
      }

      // If we are in the middle of Google login, the user instance is the generic Google one.
      // We ignore it and wait for the custom token login to trigger onAuthStateChanged again.
      if (sessionStorage.getItem('googleLoginInProgress') === 'true') {
        return;
      }

      if (firebaseUser) {
        const userEmail = firebaseUser.email || firebaseUser.uid;
        const tokenResult = await firebaseUser.getIdTokenResult();
        const adminEmails = ["almdrydyl335@gmail.com", "jempe.kn@gmail.com"];
        const isMasterAdmin = tokenResult.claims.role === 'master_admin' || adminEmails.includes(userEmail?.toLowerCase() || '');
        
        let studentData: any = null;

        if (adminEmails.includes(userEmail?.toLowerCase() || '') && tokenResult.claims.role !== 'master_admin') {
          try {
             const token = await firebaseUser.getIdToken();
             await fetch(apiUrl('/api/bootstrap-admin'), {
               method: 'POST',
               headers: { 'Authorization': `Bearer ${token}` }
             });
             // Force refresh so claims take effect
             await firebaseUser.getIdToken(true);
          } catch(e) {
             console.error('Failed to bootstrap admin access', e);
          }
        }

        if (!isMasterAdmin && userEmail) {
          try {
            const emailLower = userEmail.toLowerCase();
            
            // Check allowed_admins
            const adminDoc = await getDoc(doc(db, 'allowed_admins', emailLower));
            if (adminDoc.exists()) {
              const data = adminDoc.data();
              studentData = {
                name: 'Admin',
                email: emailLower,
                isActive: true,
                role: data.role || 'admin',
                managedStageId: data.managedStageId,
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
          } catch (error: any) {
            console.error("Error checking student whitelist:", error);
            if (sessionStorage.getItem('googleLoginInProgress') === 'true') {
               return; // Ignore error during rapid sign-out for Google auth bypass
            }
            await signOut(auth);
            setLoginError(isRtl ? 'حدث خطأ أثناء التحقق من الحساب.' : 'Error verifying account.');
            setUser(null);
            setIsAuthReady(true);
            return;
          }
        }

        // Listen to user document
        userUnsubscribe = onSnapshot(doc(db, 'users', firebaseUser.uid), async (userDoc) => {
          if (!userDoc.exists() && !firebaseUser.uid.includes('@')) {
            await signOut(auth);
            setLoginError(isRtl ? 'يرجى إعادة تسجيل الدخول' : 'Please sign in again');
            setUser(null);
            setIsAuthReady(true);
            return;
          }

          if (userDoc.exists()) {
            const whitelistRole = ['admin', 'moderator'].includes(studentData?.role) ? studentData.role : null;
            
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

              lastStreakDate: userDoc.data().lastStreakDate || undefined,
              examCode: studentData?.examCode || userDoc.data().examCode || undefined,
              group: userDoc.data().group || undefined,
              favorites: userDoc.data().favorites || [],
              studied: userDoc.data().studied || [],
              completedWeeklyTasks: userDoc.data().completedWeeklyTasks || [],
              notificationPreferences: userDoc.data().notificationPreferences || { lectures: true, announcements: true, chat: true, records: true, homeworks: true },
              memberSince: studentData?.createdAt || userDoc.data().createdAt,
              permissions: masterAdminPermissions || userDoc.data().permissions || studentData?.permissions,
              stageId: userDoc.data().stageId || studentData?.stageId || undefined,
              managedStageId: userDoc.data().managedStageId || studentData?.managedStageId || undefined,
              tahmeelSubjects: userDoc.data().tahmeelSubjects || undefined,
              hasCompletedProgression: userDoc.data().hasCompletedProgression === true,
              lastProgressionYear: userDoc.data().lastProgressionYear || undefined,
              progressionYear: userDoc.data().progressionYear || undefined,
              progressionState: userDoc.data().progressionState || undefined,
              graduated: userDoc.data().graduated === true,
              blockedUsers: userDoc.data().blockedUsers || [],
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
              stageId: studentData?.stageId || undefined,
              managedStageId: studentData?.managedStageId || undefined,
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
            stageId: studentData?.stageId || undefined,
            managedStageId: studentData?.managedStageId || undefined,
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
           const res = await fetch(apiUrl("/api/record-activity"), {
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

  useEffect(() => {
    if (!user) return;
    
    // Simplistic check for unread notifications (inbox)
    // We check homeworks and system notifications
    const checkInbox = async () => {
      try {
        const lastRead = parseInt(localStorage.getItem('lastReadInbox') || '0', 10);
        let latestTime = 0;

        // Check latest homework. Scoped to the reader's stage, or the badge
        // lights up for homework they will never see in the list.
        if (user.role !== 'admin' && user.role !== 'master_admin' && effectiveStageId) {
           const hwQuery = query(collection(db, 'homeworks'), where('stageId', '==', effectiveStageId), orderBy('createdAt', 'desc'), limit(1));
           const hwSnap = await getDocs(hwQuery);
           if (!hwSnap.empty) {
             const t = hwSnap.docs[0].data().createdAt?.toMillis?.() || 0;
             if (t > latestTime) latestTime = t;
           }
        }

        // Check latest system notif
        const sysQuery = query(collection(db, 'systemNotifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(1));
        const sysSnap = await getDocs(sysQuery);
        if (!sysSnap.empty) {
          const t = sysSnap.docs[0].data().createdAt?.toMillis?.() || 0;
          if (t > latestTime) latestTime = t;
        }

        // Check latest admin alert
        if (user.role === 'admin' || user.role === 'master_admin') {
          const adQuery = query(collection(db, 'adminAlerts'), orderBy('createdAt', 'desc'), limit(1));
          const adSnap = await getDocs(adQuery);
          if (!adSnap.empty) {
             const t = adSnap.docs[0].data().createdAt?.toMillis?.() || 0;
             if (t > latestTime) latestTime = t;
          }
        }

        // Chat mentions might be missed here for performance, but this covers major system/homework/alerts
        if (latestTime > lastRead) {
          setHasUnreadInbox(true);
        }
      } catch (e) {
        console.warn("Could not check inbox:", e);
      }
    };

    checkInbox();
    // Optional polling every 60 seconds
    const interval = setInterval(checkInbox, 60000);
    return () => clearInterval(interval);
  }, [user?.uid, user?.role, effectiveStageId]);

  // Announcements Listener for Notifications
  useEffect(() => {
    if (!user || (!user.group && user.role === 'student')) return;
    if (!effectiveStageId) return;

    const q = query(collection(db, 'announcements'), where('stageId', '==', effectiveStageId), orderBy('createdAt', 'desc'), limit(1));
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
      console.warn("Could not listen to announcements (may lack permissions):", error);
      handleFirestoreError(error, OperationType.LIST, 'announcements');
    });
    return () => unsubscribe();
  }, [currentTab, user?.uid, user?.group, user?.role, effectiveStageId]);

  useEffect(() => {
    if (currentTab === 'announcements') {
      setHasUnreadAnnouncements(false);
      localStorage.setItem('lastReadAnnouncement', Date.now().toString());
    }
  }, [currentTab]);

  // Hand the profile to StageContext so it can resolve effectiveStageId for
  // students and representatives, not just the master-admin stage picker.
  useEffect(() => {
    setActiveUser(user);
  }, [user, setActiveUser]);

  // Lectures Listener
  useEffect(() => {
    if (!user || (!user.group && user.role === 'student')) {
      setLectures([]);
      setIsLoading(false);
      return;
    }

    // No resolved stage means we cannot say which content this user is entitled
    // to. Showing every stage's lectures was the old fallback; it leaks the whole
    // university to anyone whose profile is mid-sync.
    if (!effectiveStageId) {
      setLectures([]);
      setIsLoading(false);
      return;
    }

    const q = query(collection(db, 'lectures'), where('stageId', '==', effectiveStageId), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } as Lecture))
        // The year-end wipe leaves each lecture behind as a stub with no PDF, so
        // that bank questions scoped to it still resolve. Filtered here rather
        // than in the query: a `where` would need an index and would also drop
        // every lecture predating the field.
        .filter(l => !(l as any).archived);
      setLectures(docs);
      setIsLoading(false);
    }, (error) => {
      console.warn("Could not listen to lectures (may lack permissions):", error);
      setIsLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'lectures');
    });

    return () => unsubscribe();
  }, [user?.group, user?.role, effectiveStageId]);

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
  const handleCloseUpload = useCallback(() => { setShowUpload(false); setLectureToEdit(null); }, []);

  const hasMCQAccess = (u: UserProfile | null) => {
    if (!u) return false;
    if (u.role === 'admin' || u.isMasterAdmin) return true;
    if (u.isSubscribed) {
      if (u.subscriptionEnd) {
        const end = u.subscriptionEnd.toDate ? u.subscriptionEnd.toDate() : new Date(u.subscriptionEnd);
        return end > new Date();
      }
      return true; // Active but no end date
    }
    return false;
  };

  const handleOpenReader = useCallback((l: Lecture) => setReaderLecture(l), []);

  const handleOpenMCQ = useCallback((l: Lecture) => {
    if (hasMCQAccess(user)) {
      setMcqLecture(l);
    } else {
      setShowPaywall(true);
    }
  }, [user]);

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

  if (progressionRound) {
    return (
      <ProgressionScreen
        user={user}
        lang={lang}
        round={progressionRound}
        onDone={() => setProgressionRound(null)}
      />
    );
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



  const isAnyOverlayOpen = showUpload || showAdminManage || showStudentManage || showAdminGrades || showAdminBank || showStudentGrades || showAntiCheat || showAdminLogs || showSubManage || showPaywall || (mcqLecture !== null) || (readerLecture !== null);

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
          toggleTheme={cycleTheme}
          onShowNotifications={() => {
            setShowNotificationsModal(true);
            setHasUnreadInbox(false);
            localStorage.setItem('lastReadInbox', Date.now().toString());
          }}
          hasUnreadNotifications={hasUnreadInbox}
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
              onClick={() => {
                requestPermission();
                handleDismissNotification();
              }}
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
          onOpenReader={handleOpenReader}
          setShowStudentManage={setShowStudentManage}
          setShowStreakManage={setShowStreakManage} 
          setShowAdminManage={setShowAdminManage} 
          initialTab={currentTab === 'home' ? 'lectures' : currentTab as any} 
        />
      )}
      {currentTab === 'announcements' && (
        <AnnouncementsScreen user={user} lang={lang} lectures={lectures} onNavigateToChat={handleNavigateToChat} onOpenMCQ={handleOpenMCQ} onOpenReader={handleOpenReader} />
      )}
      {currentTab === 'chat' && (
        <ChatScreen user={user} lang={lang} setCurrentTab={setCurrentTab} onMobileChatOpenChange={setIsMobileChatOpenApp} />
      )}
      {currentTab === 'subscription' && (
        <SubscriptionScreen user={user} lang={lang} />
      )}
      {currentTab === 'profile' && (
        <ProfileScreen 
          user={user} 
          lang={lang} 
          setLang={setLang} 
          setShowAdminManage={setShowAdminManage} 
          setShowStudentManage={setShowStudentManage} 
          setShowStreakManage={setShowStreakManage} 
          setShowCalendarSettings={setShowCalendarSettings} 
          setShowSettings={setShowSettings} 
          setShowAdminGrades={setShowAdminGrades} 
          setShowStudentGrades={setShowStudentGrades} 
          setShowAdminLogs={setShowAdminLogs}
          setShowSubManage={setShowSubManage}
          onNavigateToSubscription={() => setCurrentTab('subscription')}
        />
      )}

      <AdminUpload 
        isOpen={showUpload} 
        onClose={handleCloseUpload} 
        lang={lang} 
        lectureToEdit={lectureToEdit}
        user={user}
      />
      <AdminManagement isOpen={showAdminManage} onClose={() => setShowAdminManage(false)} lang={lang} user={user} />
      <StreakManagement isOpen={showStreakManage} onClose={() => setShowStreakManage(false)} lang={lang} user={user} />
      <AcademicCalendarModal isOpen={showCalendarSettings} onClose={() => setShowCalendarSettings(false)} lang={lang} user={user} />
      <SettingsScreen
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        user={user}
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
        notificationPermission={permission}
        onRequestNotifications={requestPermission}
        onLogout={() => { setShowSettings(false); signOut(auth); }}
        onOpen={(what) => {
          setShowSettings(false);
          if (what === 'adminManage') setShowAdminManage(true);
          else if (what === 'studentManage') setShowStudentManage(true);
          else if (what === 'streakManage') setShowStreakManage(true);
          else if (what === 'adminGrades') setShowAdminGrades(true);
          else if (what === 'studentGrades') setShowStudentGrades(true);
          else if (what === 'adminLogs') setShowAdminLogs(true);
          else if (what === 'subManage') setShowSubManage(true);
          else if (what === 'calendar') setShowCalendarSettings(true);
          else if (what === 'subscription') setCurrentTab('subscription');
        }}
      />
      <StudentManagement isOpen={showStudentManage} onClose={() => setShowStudentManage(false)} lang={lang} user={user} />
      <AdminGradesScreen isOpen={showAdminGrades} onClose={() => setShowAdminGrades(false)} user={user} />
      <AdminQuestionBankScreen isOpen={showAdminBank} onClose={() => setShowAdminBank(false)} lang={lang} />
      <AntiCheatDashboard isOpen={showAntiCheat} onClose={() => setShowAntiCheat(false)} lang={lang} />
      <AdminLogsScreen isOpen={showAdminLogs} onClose={() => setShowAdminLogs(false)} lang={lang} />
      <StudentGradesScreen isOpen={showStudentGrades} onClose={() => setShowStudentGrades(false)} />
      {showSubManage && <SubscriptionManagement user={user!} lang={lang} onClose={() => setShowSubManage(false)} />}
      
      {showPaywall && (
        <SubscriptionPaywall 
          lang={lang} 
          onClose={() => setShowPaywall(false)} 
          onSubscribe={() => {
            setShowPaywall(false);
            setCurrentTab('subscription');
          }} 
        />
      )}
      
      {showNotificationsModal && user && (
        <NotificationsModal
          user={user}
          lang={lang}
          onClose={() => setShowNotificationsModal(false)}
        />
      )}

      {mcqLecture && user && (
        <MCQOverlay 
          lecture={mcqLecture} 
          user={user} 
          lang={lang} 
          onClose={() => setMcqLecture(null)} 
        />
      )}

      {readerLecture?.pdfUrl && (
        <Suspense fallback={null}>
          <PdfReaderOverlay
            lectureId={readerLecture.id}
            lectureTitle={readerLecture.title}
            pdfUrl={readerLecture.pdfUrl}
            lang={lang}
            onClose={() => setReaderLecture(null)}
          />
        </Suspense>
      )}

      <GlobalAudioPlayer isRtl={isRtl} />
      <AnimatePresence>
        {(!isAnyOverlayOpen && !isMobileChatOpenApp) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="relative z-50"
          >
            <BottomNav currentTab={currentTab} setCurrentTab={setCurrentTab} lang={lang} hasUnreadAnnouncements={hasUnreadAnnouncements} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
