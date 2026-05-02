import React, { useState, useEffect } from 'react';
import { X, Search, AlertCircle, History, Clock, Shield as ShieldIcon } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Language, TRANSLATIONS, Student, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import StreakHistoryModal from './StreakHistoryModal';

interface StreakManagementProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  user: UserProfile | null;
}

export default function StreakManagement({ isOpen, onClose, lang, user }: StreakManagementProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [students, setStudents] = useState<Student[]>([]);
  const [pendingResets, setPendingResets] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'students' | 'pending'>('students');
  
  // Edit
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStreakCount, setEditStreakCount] = useState<number | ''>(0);
  const [recoveryReason, setRecoveryReason] = useState('');
  const [freezeAmount, setFreezeAmount] = useState<number>(0);
  const [showHistoryModalFor, setShowHistoryModalFor] = useState<Student | null>(null);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'students'));
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const pendingSnapshot = await getDocs(collection(db, 'pending_streak_resets'));
      
      const pendingData = pendingSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingResets(pendingData.sort((a: any, b: any) => (b.missedDays || 0) - (a.missedDays || 0)));
      
      const userMap = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const userEmail = userData.email || doc.id;
        if (userEmail) {
          userMap.set(userEmail.toLowerCase().trim(), {
            name: userData.name,
            streakCount: userData.streakCount || 0,
            longestStreak: userData.longestStreak || 0,
            freezeTokens: userData.freezeTokens ?? 1,
            uid: doc.id
          });
        }
      });

      const studentsData = snapshot.docs.map(doc => {
        const data = doc.data();
        const emailKey = (data.email || doc.id).toLowerCase().trim();
        const userInfo = userMap.get(emailKey);
        
        return {
          id: doc.id,
          ...data,
          currentName: userInfo?.name,
          streakCount: userInfo?.streakCount,
          longestStreak: userInfo?.longestStreak,
          freezeTokens: userInfo?.freezeTokens,
          userUid: userInfo?.uid,
        };
      }) as unknown as Student[];
      
      setStudents(studentsData);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
  }, [isOpen]);

  const handleGrantFreeze = async (userUid: string | undefined, e: React.MouseEvent) => {
    e.preventDefault();
    if (!userUid) {
      const msg = isRtl ? 'حساب الطالب غير موجود' : 'Student account not found';
      setError(msg); window.alert(msg); return;
    }
    if (freezeAmount <= 0) {
      const msg = isRtl ? 'يرجى إدخال عدد صالح' : 'Please enter a valid amount';
      setError(msg); window.alert(msg); return;
    }
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/grant-freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userUid, amount: freezeAmount })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const msg = isRtl ? 'تم منح دروع التجميد بنجاح' : 'Freeze tokens granted successfully';
        setSuccess(msg); window.alert(msg); setFreezeAmount(0);
      } else throw new Error(data.error || "API error");
    } catch (err: any) {
      const msg = err.message || (isRtl ? 'فشل' : 'Failed');
      setError(msg); window.alert(msg);
    } finally {
      setIsSubmitting(false);
      fetchStudents();
    }
  };

  const handleStreakRecovery = async (userUid: string | undefined, studentEmail: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!userUid) {
      const msg = isRtl ? 'حساب الطالب غير موجود' : 'Student account not found';
      setError(msg); window.alert(msg); return;
    }
    if (editStreakCount === '' || !recoveryReason) {
      const msg = isRtl ? 'يرجى إدخال الستريك الجديد والسبب' : 'Please enter new streak and reason';
      setError(msg); window.alert(msg); return;
    }
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/streak-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userUid, studentEmail, newStreak: editStreakCount, reason: recoveryReason })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const msg = isRtl ? 'تم استرجاع الستريك بنجاح' : 'Streak recovered successfully';
        setSuccess(msg); window.alert(msg); setRecoveryReason('');
      } else throw new Error(data.error || "API error");
    } catch (err: any) {
      const msg = err.message || (isRtl ? 'فشل' : 'Failed');
      setError(msg); window.alert(msg);
    } finally {
      setIsSubmitting(false);
      fetchStudents();
    }
  };

  const handleResolvePending = async (userUid: string, action: 'reset' | 'forgive') => {
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/resolve-pending-streak", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userUid, action })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(isRtl ? 'تم تحديث الستريك' : 'Pending streak resolved');
      } else throw new Error(data.error || "API error");
    } catch (err: any) {
      const msg = err.message || (isRtl ? 'فشل التحديث' : 'Failed to resolve');
      setError(msg); window.alert(msg);
    } finally {
      setIsSubmitting(false);
      fetchStudents();
    }
  };

  const handleGrantGlobalFreeze = async () => {
    if (!window.confirm(isRtl ? 'هل أنت متأكد من منح 3 دروع تجميد لجميع الطلاب؟' : 'Are you sure you want to grant 3 freeze shields to all students?')) return;
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/grant-freeze-global", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(isRtl ? 'تم منح دروع التجميد بنجاح لجميع المستخدمين' : 'Global freeze tokens granted successfully');
      } else throw new Error(data.error || "API error");
    } catch (err: any) {
      setError(err.message || (isRtl ? 'فشل التحديث' : 'Failed'));
    } finally {
      setIsSubmitting(false);
      fetchStudents();
    }
  };

  const handleTimeFreeze = async () => {
    if (!window.confirm(isRtl ? 'هل تريد استعادة جميع الستريكات المفقودة مؤخراً؟ هذا التغيير سيجعل نشاط الطلاب كأنه استمر حتى الأمس.' : 'Are you sure you want to freeze time?')) return;
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/time-freeze", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(isRtl ? 'تم إيقاف الزمن بنجاح' : 'Time frozen successfully');
      } else throw new Error(data.error || "API error");
    } catch (err: any) {
      setError(err.message || (isRtl ? 'فشل التحديث' : 'Failed'));
    } finally {
      setIsSubmitting(false);
      fetchStudents();
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div key="manage-modal" className="fixed inset-0 z-[110] flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-orange-600 dark:bg-orange-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ShieldIcon className="w-5 h-5" />
                {isRtl ? 'إدارة الستريك' : 'Streak Management'}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-6">
              <button
                onClick={() => setActiveTab('students')}
                className={`py-4 px-4 font-bold border-b-2 transition-colors ${activeTab === 'students' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {isRtl ? 'الطلاب' : 'Students'}
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`py-4 px-4 font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'pending' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {isRtl ? 'الستريك المعلق' : 'Pending Streaks'}
                {pendingResets.length > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {pendingResets.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab === 'pending' ? (
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-zinc-900/50">
                  {pendingResets.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      {isRtl ? 'لا يوجد أي طلاب بخطر فقدان الستريك.' : 'No students at risk of losing their streak.'}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingResets.map(pr => (
                        <div key={pr.id} className="bg-white dark:bg-zinc-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{pr.name}</span>
                              <span className="text-sm font-normal text-slate-500">({pr.email})</span>
                            </div>
                            <div className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
                              {isRtl ? 'الستريك المعرض للخسارة:' : 'Streak at risk:'} <span className="font-bold text-orange-500">{pr.streakAtRisk}</span> • {isRtl ? 'أيام الغياب:' : 'Missed days:'} <span className="font-bold">{pr.missedDays}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleResolvePending(pr.userId, 'forgive')}
                              disabled={isSubmitting}
                              className="px-4 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded-xl font-bold transition-colors text-sm"
                            >
                              {isRtl ? 'مسامحة (إبقاء الستريك)' : 'Forgive (Keep Streak)'}
                            </button>
                            <button
                              onClick={() => handleResolvePending(pr.userId, 'reset')}
                              disabled={isSubmitting}
                              className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded-xl font-bold transition-colors text-sm"
                            >
                              {isRtl ? 'تأكيد الخسارة (تصفير)' : 'Reset Streak (to 1)'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                  {error && (
                    <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      {success}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      onClick={handleGrantGlobalFreeze}
                      className="px-4 py-2 text-sm font-bold bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <ShieldIcon className="w-4 h-4" />
                      {isRtl ? 'منح 3 دروع تجميد للجميع' : 'Grant 3 Freeze Tokens to All'}
                    </button>
                    <button
                      onClick={handleTimeFreeze}
                      className="px-4 py-2 text-sm font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Clock className="w-4 h-4" />
                      {isRtl ? 'استعادة المفقودين مؤخراً' : 'Recover Recently Lost'}
                    </button>
                  </div>

                  <div className="relative">
                    <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5`} />
                    <input
                      type="text"
                      placeholder={isRtl ? 'ابحث عن طالب...' : 'Search students...'}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full py-3 ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} bg-slate-50 dark:bg-zinc-800 border-none rounded-xl text-slate-900 dark:text-stone-100 focus:ring-2 focus:ring-sky-500 transition-all`}
                    />
                  </div>

                  {isLoading ? (
                    <div className="py-12 flex justify-center">
                      <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin"></div>
                    </div>
                  ) : editingStudent ? (
                    <div className="bg-slate-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                          {editingStudent.name}
                        </h3>
                        <button onClick={() => setEditingStudent(null)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium text-sm">
                          {isRtl ? 'عودة للقائمة' : 'Back to list'}
                        </button>
                      </div>

                      <div className="space-y-6">
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl space-y-4 border border-orange-100 dark:border-orange-800/30">
                          <h4 className="font-bold text-orange-800 dark:text-orange-300 flex items-center gap-2">
                            <History className="w-4 h-4" />
                            {isRtl ? 'إدارة الستريك والطاقة' : 'Streak & Freeze Management'}
                          </h4>
                          
                          <div className="flex items-center justify-between border-b border-orange-200 dark:border-orange-800/30 pb-4">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {isRtl ? 'سجل الستريك' : 'Streak History Log'}
                            </label>
                            <button
                              onClick={(e) => { e.preventDefault(); setShowHistoryModalFor(editingStudent); }}
                              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer"
                            >
                              <History className="w-4 h-4" />
                              {isRtl ? 'عرض السجل' : 'View Log'}
                            </button>
                          </div>

                          <div className="space-y-2 border-b border-orange-200 dark:border-orange-800/30 pb-4">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {isRtl ? 'منح دروع تجميد' : 'Grant Freeze Tokens'}
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="1"
                                placeholder={isRtl ? 'العدد (مثال: 3)' : 'Amount (e.g. 3)'}
                                value={freezeAmount || ''}
                                onChange={(e) => setFreezeAmount(parseInt(e.target.value) || 0)}
                                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none"
                              />
                              <button
                                type="button"
                                onClick={(e) => handleGrantFreeze(editingStudent?.userUid, e)}
                                disabled={isSubmitting}
                                className="px-6 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold whitespace-nowrap disabled:opacity-50"
                              >
                                {isRtl ? 'منح' : 'Grant'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {isRtl ? 'استرجاع الستريك (Recovery)' : 'Streak Recovery'}
                            </label>
                            <div className="flex gap-2 mb-3">
                              <input
                                type="number"
                                placeholder={isRtl ? 'الستريك الجديد' : 'New Streak'}
                                value={editStreakCount === '' ? '' : editStreakCount}
                                onChange={(e) => setEditStreakCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                                className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder={isRtl ? 'السبب (مثال: عذر طبي، مشكلة تقنية)' : 'Reason'}
                              value={recoveryReason}
                              onChange={(e) => setRecoveryReason(e.target.value)}
                              className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none mb-3"
                            />
                            <button
                                type="button"
                                onClick={(e) => handleStreakRecovery(editingStudent?.userUid, editingStudent.email, e)}
                                disabled={isSubmitting}
                                className="w-full px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl whitespace-nowrap disabled:opacity-50"
                              >
                                {isRtl ? 'استرجاع الستريك المُستحق' : 'Recover Streak'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-800">
                            <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'الاسم' : 'Name'}</th>
                            <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'البريد' : 'Email'}</th>
                            <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'الستريك المستمر' : 'Streak'}</th>
                            <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'أطول ستريك' : 'Longest'}</th>
                            <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'دروع التجميد' : 'Freezes'}</th>
                            <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'إجراء' : 'Action'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map(student => (
                            <tr key={student.id} className="border-b border-slate-100 dark:border-zinc-800/50 hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="p-3 text-sm text-slate-900 dark:text-white font-medium">{student.currentName || student.name}</td>
                              <td className="p-3 text-sm text-slate-500">{student.email}</td>
                              <td className="p-3 text-sm text-center">
                                <span className={`inline-flex items-center justify-center min-w-[2rem] h-6 px-2 rounded-full font-bold ${student.streakCount && student.streakCount > 0 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                                  {student.streakCount || 0}
                                </span>
                              </td>
                              <td className="p-3 text-sm text-slate-600 dark:text-slate-400 text-center">{student.longestStreak || 0}</td>
                              <td className="p-3 text-sm text-center">
                                <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-2 rounded-full font-bold bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
                                  {student.freezeTokens ?? 1}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="flex gap-2 justify-center">
                                  <button
                                    onClick={() => {
                                      setEditingStudent(student);
                                      setEditStreakCount(student.streakCount ?? 0);
                                      setFreezeAmount(0);
                                      setRecoveryReason('');
                                    }}
                                    className="px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-slate-300 rounded-lg transition-colors"
                                  >
                                    {isRtl ? 'إدارة الستريك' : 'Manage Streak'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {showHistoryModalFor && (
        <React.Fragment key="history-modal-fragment">
          <StreakHistoryModal
            student={showHistoryModalFor}
            isOpen={!!showHistoryModalFor}
            onClose={() => setShowHistoryModalFor(null)}
            lang={lang}
          />
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
