import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Shield, Loader2, AlertCircle } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, serverTimestamp, setDoc, deleteField } from 'firebase/firestore';
import { Language, TRANSLATIONS, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { logAdminAction } from '../services/adminLogService';
import { useStageContext } from '../contexts/StageContext';
import StudentPicker, { StudentCandidate } from './StudentPicker';
import { MODERATOR_CAPABILITIES, isMasterAdmin as isMaster } from '../lib/permissions';

interface AdminManagementProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  user: UserProfile | null;
}

type AssistantRole = 'admin' | 'moderator';

interface AdminRole {
  id: string;
  email: string;
  role?: AssistantRole;
  managedStageId?: string;
  permissions?: {
    manageLectures?: boolean;
    manageAnnouncements?: boolean;
    manageRecords?: boolean;
    manageChat?: boolean;
    manageHomeworks?: boolean;
    manageStudents?: boolean;
    manageGrades?: boolean;
  };
}

const PERMISSION_LABELS = [
  { id: 'manageLectures', labelEn: 'Manage Lectures', labelAr: 'إدارة المحاضرات' },
  { id: 'manageAnnouncements', labelEn: 'Manage Announcements', labelAr: 'إدارة التبليغات' },
  { id: 'manageRecords', labelEn: 'Manage Records', labelAr: 'إدارة التسجيلات' },
  { id: 'manageChat', labelEn: 'Manage Chat', labelAr: 'إدارة الشات' },
  { id: 'manageHomeworks', labelEn: 'Manage Homeworks', labelAr: 'إدارة الواجبات' },
  { id: 'manageStudents', labelEn: 'Manage Students', labelAr: 'إدارة الطلاب' },
  { id: 'manageGrades', labelEn: 'Manage Grades', labelAr: 'إدارة السعي والدرجات' },
];

/** Moderators are never offered manageStudents or manageGrades - both read the
 *  `students` collection, which they have no access to. */
const permissionsForRole = (role: AssistantRole) =>
  role === 'moderator'
    ? PERMISSION_LABELS.filter(p => (MODERATOR_CAPABILITIES as readonly string[]).includes(p.id))
    : PERMISSION_LABELS;

/** Strips admin-only grants so a moderator can never be persisted holding them. */
const sanitizePermissions = (role: AssistantRole, perms: Record<string, boolean>) =>
  role === 'moderator'
    ? { ...perms, manageStudents: false, manageGrades: false }
    : perms;

export default function AdminManagement({ isOpen, onClose, lang, user }: AdminManagementProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const { stages, effectiveStageId } = useStageContext();

  // A master admin manages every assistant on every stage. A representative may
  // only appoint moderators, and only inside the stage they manage.
  const viewerIsMaster = isMaster(user);
  const [newRole, setNewRole] = useState<AssistantRole>(viewerIsMaster ? 'admin' : 'moderator');
  const [newStageId, setNewStageId] = useState<string>('');

  const [email, setEmail] = useState('');
  // Chosen from the stage roster rather than typed: an imported student's
  // document id is a synthetic string nobody could reproduce from memory.
  const [picked, setPicked] = useState<StudentCandidate | null>(null);
  const [permissions, setPermissions] = useState({
    manageLectures: true,
    manageAnnouncements: true,
    manageRecords: true,
    manageChat: true,
    manageHomeworks: true,
    manageStudents: true,
    manageGrades: true,
  });
  const [admins, setAdmins] = useState<AdminRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStageId, setEditStageId] = useState<string>('');
  const [editPermissions, setEditPermissions] = useState({
    manageLectures: true,
    manageAnnouncements: true,
    manageRecords: true,
    manageChat: true,
    manageHomeworks: true,
    manageStudents: true,
    manageGrades: true,
  });

  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'allowed_admins'));
      const snapshot = await getDocs(q);
      let adminList: AdminRole[] = snapshot.docs.map(doc => ({
        id: doc.id,
        email: doc.id,
        // Docs created before assistants existed have no role field; they are admins.
        role: (doc.data().role as AssistantRole) || 'admin',
        managedStageId: doc.data().managedStageId,
        permissions: doc.data().permissions || {
          manageLectures: true,
          manageAnnouncements: true,
          manageRecords: true,
          manageChat: true,
          manageHomeworks: true,
          manageStudents: true,
          manageGrades: true,
        }
      }));

      if (!viewerIsMaster) {
        // A representative only ever sees the moderators they are responsible for.
        adminList = adminList.filter(
          a => a.role === 'moderator' && a.managedStageId === effectiveStageId
        );
      }

      setAdmins(adminList);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setNewRole(viewerIsMaster ? 'admin' : 'moderator');
      setNewStageId(viewerIsMaster ? (effectiveStageId || '') : (effectiveStageId || ''));
      fetchAdmins();
    }
  }, [isOpen, viewerIsMaster, effectiveStageId]);

  // Which stages currently have nobody representing them. Seats fall vacant on
  // their own every year - a representative who moves up a stage is released -
  // so the master admin needs to see the gaps rather than remember them.
  const stagesWithoutRep = viewerIsMaster
    ? stages.filter(st => !admins.some(a => a.role === 'admin' && a.managedStageId === st.id))
    : [];

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!picked || !email) {
        setError(isRtl ? 'اختر طالباً من القائمة أولاً' : 'Pick a student from the list first');
        setIsSubmitting(false);
        return;
      }

      // A representative can only ever create a moderator on their own stage.
      const roleToSave: AssistantRole = viewerIsMaster ? newRole : 'moderator';
      const stageToSave = viewerIsMaster ? newStageId : (effectiveStageId || '');
      const permsToSave = sanitizePermissions(roleToSave, permissions);

      if (!stageToSave) {
        setError(isRtl ? 'يرجى اختيار المرحلة' : 'Please select a stage');
        setIsSubmitting(false);
        return;
      }

      // A representative must already be a student who has signed in at least
      // once: the role is written onto users/{uid}, and without that doc the
      // appointment would sit in allowed_admins doing nothing visible.
      const existingUser = await getDocs(
        query(collection(db, 'users'), where('email', '==', email.toLowerCase()))
      );
      if (existingUser.empty) {
        setError(isRtl
          ? 'هذا الطالب لم يسجّل الدخول بعد. يجب أن يدخل التطبيق مرة واحدة أولاً.'
          : 'That student has never signed in. They must open the app once first.');
        setIsSubmitting(false);
        return;
      }

      // One representative per stage. Appointing a second silently created two
      // people with authority over the same stage and no way to tell which is
      // current - replace the sitting one instead.
      if (roleToSave === 'admin') {
        const sitting = admins.find(
          a => a.role === 'admin' && a.managedStageId === stageToSave && a.id !== email.toLowerCase()
        );
        if (sitting) {
          const stageName = stages.find(st => st.id === stageToSave);
          const label = (isRtl ? stageName?.nameAr : stageName?.nameEn) || stageToSave;
          const ok = window.confirm(isRtl
            ? `${label} لديها ممثل بالفعل (${sitting.id}). هل تريد استبداله؟`
            : `${label} already has a representative (${sitting.id}). Replace them?`);
          if (!ok) { setIsSubmitting(false); return; }
          await replaceSittingRepresentative(sitting.id);
        }
      }

      await setDoc(doc(db, 'allowed_admins', email.toLowerCase()), {
        email: email.toLowerCase(),
        role: roleToSave,
        managedStageId: stageToSave,
        permissions: permsToSave,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      });

      await logAdminAction('CREATE_ADMIN', `Added ${roleToSave} for ${stageToSave}: ${email.toLowerCase()}`, email.toLowerCase());

      // Update users collection if doc exists
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
      const userSnap = await getDocs(q);
      if (!userSnap.empty) {
         try {
            await setDoc(doc(db, 'users', userSnap.docs[0].id), {
               role: roleToSave,
               managedStageId: stageToSave,
               permissions: permsToSave
            }, { merge: true });
         } catch (e) {
            console.error(e);
         }
      }

      setEmail('');
      setPicked(null);
      fetchAdmins();
    } catch (err) {
      console.error('Error adding admin:', err);
      setError(isRtl ? 'فشل إضافة المسؤول' : 'Failed to add admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (id: string, email: string) => {
    try {
      const existing = admins.find(a => a.id === id);
      const roleToSave: AssistantRole = existing?.role || 'admin';
      const stageToSave = editStageId || existing?.managedStageId || '';
      const permsToSave = sanitizePermissions(roleToSave, editPermissions);

      await setDoc(doc(db, 'allowed_admins', id), {
        email: email,
        role: roleToSave,
        ...(stageToSave ? { managedStageId: stageToSave } : {}),
        permissions: permsToSave,
      }, { merge: true });
      
      await logAdminAction('UPDATE_ADMIN_PERMISSIONS', `Updated permissions for ${roleToSave}: ${email}`, id);
      
      // Update users collection if doc exists
      const q = query(collection(db, 'users'), where('email', '==', email));
      const userSnap = await getDocs(q);
      if (!userSnap.empty) {
         try {
            await setDoc(doc(db, 'users', userSnap.docs[0].id), {
               role: roleToSave,
               ...(stageToSave ? { managedStageId: stageToSave } : {}),
               permissions: permsToSave
            }, { merge: true });
         } catch (e) {
            console.error(e);
         }
      }

      setEditingId(null);
      fetchAdmins();
    } catch (err) {
      console.error('Error saving admin:', err);
    }
  };

  /**
   * Returns someone to being an ordinary student.
   *
   * Both halves matter: allowed_admins is what syncUserStage and firestore.rules
   * read a role from, so deleting only the users patch lets the next login put
   * the role back. managedStageId is cleared too - left behind it is stale data
   * that reads as authority over a stage the moment anyone is re-promoted.
   *
   * Every users doc with that email is patched, not just the first: an email can
   * legitimately have two (password-login uids are the email, Google-login uids
   * are not), and patching one leaves the other still holding the role.
   */
  const revokeStaffRole = async (id: string) => {
    await deleteDoc(doc(db, 'allowed_admins', id));

    const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', id)));
    for (const d of userSnap.docs) {
      try {
        await setDoc(doc(db, 'users', d.id), {
          role: 'student',
          managedStageId: deleteField(),
          permissions: deleteField(),
        }, { merge: true });
      } catch (e) {
        console.error(e);
      }
    }
  };

  /** Steps the sitting representative down so the stage never has two. */
  const replaceSittingRepresentative = async (id: string) => {
    await revokeStaffRole(id);
    await logAdminAction('REPLACE_REPRESENTATIVE', `Stepped down representative: ${id}`, id);
  };

  const handleDeleteAdmin = async (id: string) => {
    try {
      await revokeStaffRole(id);
      await logAdminAction('DELETE_ADMIN', `Removed admin role for: ${id}`, id);

      setDeletingId(null);
      fetchAdmins();
    } catch (err) {
      console.error('Error deleting admin:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-sky-600 dark:bg-sky-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t.manageAdmins}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8">
              {/* Add Admin Form */}
              {viewerIsMaster && stagesWithoutRep.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 rounded-xl flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {isRtl ? 'مراحل بلا ممثل: ' : 'Stages with no representative: '}
                    {stagesWithoutRep.map(st => (isRtl ? st.nameAr : st.nameEn)).join(isRtl ? '، ' : ', ')}
                  </span>
                </div>
              )}

              <form onSubmit={handleAddAdmin} className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.addAdmin}</h3>
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
                <div className="space-y-3">
                  <StudentPicker
                    stageId={viewerIsMaster ? newStageId : (effectiveStageId || '')}
                    lang={lang}
                    selected={picked}
                    onSelect={(c) => { setPicked(c); setEmail(c?.id || ''); }}
                  />

                  {viewerIsMaster && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setNewRole('admin')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          newRole === 'admin'
                            ? 'bg-sky-600 text-white shadow-lg shadow-sky-100 dark:shadow-none'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isRtl ? 'ممثل مرحلة' : 'Representative'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewRole('moderator')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          newRole === 'moderator'
                            ? 'bg-sky-600 text-white shadow-lg shadow-sky-100 dark:shadow-none'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isRtl ? 'مساعد' : 'Moderator'}
                      </button>
                    </div>
                  )}

                  {viewerIsMaster ? (
                    <select
                      value={newStageId}
                      onChange={(e) => setNewStageId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                    >
                      <option value="">{isRtl ? 'اختر المرحلة' : 'Select stage'}</option>
                      {stages.map(stage => (
                        <option key={stage.id} value={stage.id}>
                          {isRtl ? stage.nameAr : stage.nameEn}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-4 py-2.5 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm text-slate-500 dark:text-slate-400">
                      {isRtl ? 'المرحلة: ' : 'Stage: '}
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {stages.find(st => st.id === effectiveStageId)
                          ? (isRtl
                              ? stages.find(st => st.id === effectiveStageId)!.nameAr
                              : stages.find(st => st.id === effectiveStageId)!.nameEn)
                          : effectiveStageId}
                      </span>
                    </div>
                  )}

                  <div className="bg-slate-50 dark:bg-zinc-800 p-4 rounded-xl border border-slate-200 dark:border-zinc-700 flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{isRtl ? 'الصلاحيات' : 'Permissions'}</h4>
                    {permissionsForRole(viewerIsMaster ? newRole : 'moderator').map(perm => (
                      <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissions[perm.id as keyof typeof permissions]}
                          onChange={(e) => setPermissions({...permissions, [perm.id]: e.target.checked})}
                          className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{isRtl ? perm.labelAr : perm.labelEn}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    disabled={isSubmitting}
                    type="submit"
                    className="w-full py-2.5 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 rounded-xl font-bold hover:bg-sky-700 dark:hover:bg-sky-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-100 dark:shadow-none"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                    {t.addAdmin}
                  </button>
                </div>
              </form>

              {/* Admin List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.adminList}</h3>
                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-sky-600 dark:text-sky-400" />
                  </div>
                ) : admins.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-4 italic">No sub-admins added yet</p>
                ) : (
                  <div className="space-y-2">
                    {admins.map((admin) => (
                      <div key={admin.id} className="flex flex-col p-3 bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-100 dark:border-zinc-700">
                        {editingId === admin.id ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between pointer-events-none">
                              <span className="font-semibold text-slate-700 dark:text-slate-300 leading-tight">{admin.email}</span>
                            </div>

                            {viewerIsMaster && (
                              <select
                                value={editStageId}
                                onChange={(e) => setEditStageId(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500"
                              >
                                <option value="">{isRtl ? 'بدون مرحلة' : 'No stage'}</option>
                                {stages.map(stage => (
                                  <option key={stage.id} value={stage.id}>
                                    {isRtl ? stage.nameAr : stage.nameEn}
                                  </option>
                                ))}
                              </select>
                            )}

                            <div className="bg-white dark:bg-zinc-900 p-3 rounded-lg border border-slate-200 dark:border-zinc-700 flex flex-col gap-2">
                              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{isRtl ? 'الصلاحيات' : 'Permissions'}</h4>
                              {permissionsForRole(admin.role || 'admin').map(perm => (
                                <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editPermissions[perm.id as keyof typeof editPermissions]}
                                    onChange={(e) => setEditPermissions({...editPermissions, [perm.id]: e.target.checked})}
                                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                                  />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">{isRtl ? perm.labelAr : perm.labelEn}</span>
                                </label>
                              ))}
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveEdit(admin.id, admin.email)}
                                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition-colors"
                              >
                                {isRtl ? 'حفظ' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold transition-colors"
                              >
                                {isRtl ? 'إلغاء' : 'Cancel'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
                                {admin.email[0].toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-700 dark:text-slate-300 leading-tight">{admin.email}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                                  {admin.role === 'moderator'
                                    ? (isRtl ? 'مساعد' : 'Moderator')
                                    : (isRtl ? 'ممثل مرحلة' : 'Representative')}
                                  {admin.managedStageId && (
                                    <span className="text-slate-400 dark:text-slate-500 normal-case">
                                      {' · '}
                                      {stages.find(st => st.id === admin.managedStageId)
                                        ? (isRtl
                                            ? stages.find(st => st.id === admin.managedStageId)!.nameAr
                                            : stages.find(st => st.id === admin.managedStageId)!.nameEn)
                                        : admin.managedStageId}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                            {deletingId === admin.id ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleDeleteAdmin(admin.id)}
                                  className="px-2 py-1 text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-lg transition-colors"
                                >
                                  {isRtl ? 'تأكيد' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setDeletingId(null)}
                                  className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-700 dark:text-slate-300 rounded-lg transition-colors"
                                >
                                  {isRtl ? 'إلغاء' : 'Cancel'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingId(admin.id);
                                    setEditStageId(admin.managedStageId || '');
                                    setEditPermissions(admin.permissions || {
                                      manageLectures: true,
                                      manageAnnouncements: true,
                                      manageRecords: true,
                                      manageChat: true,
                                      manageHomeworks: true,
                                      manageStudents: true,
                                      manageGrades: true,
                                    });
                                  }}
                                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-all"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>
                                </button>
                                <button
                                  onClick={() => setDeletingId(admin.id)}
                                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
