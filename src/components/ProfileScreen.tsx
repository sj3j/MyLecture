import React, { useState, useRef } from 'react';
import { auth, db, storage } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Language, TRANSLATIONS, UserProfile } from '../types';
import { IS_STORE_BUILD } from '../lib/platform';
import {
  Shield, Loader2, AlertCircle, Pencil, Camera, Check, X,
  Bell, Globe, Info, Flame, Crown, CreditCard, Palmtree,
} from 'lucide-react';
import ProfileStreakCalendar from './ProfileStreakCalendar';
import SemesterHistoryList from './SemesterHistoryList';
import { canManageAssistants, canManageStudents, canManageGrades, canManageStreakSystem, canViewAdminLogs } from '../lib/permissions';
import { useAcademicPhase } from '../hooks/useAcademicPhase';
import { useStageContext } from '../contexts/StageContext';
import { STAT_ICONS, ADMIN_ICONS } from '../lib/profileIcons';
import { StatCard, ProfileGroup, ProfileRow, ProfileToggle } from './profile/ProfilePrimitives';

/**
 * The profile screen, rebuilt on Varmacy's profile layout: a banner with the
 * avatar breaking its lower edge, an identity block, a grid of stat tiles, then
 * grouped rows instead of a stack of full-width coloured buttons.
 *
 * Every behaviour of the previous version is kept - photo/name/group editing,
 * the streak card and its calendar, season history, the subscription card, all
 * seven toggles, all eight permission-gated admin entries, language and logout.
 *
 * Not carried over: a `handleGoogleLogin` and its `isLoggingIn` flag, plus an
 * unused `showManageDownloads`. Nothing rendered them - this screen is only
 * reachable when a user is already signed in, and login lives in LoginScreen.
 */

interface ProfileScreenProps {
  user: UserProfile | null;
  lang: Language;
  setLang: (lang: Language) => void;
  setShowAdminManage?: (val: boolean) => void;
  setShowStudentManage?: (val: boolean) => void;
  setShowStreakManage?: (val: boolean) => void;
  setShowAdminGrades?: (val: boolean) => void;
  setShowStudentGrades?: (val: boolean) => void;
  setShowAdminLogs?: (val: boolean) => void;
  setShowSubManage?: (val: boolean) => void;
  setShowCalendarSettings?: (val: boolean) => void;
  setShowSettings?: (val: boolean) => void;
  onNavigateToSubscription?: () => void;
}

const GROUP_OPTIONS = [
  'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4',
];

export default function ProfileScreen({ user, lang, setLang, setShowAdminManage, setShowStudentManage,
  setShowStreakManage, setShowAdminGrades, setShowStudentGrades, setShowAdminLogs, setShowSubManage,
  setShowCalendarSettings, setShowSettings, onNavigateToSubscription }: ProfileScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const { phase } = useAcademicPhase();
  const { stages } = useStageContext();

  /** '2027-01-31' -> '2027/1/31'. */
  const formatCalendarDate = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
  };

  const [error, setError] = useState('');
  const [showStreakInfo, setShowStreakInfo] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editGroup, setEditGroup] = useState(user?.group || '');
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (user && !isEditing) {
      setEditName(user.name);
      setEditGroup(user.group || '');
      setEditPhotoPreview(user.photoUrl || null);
    }
  }, [user, isEditing]);

  if (!user) return null;

  const isMasterAdminUser = user.isMasterAdmin;
  const stageName = (() => {
    const stage = stages.find(s => s.id === user.stageId);
    if (!stage) return '—';
    return isRtl ? stage.nameAr : stage.nameEn;
  })();

  // While editing, the freshly picked file wins; otherwise the saved photo. Never
  // an empty string, which would render a broken image.
  const avatarSrc = (isEditing ? editPhotoPreview || user.photoUrl : user.photoUrl) || null;

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
                resolve(await getDownloadURL(uploadTask.snapshot.ref));
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

  const cancelEditing = () => {
    setIsEditing(false);
    setEditName(user.name);
    setEditPhotoPreview(user.photoUrl || null);
    setEditGroup(user.group || '');
    setEditPhotoFile(null);
    setError('');
  };

  const handleToggleNotification = async (type: 'lectures' | 'announcements' | 'chat' | 'records' | 'homeworks') => {
    const currentPrefs = user.notificationPreferences || { lectures: true, announcements: true, chat: true, records: true, homeworks: true };
    const newPrefs = { ...currentPrefs, [type]: currentPrefs[type] === undefined ? false : !currentPrefs[type] };
    try {
      await setDoc(doc(db, 'users', user.uid), { notificationPreferences: newPrefs }, { merge: true });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
    }
  };

  const setLeaderboardFlag = async (field: 'hideNameOnLeaderboard' | 'hidePhotoOnLeaderboard', value: boolean) => {
    try {
      await setDoc(doc(db, 'users', user.uid), { [field]: value }, { merge: true });
    } catch (error) {
      console.error('Error updating leaderboard preference:', error);
    }
  };

  const notifPrefs = user.notificationPreferences;
  const notificationRows: { key: 'lectures' | 'announcements' | 'chat' | 'records' | 'homeworks'; label: string }[] = [
    { key: 'lectures', label: isRtl ? 'المحاضرات الجديدة' : 'New lectures' },
    { key: 'announcements', label: isRtl ? 'التبليغات' : 'Announcements' },
    { key: 'chat', label: isRtl ? 'الشات' : 'Chat' },
    { key: 'records', label: isRtl ? 'التسجيلات' : 'Records' },
    { key: 'homeworks', label: isRtl ? 'الواجبات' : 'Homework' },
  ];

  return (
    <div className="max-w-2xl mx-auto pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ---- banner ----------------------------------------------------
          Two nested elements on purpose: the gradient needs `overflow-hidden`
          so its rounded corners clip the watermark, but the avatar hangs below
          the banner's lower edge and that same clip would cut it in half. So
          the avatar is a sibling of the clipped box, positioned against this
          outer wrapper. */}
      <div className="relative">
        <div className="h-40 sm:h-48 bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 sm:rounded-b-3xl overflow-hidden relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
            <Flame className="w-56 h-56 text-white" />
          </div>
        </div>

        <div className="absolute top-4 end-4 z-20 flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={cancelEditing}
                aria-label={isRtl ? 'إلغاء' : 'Cancel'}
                className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-full w-10 h-10 flex justify-center items-center shadow-sm text-slate-500 dark:text-slate-300 active:scale-95 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                aria-label={isRtl ? 'حفظ' : 'Save'}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 rounded-full w-10 h-10 flex justify-center items-center shadow-sm text-white active:scale-95 transition-all"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              aria-label={isRtl ? 'تعديل الملف' : 'Edit profile'}
              className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-full w-10 h-10 flex justify-center items-center shadow-sm hover:bg-white dark:hover:bg-zinc-900 active:scale-95 transition-all text-slate-500 dark:text-slate-300"
            >
              <Pencil className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* The avatar breaks the banner's lower edge. Centred rather than
            inline-start so it never collides with either corner button. */}
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-10">
          <div
            onClick={isEditing ? () => fileInputRef.current?.click() : undefined}
            className={`w-24 h-24 rounded-full bg-sky-100 dark:bg-sky-900/40 border-4 border-white dark:border-zinc-900 shadow-lg flex items-center justify-center text-sky-600 dark:text-sky-300 text-3xl font-black overflow-hidden relative ${
              isEditing ? 'cursor-pointer group' : ''
            }`}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
            {isEditing && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Camera className="w-7 h-7 text-white" />
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handlePhotoChange} accept="image/*" className="hidden" />
        </div>
      </div>

      <div className="px-4">
        {/* ---- identity ------------------------------------------------ */}
        <div className="pt-16 pb-6 border-b-2 border-slate-100 dark:border-zinc-800 mb-6 text-center">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium flex items-center gap-2 text-start">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full max-w-xs mx-auto px-3 py-2 mb-2 text-center bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none font-black text-xl text-slate-900 dark:text-stone-100"
              placeholder={isRtl ? 'الاسم' : 'Name'}
            />
          ) : (
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-stone-100 break-words mb-1">
              {user.name}
            </h1>
          )}

          {/* An email is a Latin run inside an RTL block, so it carries its own
              direction - without it bidi drags the "@" and the domain around. */}
          <div className="text-slate-500 dark:text-slate-400 text-sm font-bold break-all mb-3" style={{ direction: 'ltr' }}>
            {user.email}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {user.isMasterAdmin ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-white text-xs font-black shadow-sm">
                <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
                {isRtl ? 'المشرف العام' : 'MASTER ADMIN'}
              </span>
            ) : user.role === 'admin' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-xs font-black">
                <Shield className="w-3.5 h-3.5" strokeWidth={2.5} />
                {isRtl ? 'ممثل المرحلة' : 'REPRESENTATIVE'}
              </span>
            ) : user.role === 'moderator' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-xs font-black">
                <Shield className="w-3.5 h-3.5" strokeWidth={2.5} />
                {isRtl ? 'مساعد' : 'MODERATOR'}
              </span>
            ) : null}

            {user.isSubscribed && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-black">
                <Crown className="w-3.5 h-3.5" strokeWidth={2.5} />
                {isRtl ? 'مشترك' : 'SUBSCRIBED'}
              </span>
            )}
          </div>

          {user.memberSince && (
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-3">
              {isRtl ? 'عضو منذ' : 'Member since'}{' '}
              {new Date(user.memberSince.seconds ? user.memberSince.seconds * 1000 : user.memberSince)
                .toLocaleDateString(isRtl ? 'ar-IQ' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          )}
        </div>

        {/* ---- statistics ---------------------------------------------- */}
        <h2 className="text-xl font-black mb-3 text-slate-900 dark:text-stone-100">
          {isRtl ? 'الإحصائيات' : 'Statistics'}
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-8 items-stretch">
          <StatCard icon={STAT_ICONS.streak} label={isRtl ? 'الستريك الحالي' : 'Current streak'} value={user.streakCount || 0} />
          <StatCard
            icon={STAT_ICONS.longest}
            label={isRtl ? 'أطول ستريك' : 'Longest streak'}
            value={Math.max(user.longestStreak || 0, user.streakCount || 0)}
          />
          {/* "3/3" is a Latin run: it needs its own direction inside RTL. */}
          <StatCard
            icon={STAT_ICONS.shields}
            label={isRtl ? 'دروع التجميد' : 'Freeze shields'}
            value={<span style={{ direction: 'ltr' }} className="inline-block">{Math.min(user.freezeTokens ?? 1, 3)}/3</span>}
          />
          <StatCard
            icon={STAT_ICONS.examCode}
            label={isRtl ? 'الكود الامتحاني' : 'Exam code'}
            value={<span style={{ direction: 'ltr' }} className="inline-block">{user.examCode || '—'}</span>}
          />
          {isEditing ? (
            <div className="col-span-2 bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
              <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 mb-2">
                {isRtl ? 'الكروب' : 'Group'}
              </label>
              <select
                value={editGroup}
                onChange={(e) => setEditGroup(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none font-bold text-slate-900 dark:text-stone-100"
              >
                <option value="">{isRtl ? 'اختر الكروب' : 'Select group'}</option>
                {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          ) : (
            <StatCard icon={STAT_ICONS.group} label={isRtl ? 'الكروب' : 'Group'} value={user.group || '—'} />
          )}
          {/* Spans the row rather than leaving an orphan half-tile, which also
              gives the longest stage names the width they need. */}
          <StatCard
            className={isEditing ? 'col-span-2' : ''}
            icon={STAT_ICONS.stage}
            label={isRtl ? 'المرحلة' : 'Stage'}
            value={stageName}
            text
          />
        </div>

        {/* ---- streak --------------------------------------------------- */}
        <div className="bg-orange-50 dark:bg-orange-900/10 border-2 border-orange-100 dark:border-orange-800/30 rounded-2xl p-4 sm:p-5 mb-6 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-4 relative z-10 gap-2">
            <h3 className="text-base font-black text-orange-800 dark:text-orange-300 flex items-center gap-2 min-w-0">
              <Flame className="w-5 h-5 text-orange-500 shrink-0" />
              <span className="truncate">{isRtl ? 'حالة الستريك' : 'Streak status'}</span>
            </h3>
            <button
              onClick={() => setShowStreakInfo(true)}
              className="px-3 py-1.5 rounded-full text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-800/30 hover:bg-orange-200 dark:hover:bg-orange-800/50 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Info className="w-3.5 h-3.5" />
              {isRtl ? 'كيف يعمل؟' : 'How it works'}
            </button>
          </div>

          {/* A frozen streak looks like a bug unless the app says why. */}
          {phase.isPaused && (
            <div className="relative z-10 mb-4 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 px-4 py-3 rounded-2xl flex items-center gap-3 text-sm font-bold border border-sky-100 dark:border-sky-800">
              <Palmtree className="w-5 h-5 text-sky-500 shrink-0" />
              <span>
                {phase.nextStart
                  ? (isRtl
                      ? `الستريك متوقف خلال العطلة، ويستأنف في ${formatCalendarDate(phase.nextStart)}.`
                      : `Streaks are paused for the break and resume on ${formatCalendarDate(phase.nextStart)}.`)
                  : (isRtl ? 'الستريك متوقف خلال العطلة.' : 'Streaks are paused for the break.')}
              </span>
            </div>
          )}

          <div className="relative z-10 bg-white/60 dark:bg-zinc-900/60 rounded-2xl p-1 backdrop-blur-sm border border-orange-100/50 dark:border-orange-800/20">
            <ProfileStreakCalendar userUid={user.uid} isRtl={isRtl} />
          </div>

          <SemesterHistoryList userUid={user.uid} isRtl={isRtl} />
        </div>

        {/* ---- subscription --------------------------------------------- */}
        {(!isMasterAdminUser && user.role !== 'admin' && !IS_STORE_BUILD) && (
          <ProfileGroup title={isRtl ? 'الاشتراك' : 'Subscription'}>
            <ProfileRow
              isRtl={isRtl}
              icon={user.isSubscribed
                ? { Icon: Crown, className: 'text-emerald-600 dark:text-emerald-400', tile: 'bg-emerald-100 dark:bg-emerald-900/30' }
                : { Icon: CreditCard, className: 'text-slate-500 dark:text-slate-400', tile: 'bg-slate-100 dark:bg-zinc-800' }}
              label={user.isSubscribed
                ? (isRtl ? 'اشتراك فعال' : 'Active subscription')
                : (isRtl ? 'لا يوجد اشتراك فعال' : 'No active subscription')}
              sublabel={user.isSubscribed && user.subscriptionEnd
                ? `${isRtl ? 'ينتهي في' : 'Expires'} ${new Date(
                    user.subscriptionEnd.toDate ? user.subscriptionEnd.toDate() : user.subscriptionEnd
                  ).toLocaleDateString(isRtl ? 'ar-IQ' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                : undefined}
              onClick={onNavigateToSubscription}
            />
          </ProfileGroup>
        )}

        {/* ---- notifications -------------------------------------------- */}
        <ProfileGroup title={isRtl ? 'الإشعارات' : 'Notifications'}>
          {notificationRows.map(row => (
            <ProfileRow
              key={row.key}
              isRtl={isRtl}
              icon={{ Icon: Bell, className: 'text-sky-600 dark:text-sky-400', tile: 'bg-sky-100 dark:bg-sky-900/30' }}
              label={row.label}
              trailing={
                <ProfileToggle
                  isRtl={isRtl}
                  label={row.label}
                  on={notifPrefs?.[row.key] !== false}
                  onChange={() => handleToggleNotification(row.key)}
                />
              }
            />
          ))}
        </ProfileGroup>

        {/* ---- leaderboard privacy --------------------------------------- */}
        <ProfileGroup title={isRtl ? 'الخصوصية في لوحة الصدارة' : 'Leaderboard privacy'}>
          <ProfileRow
            isRtl={isRtl}
            icon={{ Icon: Shield, className: 'text-violet-600 dark:text-violet-400', tile: 'bg-violet-100 dark:bg-violet-900/30' }}
            label={isRtl ? 'إخفاء اسمي' : 'Hide my name'}
            trailing={
              <ProfileToggle
                isRtl={isRtl}
                label={isRtl ? 'إخفاء اسمي' : 'Hide my name'}
                on={!!user.hideNameOnLeaderboard}
                onChange={() => setLeaderboardFlag('hideNameOnLeaderboard', !user.hideNameOnLeaderboard)}
              />
            }
          />
          <ProfileRow
            isRtl={isRtl}
            icon={{ Icon: Camera, className: 'text-violet-600 dark:text-violet-400', tile: 'bg-violet-100 dark:bg-violet-900/30' }}
            label={isRtl ? 'إخفاء صورتي' : 'Hide my photo'}
            trailing={
              <ProfileToggle
                isRtl={isRtl}
                label={isRtl ? 'إخفاء صورتي' : 'Hide my photo'}
                on={!!user.hidePhotoOnLeaderboard}
                onChange={() => setLeaderboardFlag('hidePhotoOnLeaderboard', !user.hidePhotoOnLeaderboard)}
              />
            }
          />
        </ProfileGroup>

        {/* ---- administration -------------------------------------------
            These were eight full-width coloured buttons stacked down the page.
            Same entries, same permission gates, one card. */}
        {(canManageAssistants(user) || canManageStudents(user) || canManageStreakSystem(user)
          || canManageGrades(user)) && (
          <ProfileGroup title={isRtl ? 'الإدارة' : 'Administration'}>
            {canManageAssistants(user) && setShowAdminManage && (
              <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.assistants} label={t.manageAdmins}
                onClick={() => setShowAdminManage(true)} />
            )}
            {canManageAssistants(user) && canViewAdminLogs(user) && setShowAdminLogs && (
              <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.logs}
                label={isRtl ? 'سجل الإدارة' : 'Admin logs'}
                sublabel={isRtl ? 'المشرف العام فقط' : 'Master admin only'}
                onClick={() => setShowAdminLogs(true)} />
            )}
            {canManageAssistants(user) && isMasterAdminUser && setShowSubManage && (
              <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.subscriptions}
                label={isRtl ? 'إدارة الاشتراكات' : 'Manage subscriptions'}
                onClick={() => setShowSubManage(true)} />
            )}
            {canManageStudents(user) && setShowStudentManage && (
              <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.students}
                label={isRtl ? 'إدارة الطلاب' : 'Manage students'}
                onClick={() => setShowStudentManage(true)} />
            )}
            {canManageStreakSystem(user) && setShowCalendarSettings && (
              <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.calendar}
                label={isRtl ? 'التقويم الدراسي' : 'Academic calendar'}
                onClick={() => setShowCalendarSettings(true)} />
            )}
            {canManageStreakSystem(user) && setShowStreakManage && (
              <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.streak}
                label={isRtl ? 'إدارة الستريك' : 'Streak management'}
                onClick={() => setShowStreakManage(true)} />
            )}
            {canManageGrades(user) && setShowAdminGrades && (
              <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.grades}
                label={isRtl ? 'إدارة السعيّات والدرجات' : 'Manage grades'}
                onClick={() => setShowAdminGrades(true)} />
            )}
          </ProfileGroup>
        )}

        {/* Every student has official grades, so this is deliberately NOT in the
            Administration card - it was ungated in the previous version too. */}
        {setShowStudentGrades && (
          <ProfileGroup title={isRtl ? 'الدراسة' : 'Academic'}>
            <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.myGrades}
              label={isRtl ? 'السعيّات والدرجات المعتمدة' : 'Official grades'}
              onClick={() => setShowStudentGrades(true)} />
          </ProfileGroup>
        )}

        {/* ---- account --------------------------------------------------- */}
        <ProfileGroup title={isRtl ? 'الحساب' : 'Account'}>
          {setShowSettings && (
            <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.settings}
              label={isRtl ? 'الإعدادات' : 'Settings'}
              onClick={() => setShowSettings(true)} />
          )}
          <ProfileRow
            isRtl={isRtl}
            icon={{ Icon: Globe, className: 'text-slate-600 dark:text-slate-300', tile: 'bg-slate-100 dark:bg-zinc-800' }}
            label={isRtl ? 'اللغة' : 'Language'}
            trailing={
              <div className="flex bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl">
                <button
                  onClick={() => setLang('ar')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'ar' ? 'bg-white dark:bg-zinc-800 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  العربية
                </button>
                <button
                  onClick={() => setLang('en')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${lang === 'en' ? 'bg-white dark:bg-zinc-800 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  English
                </button>
              </div>
            }
          />
          <ProfileRow isRtl={isRtl} icon={ADMIN_ICONS.logout} destructive
            label={isRtl ? 'تسجيل الخروج' : 'Log out'}
            onClick={handleLogout} />
        </ProfileGroup>
      </div>

      {showStreakInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm" dir={isRtl ? 'rtl' : 'ltr'}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-md overflow-y-auto max-h-[90vh] shadow-2xl relative p-6">
            <button onClick={() => setShowStreakInfo(false)} className="absolute top-4 end-4 p-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full transition-colors z-10">
              <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-100 dark:bg-orange-900/30 rounded-3xl flex items-center justify-center mx-auto mb-4 transform -rotate-6">
                <Flame className="w-8 h-8 sm:w-10 sm:h-10 text-orange-500" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white capitalize">
                {isRtl ? 'كيف يعمل الستريك؟' : 'How the streak works'}
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-xl shrink-0"><Check className="w-5 h-5 text-emerald-500" /></div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{isRtl ? 'تتبع نشاطك' : 'Track your activity'}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{isRtl ? 'كل يوم تفتح فيه التطبيق، يزداد الستريك الخاص بك. يرجى العلم أنّ اليوم يُحسب حسب توقيت العراق.' : 'Every day you open the app, your streak increases by one day. Note that the day restarts according to Iraq timezone.'}</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-xl shrink-0"><Shield className="w-5 h-5 text-blue-500" /></div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{isRtl ? 'دروع التجميد (الحد: 3)' : 'Freeze Shields (Max: 3)'}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{isRtl ? 'يتم منح درع التجميد بشكل تلقائي وفقاً لنشاطك المستمر وتفاعلك. بإمكانك امتلاك 3 دروع بحد أقصى للتعويض عن الأيام التي قد تفوتك.' : 'Freeze shields are granted automatically based on your continuous activity and engagement. You can hold up to 3 shields to cover any missed days.'}</p>
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
