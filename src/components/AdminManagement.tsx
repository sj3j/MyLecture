import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Shield, Loader2, AlertCircle } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, serverTimestamp, setDoc } from 'firebase/firestore';
import { Language, TRANSLATIONS } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminManagementProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

interface AdminRole {
  id: string;
  email: string;
  role?: 'admin' | 'moderator';
  permissions?: {
    manageLectures?: boolean;
    manageAnnouncements?: boolean;
    manageRecords?: boolean;
    manageChat?: boolean;
    manageHomeworks?: boolean;
    manageStudents?: boolean;
  };
}

export default function AdminManagement({ isOpen, onClose, lang }: AdminManagementProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [activeTab, setActiveTab] = useState<'roles' | 'notifications' | 'streak'>('roles');
  
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'moderator'>('admin');
  const [permissions, setPermissions] = useState({
    manageLectures: true,
    manageAnnouncements: true,
    manageRecords: true,
    manageChat: true,
    manageHomeworks: true,
    manageStudents: true,
  });
  const [admins, setAdmins] = useState<AdminRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'moderator'>('admin');
  const [editPermissions, setEditPermissions] = useState({
    manageLectures: true,
    manageAnnouncements: true,
    manageRecords: true,
    manageChat: true,
    manageHomeworks: true,
    manageStudents: true,
  });

  // Global Notifications State
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');

  // Streak Test State
  const [simulatedDaysOffset, setSimulatedDaysOffset] = useState<number>(0);

  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'allowed_admins'));
      const snapshot = await getDocs(q);
      const adminList = snapshot.docs.map(doc => ({
        id: doc.id,
        email: doc.id,
        role: doc.data().role as 'admin' | 'moderator' || 'admin',
        permissions: doc.data().permissions || {
          manageLectures: true,
          manageAnnouncements: true,
          manageRecords: true,
          manageChat: true,
          manageHomeworks: true,
          manageStudents: true,
        }
      }));
      setAdmins(adminList);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSimulationOffset = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/admin/simulate-streak-day", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSimulatedDaysOffset(data.simulatedDaysOffset || 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAdmins();
      fetchSimulationOffset();
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle || !notifBody) {
      setError(isRtl ? 'يرجى إدخال عنوان ونص الإشعار' : 'Title and body are required');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No token");
      
      const res = await fetch("/api/admin/broadcast-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ title: notifTitle, body: notifBody })
      });
      
      if (!res.ok) throw new Error("API error");
      setSuccess(isRtl ? 'تم إرسال الإشعار لجميع المستخدمين بنجاح' : 'Notification broadcasted successfully');
      setNotifTitle('');
      setNotifBody('');
    } catch (e) {
      setError(isRtl ? 'فشل إرسال الإشعار' : 'Failed to send notification');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSimulatedDays = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No token");
      
      const res = await fetch("/api/admin/simulate-streak-day", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ offsetDays: simulatedDaysOffset })
      });
      
      if (!res.ok) throw new Error("API error");
      setSuccess(isRtl ? 'تم تحديث يوم الاختبار بنجاح' : 'Test day updated successfully');
    } catch(e) {
      setError(isRtl ? 'فشل تحديث اليوم' : 'Failed to update test day');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!email.includes('@')) {
        setError(isRtl ? 'بريد إلكتروني غير صالح' : 'Invalid email');
        setIsSubmitting(false);
        return;
      }

      await setDoc(doc(db, 'allowed_admins', email.toLowerCase()), {
        email: email.toLowerCase(),
        role: role,
        permissions: permissions,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      });

      setEmail('');
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
      await setDoc(doc(db, 'allowed_admins', id), {
        email: email,
        role: editRole,
        permissions: editPermissions,
      }, { merge: true });
      
      // Update users collection if doc exists
      const q = query(collection(db, 'users'), where('email', '==', email));
      const userSnap = await getDocs(q);
      if (!userSnap.empty) {
         try {
            await setDoc(doc(db, 'users', userSnap.docs[0].id), {
               role: editRole,
               permissions: editPermissions
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

  const handleDeleteAdmin = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'allowed_admins', id));
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
                {isRtl ? 'الإدارة' : 'Administration'}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700">
              <button
                onClick={() => setActiveTab('roles')}
                className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'roles' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {isRtl ? 'الأدوار' : 'Roles'}
              </button>
              <button
                onClick={() => setActiveTab('notifications')}
                className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'notifications' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {isRtl ? 'الإشعارات' : 'Notifications'}
              </button>
              <button
                onClick={() => setActiveTab('streak')}
                className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'streak' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {isRtl ? 'اختبار الستريك' : 'Streak Test'}
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8 flex-1">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {success}
                </div>
              )}

              {activeTab === 'roles' && (
                <>
                  {/* Add Admin Form */}
                  <form onSubmit={handleAddAdmin} className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.addAdmin}</h3>
                <div className="space-y-3">
                  <input
                    required
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none transition-all"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'admin' | 'moderator')}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none transition-all"
                  >
                    <option value="admin">Admin (Full Access)</option>
                    <option value="moderator">Moderator (Content Only)</option>
                  </select>

                  <div className="bg-slate-50 dark:bg-zinc-800 p-4 rounded-xl border border-slate-200 dark:border-zinc-700 flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{isRtl ? 'الصلاحيات' : 'Permissions'}</h4>
                    {[
                      { id: 'manageLectures', labelEn: 'Manage Lectures', labelAr: 'إدارة المحاضرات' },
                      { id: 'manageAnnouncements', labelEn: 'Manage Announcements', labelAr: 'إدارة التبليغات' },
                      { id: 'manageRecords', labelEn: 'Manage Records', labelAr: 'إدارة التسجيلات' },
                      { id: 'manageChat', labelEn: 'Manage Chat', labelAr: 'إدارة الشات' },
                      { id: 'manageHomeworks', labelEn: 'Manage Homeworks', labelAr: 'إدارة الواجبات' },
                      { id: 'manageStudents', labelEn: 'Manage Students', labelAr: 'إدارة الطلاب' },
                    ].map(perm => (
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
                            
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as 'admin' | 'moderator')}
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition-all text-sm"
                            >
                              <option value="admin">Admin (Full Access)</option>
                              <option value="moderator">Moderator (Content Only)</option>
                            </select>

                            <div className="bg-white dark:bg-zinc-900 p-3 rounded-lg border border-slate-200 dark:border-zinc-700 flex flex-col gap-2">
                              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{isRtl ? 'الصلاحيات' : 'Permissions'}</h4>
                              {[
                                { id: 'manageLectures', labelEn: 'Manage Lectures', labelAr: 'إدارة المحاضرات' },
                                { id: 'manageAnnouncements', labelEn: 'Manage Announcements', labelAr: 'إدارة التبليغات' },
                                { id: 'manageRecords', labelEn: 'Manage Records', labelAr: 'إدارة التسجيلات' },
                                { id: 'manageChat', labelEn: 'Manage Chat', labelAr: 'إدارة الشات' },
                                { id: 'manageHomeworks', labelEn: 'Manage Homeworks', labelAr: 'إدارة الواجبات' },
                                { id: 'manageStudents', labelEn: 'Manage Students', labelAr: 'إدارة الطلاب' },
                              ].map(perm => (
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
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${admin.role === 'moderator' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'}`}>
                                {admin.email[0].toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-700 dark:text-slate-300 leading-tight">{admin.email}</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${admin.role === 'moderator' ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'}`}>
                                  {admin.role || 'admin'}
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
                                    setEditRole(admin.role || 'admin');
                                    setEditPermissions(admin.permissions || {
                                      manageLectures: true,
                                      manageAnnouncements: true,
                                      manageRecords: true,
                                      manageChat: true,
                                      manageHomeworks: true,
                                      manageStudents: true,
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
            </>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 rounded-xl">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">
                  {isRtl ? 'هذا الإشعار سيتم إرساله كإشعار منبثق (Push Notification) وسيظهر في قسم الإشعارات لجميع المستخدمين.' : 'This broadcast will send a push notification and push to the in-app notifications section for all users.'}
                </p>
              </div>

              <form onSubmit={handleBroadcastNotification} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {isRtl ? 'عنوان الإشعار' : 'Notification Title'}
                  </label>
                  <input
                    required
                    type="text"
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder={isRtl ? 'مثال: تحديث هام...' : 'ex: Important Update...'}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {isRtl ? 'نص الإشعار' : 'Notification Body'}
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={notifBody}
                    onChange={(e) => setNotifBody(e.target.value)}
                    placeholder={isRtl ? 'تفاصيل الإشعار هنا...' : 'Notification details here...'}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {isRtl ? 'إرسال لجميع الطلاب' : 'Broadcast to all students'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'streak' && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-4 bg-sky-50 dark:bg-sky-900/20 text-sky-800 dark:text-sky-300 rounded-xl">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">
                  {isRtl ? 'يمكنك هنا محاكاة مرور الأيام لاختبار نظام الستريك بدون الانتظار لأيام حقيقية.' : 'You can simulate days passing to test the streak system without waiting for real days.'}
                </p>
              </div>

              <form onSubmit={handleUpdateSimulatedDays} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {isRtl ? 'إزاحة الأيام (للأمام)' : 'Days Offset (Forward)'}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={simulatedDaysOffset}
                      onChange={(e) => setSimulatedDaysOffset(parseInt(e.target.value) || 0)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 font-mono text-center"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isRtl ? 'مثال: 1 = غداً، 2 = بعد يومين. أدخل 0 للعودة للوقت الحقيقي.' : 'Example: 1 = Tomorrow, 2 = Day after tomorrow. Enter 0 to return to real time.'}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  {isRtl ? 'تحديث وقت النظام' : 'Update System Time'}
                </button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )}
</AnimatePresence>
  );
}
