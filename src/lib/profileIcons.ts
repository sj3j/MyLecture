/**
 * Icon registry for the profile screen.
 *
 * Ported from Varmacy's src/lib/profileIcons.ts, with one difference that
 * matters: Varmacy is light-only and remaps its greys through a theme class,
 * while this app has real dark mode and uses explicit `dark:` variants
 * everywhere. So every tile here carries both halves.
 *
 * Plain data, no JSX, so the stat tiles, the admin rows and anything else can
 * share one definition - a metric must not show one picture in one place and a
 * different one somewhere else.
 */
import {
  Award,
  BarChart3,
  CalendarDays,
  Crown,
  FileText,
  Flame,
  GraduationCap,
  HardDrive,
  Hash,
  LogOut,
  Settings,
  Shield,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface ProfileIcon {
  Icon: LucideIcon;
  /** Foreground colour. Split from the tile so a muted state can drop the tint
   *  and keep the shape. */
  className: string;
  tile: string;
}

/**
 * Colour classes are written out in full rather than built from a hue variable,
 * because Tailwind scans source text for complete class names. A template-built
 * `bg-${hue}-100` never reaches the stylesheet and the tile renders transparent.
 */
export const STAT_ICONS = {
  streak: { Icon: Flame, className: 'text-orange-600 dark:text-orange-400', tile: 'bg-orange-100 dark:bg-orange-900/30' },
  longest: { Icon: Award, className: 'text-amber-600 dark:text-amber-400', tile: 'bg-amber-100 dark:bg-amber-900/30' },
  shields: { Icon: Shield, className: 'text-sky-600 dark:text-sky-400', tile: 'bg-sky-100 dark:bg-sky-900/30' },
  rank: { Icon: Trophy, className: 'text-amber-600 dark:text-amber-400', tile: 'bg-amber-100 dark:bg-amber-900/30' },
  degree: { Icon: BarChart3, className: 'text-rose-600 dark:text-rose-400', tile: 'bg-rose-100 dark:bg-rose-900/30' },
  examCode: { Icon: Hash, className: 'text-indigo-600 dark:text-indigo-400', tile: 'bg-indigo-100 dark:bg-indigo-900/30' },
  group: { Icon: Users, className: 'text-emerald-600 dark:text-emerald-400', tile: 'bg-emerald-100 dark:bg-emerald-900/30' },
  stage: { Icon: GraduationCap, className: 'text-violet-600 dark:text-violet-400', tile: 'bg-violet-100 dark:bg-violet-900/30' },
} satisfies Record<string, ProfileIcon>;

export const ADMIN_ICONS = {
  assistants: { Icon: Shield, className: 'text-indigo-600 dark:text-indigo-400', tile: 'bg-indigo-100 dark:bg-indigo-900/30' },
  logs: { Icon: FileText, className: 'text-slate-600 dark:text-slate-300', tile: 'bg-slate-100 dark:bg-zinc-800' },
  subscriptions: { Icon: Crown, className: 'text-amber-600 dark:text-amber-400', tile: 'bg-amber-100 dark:bg-amber-900/30' },
  students: { Icon: Users, className: 'text-emerald-600 dark:text-emerald-400', tile: 'bg-emerald-100 dark:bg-emerald-900/30' },
  calendar: { Icon: CalendarDays, className: 'text-sky-600 dark:text-sky-400', tile: 'bg-sky-100 dark:bg-sky-900/30' },
  streak: { Icon: Flame, className: 'text-orange-600 dark:text-orange-400', tile: 'bg-orange-100 dark:bg-orange-900/30' },
  grades: { Icon: HardDrive, className: 'text-fuchsia-600 dark:text-fuchsia-400', tile: 'bg-fuchsia-100 dark:bg-fuchsia-900/30' },
  myGrades: { Icon: Award, className: 'text-amber-600 dark:text-amber-400', tile: 'bg-amber-100 dark:bg-amber-900/30' },
  settings: { Icon: Settings, className: 'text-slate-600 dark:text-slate-300', tile: 'bg-slate-100 dark:bg-zinc-800' },
  logout: { Icon: LogOut, className: 'text-rose-600 dark:text-rose-400', tile: 'bg-rose-100 dark:bg-rose-900/30' },
} satisfies Record<string, ProfileIcon>;

/** A shape rather than a blank tile when an id has no registry entry. */
export const FALLBACK_PROFILE_ICON: ProfileIcon = {
  Icon: Award,
  className: 'text-slate-500 dark:text-slate-400',
  tile: 'bg-slate-100 dark:bg-zinc-800',
};
