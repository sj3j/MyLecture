import { UserProfile } from '../types';

/**
 * Single source of truth for "who may do what".
 *
 * Replaces the inline `user?.role === 'admin' && user?.permissions?.x !== false`
 * pattern that was duplicated across a dozen components and drifted between them.
 *
 * Roles:
 *   master admin -> everything, on any stage (picks stage in Settings ->
 *                   Administration -> Viewing stage).
 *   admin        -> the stage representative. Everything for their own stage.
 *   moderator    -> an assistant appointed by a representative. Content only,
 *                   and only what the representative ticked.
 */

/** Permissions a moderator can be granted. Deliberately excludes anything that
 *  needs the `students` collection - see ADMIN_ONLY_CAPABILITIES. */
export const MODERATOR_CAPABILITIES = [
  'manageLectures',
  'manageAnnouncements',
  'manageRecords',
  'manageChat',
  'manageHomeworks',
] as const;

/** Never available to a moderator: both read the `students` whitelist, which
 *  holds emails, exam codes and password hashes. */
export const ADMIN_ONLY_CAPABILITIES = ['manageStudents', 'manageGrades'] as const;

export type Capability =
  | typeof MODERATOR_CAPABILITIES[number]
  | typeof ADMIN_ONLY_CAPABILITIES[number];

export const isMasterAdmin = (user?: UserProfile | null): boolean =>
  !!user?.isMasterAdmin;

/** A stage representative. */
export const isRepresentative = (user?: UserProfile | null): boolean =>
  user?.role === 'admin';

export const isModerator = (user?: UserProfile | null): boolean =>
  user?.role === 'moderator';

/** Anyone with a back-office role. Use for "show the admin surface at all". */
export const isStaff = (user?: UserProfile | null): boolean =>
  isRepresentative(user) || isModerator(user);

/**
 * Can this user perform `capability`?
 *
 * Master admin bypasses everything. A representative holds every capability
 * unless explicitly revoked (legacy docs have no permissions map, so absent
 * means allowed). A moderator must be explicitly granted, and can never hold
 * an admin-only capability regardless of what is stored on their doc.
 */
export function canManage(user: UserProfile | null | undefined, capability: Capability): boolean {
  if (!user) return false;
  if (isMasterAdmin(user)) return true;

  if (isRepresentative(user)) {
    return user.permissions?.[capability] !== false;
  }

  if (isModerator(user)) {
    if ((ADMIN_ONLY_CAPABILITIES as readonly string[]).includes(capability)) return false;
    return user.permissions?.[capability] === true;
  }

  return false;
}

/** إدارة الطلاب and السعيّات والدرجات - representatives and master admin only. */
export const canManageStudents = (user?: UserProfile | null): boolean =>
  canManage(user, 'manageStudents');

export const canManageGrades = (user?: UserProfile | null): boolean =>
  canManage(user, 'manageGrades');

/** Group/subgroup structure for a stage. */
export const canManageGroups = (user?: UserProfile | null): boolean =>
  isMasterAdmin(user) || isRepresentative(user);

/** إدارة المساعدين. Master admin manages everyone; a representative may only
 *  appoint moderators inside their own stage. */
export const canManageAssistants = (user?: UserProfile | null): boolean =>
  isMasterAdmin(user) || isRepresentative(user);

/** Master-admin-exclusive surfaces: streak system, MCQ bank, anti-cheat, admin log. */
export const canManageStreakSystem = isMasterAdmin;
export const canManageMcqSystem = isMasterAdmin;
export const canViewAdminLogs = isMasterAdmin;
