import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Language, UserProfile } from '../../types';
import { SETTINGS_ICONS } from '../../lib/settingsIcons';
import SettingsGroup from './SettingsGroup';
import SettingsRow from './SettingsRow';
import SettingsToggle from './SettingsToggle';
import AppearanceSettings from './AppearanceSettings';
import BlockedUsersSettings from './BlockedUsersSettings';
import { ThemeChoice } from '../../hooks/useTheme';
import { useBackDismiss } from '../../hooks/useBackDismiss';
import {
  canManageAssistants, canManageStudents, canManageGrades,
  canManageStreakSystem, canViewAdminLogs, isMasterAdmin,
} from '../../lib/permissions';

type Page = 'root' | 'appearance' | 'blocked';

export interface SettingsScreenProps {
  /** Returns to the profile. This is a real page now, not an overlay. */
  onBack: () => void;
  user: UserProfile | null;
  lang: Language;
  setLang: (l: Language) => void;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  notificationPermission?: NotificationPermission | string;
  onRequestNotifications?: () => void;
  onOpen: (what:
    | 'adminManage' | 'studentManage' | 'streakManage' | 'adminGrades'
    | 'studentGrades' | 'adminLogs' | 'subManage' | 'calendar' | 'subscription') => void;
  onLogout: () => void;
}

type NotificationKey = 'lectures' | 'announcements' | 'chat' | 'records' | 'homeworks';

/**
 * The settings surface, organised into pages rather than one flat column of
 * buttons - the shape Varmacy uses: grouped cards of icon rows, each pushing a
 * sub-page rather than opening a modal.
 *
 * This is a real page (a `currentTab` value), not a `fixed inset-0` overlay. It
 * used to be the latter, which meant the profile stayed mounted and rendering
 * underneath it and the nav bars sat behind an opaque sheet - it looked like a
 * page without behaving as one.
 */
export default function SettingsScreen(props: SettingsScreenProps) {
  const {
    onBack, user, lang, setLang, theme, setTheme,
    notificationPermission, onRequestNotifications, onOpen, onLogout,
  } = props;
  const isRtl = lang === 'ar';
  const [page, setPage] = useState<Page>('root');

  const Back = isRtl ? ChevronRight : ChevronLeft;
  const goBack = () => (page === 'root' ? onBack() : setPage('root'));

  // Android hardware back steps sub-page -> root -> profile. Without this it
  // minimises the app, which is what the settings overlay used to do.
  useBackDismiss(true, goBack, 'settings');

  const TITLES: Record<Page, { ar: string; en: string }> = {
    root:       { ar: 'الإعدادات',            en: 'Settings' },
    appearance: { ar: 'المظهر',               en: 'Appearance' },
    blocked:    { ar: 'المستخدمون المحظورون', en: 'Blocked users' },
  };

  const notifLabel = notificationPermission === 'granted'
    ? (isRtl ? 'مفعّلة' : 'Enabled')
    : notificationPermission === 'denied'
      ? (isRtl ? 'مرفوضة من إعدادات الهاتف' : 'Blocked in phone settings')
      : (isRtl ? 'اضغط للتفعيل' : 'Tap to enable');

  // Both writers moved here verbatim from ProfileScreen, where these toggles
  // used to live.
  const notifPrefs = user?.notificationPreferences;

  const toggleNotification = async (type: NotificationKey) => {
    if (!user) return;
    const current = notifPrefs || { lectures: true, announcements: true, chat: true, records: true, homeworks: true };
    const next = { ...current, [type]: current[type] === undefined ? false : !current[type] };
    try {
      await setDoc(doc(db, 'users', user.uid), { notificationPreferences: next }, { merge: true });
    } catch (error) {
      console.error('Error updating notification preferences:', error);
    }
  };

  const setLeaderboardFlag = async (field: 'hideNameOnLeaderboard' | 'hidePhotoOnLeaderboard', value: boolean) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { [field]: value }, { merge: true });
    } catch (error) {
      console.error('Error updating leaderboard preference:', error);
    }
  };

  const NOTIFICATION_ROWS: { key: NotificationKey; ar: string; en: string }[] = [
    { key: 'lectures',      ar: 'المحاضرات الجديدة', en: 'New lectures' },
    { key: 'announcements', ar: 'التبليغات',         en: 'Announcements' },
    { key: 'chat',          ar: 'الشات',             en: 'Chat' },
    { key: 'records',       ar: 'التسجيلات',         en: 'Records' },
    { key: 'homeworks',     ar: 'الواجبات',          en: 'Homework' },
  ];

  return (
    <div className="max-w-2xl w-full mx-auto px-4 pt-4 pb-28" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={goBack}
          aria-label={isRtl ? 'رجوع' : 'Back'}
          className="p-2 -m-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Back className="w-5 h-5 text-slate-600 dark:text-slate-300" strokeWidth={2.5} />
        </button>
        <h1 className="flex-1 text-lg font-black text-slate-900 dark:text-white truncate">
          {isRtl ? TITLES[page].ar : TITLES[page].en}
        </h1>
      </div>

      <div className="space-y-6">
        {page === 'appearance' && (
          <AppearanceSettings lang={lang} theme={theme} setTheme={setTheme} />
        )}

        {page === 'blocked' && (
          <BlockedUsersSettings user={user} lang={lang} />
        )}

        {page === 'root' && (
          <>
            <SettingsGroup title={isRtl ? 'التطبيق' : 'App'}>
              <SettingsRow
                isRtl={isRtl} icon={SETTINGS_ICONS.appearance}
                label={isRtl ? 'المظهر' : 'Appearance'}
                sublabel={
                  theme === 'system' ? (isRtl ? 'حسب النظام' : 'Match system')
                  : theme === 'light' ? (isRtl ? 'فاتح' : 'Light')
                  : theme === 'dark' ? (isRtl ? 'داكن' : 'Dark')
                  : (isRtl ? 'أسود كامل' : 'True black')
                }
                onClick={() => setPage('appearance')}
              />
              <SettingsRow
                isRtl={isRtl} icon={SETTINGS_ICONS.language}
                label={isRtl ? 'اللغة' : 'Language'}
                sublabel={lang === 'ar' ? 'العربية' : 'English'}
                onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              />
              <SettingsRow
                isRtl={isRtl} icon={SETTINGS_ICONS.notifications}
                label={isRtl ? 'إذن الإشعارات' : 'Notification permission'}
                sublabel={notifLabel}
                onClick={notificationPermission === 'granted' ? undefined : onRequestNotifications}
              />
            </SettingsGroup>

            {/* Which notifications to receive. The row above is the OS-level
                permission; these are the per-type preferences. */}
            {user && (
              <SettingsGroup title={isRtl ? 'الإشعارات' : 'Notifications'}>
                {NOTIFICATION_ROWS.map(row => (
                  <SettingsRow
                    key={row.key}
                    isRtl={isRtl} icon={SETTINGS_ICONS.notifications}
                    label={isRtl ? row.ar : row.en}
                    trailing={
                      <SettingsToggle
                        isRtl={isRtl}
                        label={isRtl ? row.ar : row.en}
                        checked={notifPrefs?.[row.key] !== false}
                        onChange={() => toggleNotification(row.key)}
                      />
                    }
                  />
                ))}
              </SettingsGroup>
            )}

            <SettingsGroup title={isRtl ? 'الخصوصية' : 'Privacy'}>
              {user && (
                <>
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.privacy}
                    label={isRtl ? 'إخفاء اسمي من لوحة الصدارة' : 'Hide my name from the leaderboard'}
                    trailing={
                      <SettingsToggle
                        isRtl={isRtl}
                        label={isRtl ? 'إخفاء اسمي' : 'Hide my name'}
                        checked={!!user.hideNameOnLeaderboard}
                        onChange={() => setLeaderboardFlag('hideNameOnLeaderboard', !user.hideNameOnLeaderboard)}
                      />
                    }
                  />
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.privacy}
                    label={isRtl ? 'إخفاء صورتي من لوحة الصدارة' : 'Hide my photo from the leaderboard'}
                    trailing={
                      <SettingsToggle
                        isRtl={isRtl}
                        label={isRtl ? 'إخفاء صورتي' : 'Hide my photo'}
                        checked={!!user.hidePhotoOnLeaderboard}
                        onChange={() => setLeaderboardFlag('hidePhotoOnLeaderboard', !user.hidePhotoOnLeaderboard)}
                      />
                    }
                  />
                </>
              )}
              <SettingsRow
                isRtl={isRtl} icon={SETTINGS_ICONS.blocked}
                label={isRtl ? 'المستخدمون المحظورون' : 'Blocked users'}
                sublabel={`${(user?.blockedUsers || []).length}`}
                onClick={() => setPage('blocked')}
              />
            </SettingsGroup>

            <SettingsGroup title={isRtl ? 'الدراسة' : 'Study'}>
              <SettingsRow
                isRtl={isRtl} icon={SETTINGS_ICONS.grades}
                label={isRtl ? 'السعيّات والدرجات' : 'Grades'}
                onClick={() => onOpen('studentGrades')}
              />
              <SettingsRow
                isRtl={isRtl} icon={SETTINGS_ICONS.subscription}
                label={isRtl ? 'الاشتراك' : 'Subscription'}
                onClick={() => onOpen('subscription')}
              />
            </SettingsGroup>

            {(canManageAssistants(user) || canManageStudents(user) || canManageGrades(user)
              || canManageStreakSystem(user) || canViewAdminLogs(user)) && (
              <SettingsGroup title={isRtl ? 'الإدارة' : 'Administration'}>
                {canManageStreakSystem(user) && (
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.calendar}
                    label={isRtl ? 'التقويم الدراسي' : 'Academic calendar'}
                    sublabel={isRtl ? 'المواسم والنتائج والترقية' : 'Seasons, results and progression'}
                    onClick={() => onOpen('calendar')}
                  />
                )}
                {canManageStudents(user) && (
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.students}
                    label={isRtl ? 'إدارة الطلاب' : 'Manage students'}
                    onClick={() => onOpen('studentManage')}
                  />
                )}
                {canManageAssistants(user) && (
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.assistants}
                    label={isRtl ? 'إدارة المساعدين' : 'Manage assistants'}
                    onClick={() => onOpen('adminManage')}
                  />
                )}
                {canManageStreakSystem(user) && (
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.streakAdmin}
                    label={isRtl ? 'إدارة الستريك' : 'Streak management'}
                    onClick={() => onOpen('streakManage')}
                  />
                )}
                {canManageGrades(user) && (
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.gradesAdmin}
                    label={isRtl ? 'إدارة السعيّات' : 'Manage grades'}
                    onClick={() => onOpen('adminGrades')}
                  />
                )}
                {isMasterAdmin(user) && (
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.subsAdmin}
                    label={isRtl ? 'إدارة الاشتراكات' : 'Manage subscriptions'}
                    onClick={() => onOpen('subManage')}
                  />
                )}
                {canViewAdminLogs(user) && (
                  <SettingsRow
                    isRtl={isRtl} icon={SETTINGS_ICONS.logs}
                    label={isRtl ? 'سجل الإدارة' : 'Admin log'}
                    onClick={() => onOpen('adminLogs')}
                  />
                )}
              </SettingsGroup>
            )}

            <SettingsGroup>
              <SettingsRow
                isRtl={isRtl} icon={SETTINGS_ICONS.logout}
                label={isRtl ? 'تسجيل الخروج' : 'Log out'}
                destructive
                onClick={onLogout}
              />
            </SettingsGroup>

            {/* Quiet attribution, in the place a version string usually sits. */}
            <div className="pt-2 pb-6 text-center">
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-600 tracking-wide">
                Powered by <span className="text-sky-500 dark:text-sky-400">Varmacy</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
