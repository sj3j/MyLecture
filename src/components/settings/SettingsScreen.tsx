import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Language, UserProfile } from '../../types';
import { SETTINGS_ICONS } from '../../lib/settingsIcons';
import SettingsGroup from './SettingsGroup';
import SettingsRow from './SettingsRow';
import AppearanceSettings from './AppearanceSettings';
import BlockedUsersSettings from './BlockedUsersSettings';
import { ThemeChoice } from '../../hooks/useTheme';
import {
  canManageAssistants, canManageStudents, canManageGrades,
  canManageStreakSystem, canViewAdminLogs, isMasterAdmin,
} from '../../lib/permissions';

type Page = 'root' | 'appearance' | 'blocked';

export interface SettingsScreenProps {
  isOpen: boolean;
  onClose: () => void;
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

/**
 * The settings surface, organised into pages rather than one flat column of
 * buttons - the shape Varmacy uses: grouped cards of icon rows, each pushing a
 * sub-page rather than opening a modal.
 */
export default function SettingsScreen(props: SettingsScreenProps) {
  const {
    isOpen, onClose, user, lang, setLang, theme, setTheme,
    notificationPermission, onRequestNotifications, onOpen, onLogout,
  } = props;
  const isRtl = lang === 'ar';
  const [page, setPage] = useState<Page>('root');

  const close = () => { setPage('root'); onClose(); };
  const Back = isRtl ? ChevronRight : ChevronLeft;

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] bg-slate-50 dark:bg-zinc-950 flex flex-col"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* header */}
          <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-4 py-4 flex items-center gap-3">
            {page !== 'root' ? (
              <button onClick={() => setPage('root')} className="p-2 -m-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800">
                <Back className="w-5 h-5 text-slate-600 dark:text-slate-300" strokeWidth={2.5} />
              </button>
            ) : null}
            <h1 className="flex-1 text-lg font-black text-slate-900 dark:text-white truncate">
              {isRtl ? TITLES[page].ar : TITLES[page].en}
            </h1>
            <button onClick={close} className="p-2 -m-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800">
              <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pb-10 space-y-6 max-w-2xl w-full mx-auto">
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
                    label={isRtl ? 'الإشعارات' : 'Notifications'}
                    sublabel={notifLabel}
                    onClick={notificationPermission === 'granted' ? undefined : onRequestNotifications}
                  />
                </SettingsGroup>

                <SettingsGroup title={isRtl ? 'الخصوصية' : 'Privacy'}>
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
