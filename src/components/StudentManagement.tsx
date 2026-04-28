import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Users, Loader2, AlertCircle, CheckCircle2, XCircle, Upload } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Language, TRANSLATIONS, Student, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import StreakHistoryModal from './StreakHistoryModal';
import { hashPassword } from '../lib/hash';

interface StudentManagementProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  user: UserProfile | null;
}

export default function StudentManagement({ isOpen, onClose, lang, user }: StudentManagementProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const isMasterAdmin = user?.email === 'almdrydyl335@gmail.com' || user?.email === 'fenix.admin@gmail.com';
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [examCode, setExamCode] = useState('');
  
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editExamCode, setEditExamCode] = useState('');
  const [editStreakCount, setEditStreakCount] = useState<number | ''>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHistoryModalFor, setShowHistoryModalFor] = useState<Student | null>(null);
  const [freezeAmount, setFreezeAmount] = useState<number>(0);
  const [recoveryReason, setRecoveryReason] = useState('');
  
  const handleGrantFreeze = async (userUid: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!userUid || freezeAmount <= 0) return;
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/grant-freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userUid, amount: freezeAmount })
      });
      if (res.ok) {
        setSuccess(isRtl ? 'تم منح دروع التجميد بنجاح' : 'Freeze tokens granted successfully');
        setFreezeAmount(0);
      } else throw new Error("API error");
    } catch (err) {
      setError(isRtl ? 'فشل في منح دروع التجميد' : 'Failed to grant freeze tokens');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStreakRecovery = async (userUid: string, studentEmail: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!userUid || editStreakCount === '' || !recoveryReason) {
      setError(isRtl ? 'يرجى إدخال الستريك الجديد والسبب' : 'Please enter new streak and reason');
      return;
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
      if (res.ok) {
        setSuccess(isRtl ? 'تم استرجاع الستريك بنجاح' : 'Streak recovered successfully');
        setRecoveryReason('');
      } else throw new Error("API error");
    } catch (err) {
      setError(isRtl ? 'فشل في استرجاع الستريك' : 'Failed to recover streak');
    } finally {
      setIsSubmitting(false);
      fetchStudents();
    }
  };

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'students'));
      const usersSnapshot = await getDocs(collection(db, 'users'));
      
      // Create a map of email to user data to easily append currentName
      const userMap = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const userEmail = userData.email || doc.id;
        if (userEmail) {
          userMap.set(userEmail.toLowerCase().trim(), {
            name: userData.name,
            streakCount: userData.streakCount || 0,
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
          userUid: userInfo?.uid,
          createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
        };
      }) as Student[];
      
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

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const emailLower = email.toLowerCase();
      const studentDoc = await getDoc(doc(db, 'students', emailLower));
      
      if (studentDoc.exists()) {
        throw new Error(isRtl ? 'الطالب موجود بالفعل' : 'Student already exists');
      }

      const hashedPassword = await hashPassword(password);

      await setDoc(doc(db, 'students', emailLower), {
        name,
        email: emailLower,
        password: hashedPassword,
        examCode,
        isActive: true,
        createdAt: serverTimestamp()
      });

      setSuccess(isRtl ? 'تمت إضافة الطالب بنجاح' : 'Student added successfully');
      setName('');
      setEmail('');
      setPassword('');
      setExamCode('');
      fetchStudents();
    } catch (err: any) {
      console.error('Error adding student:', err);
      setError(err.message || (isRtl ? 'فشل إضافة الطالب' : 'Failed to add student'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (student: Student) => {
    try {
      await updateDoc(doc(db, 'students', student.id), {
        isActive: !student.isActive
      });
      setStudents(students.map(s => s.id === student.id ? { ...s, isActive: !s.isActive } : s));
    } catch (err) {
      console.error('Error toggling student status:', err);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'students', id));
      setStudents(students.filter(s => s.id !== id));
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting student:', err);
    }
  };

  const handleDeleteAllStudents = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'students'));
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      setStudents([]);
      setIsDeletingAll(false);
      setSuccess(isRtl ? 'تم حذف جميع الطلاب بنجاح' : 'All students deleted successfully');
    } catch (err) {
      console.error('Error deleting all students:', err);
      setError(isRtl ? 'فشل حذف جميع الطلاب' : 'Failed to delete all students');
    }
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const oldEmail = editingStudent.id;
      const newEmailLower = editEmail.toLowerCase();
      
      const updateData: any = {
        name: editName,
        examCode: editExamCode,
      };

      if (editPassword) {
        updateData.password = await hashPassword(editPassword);
      }

      if (newEmailLower !== oldEmail) {
        const newDoc = await getDoc(doc(db, 'students', newEmailLower));
        if (newDoc.exists()) {
          throw new Error(isRtl ? 'البريد الإلكتروني الجديد موجود بالفعل' : 'New email already exists');
        }

        const oldDoc = await getDoc(doc(db, 'students', oldEmail));
        const oldData = oldDoc.data();

        await setDoc(doc(db, 'students', newEmailLower), {
          ...oldData,
          ...updateData,
          email: newEmailLower
        });
        await deleteDoc(doc(db, 'students', oldEmail));
      } else {
        await updateDoc(doc(db, 'students', oldEmail), updateData);
      }

      setSuccess(isRtl ? 'تم تحديث الطالب بنجاح' : 'Student updated successfully');
      setEditingStudent(null);
      fetchStudents();
    } catch (err: any) {
      console.error('Error editing student:', err);
      setError(err.message || (isRtl ? 'فشل تحديث بيانات الطالب' : 'Failed to update student'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const text = await file.text();
      const rows = text.split('\n').filter(row => row.trim() !== '');
      
      if (rows.length <= 1) {
        throw new Error(isRtl ? 'ملف CSV فارغ' : 'CSV file is empty');
      }

      const batch = writeBatch(db);
      let count = 0;

      // Skip header row if it exists
      const startIndex = rows[0].toLowerCase().includes('name') ? 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const [csvName, csvEmail, csvPassword, csvExamCode] = rows[i].split(',').map(s => s.trim());
        if (csvName && csvEmail && csvPassword && csvExamCode) {
          const emailLower = csvEmail.toLowerCase();
          const hashedPassword = await hashPassword(csvPassword);
          
          const studentRef = doc(db, 'students', emailLower);
          batch.set(studentRef, {
            name: csvName,
            email: emailLower,
            password: hashedPassword,
            examCode: csvExamCode,
            isActive: true,
            createdAt: serverTimestamp()
          });
          count++;
        }
      }

      await batch.commit();
      setSuccess(isRtl ? `تم استيراد ${count} طالب بنجاح` : `Successfully imported ${count} students`);
      fetchStudents();
    } catch (err: any) {
      console.error('Error uploading CSV:', err);
      setError(err.message || (isRtl ? 'فشل استيراد ملف CSV' : 'Failed to import CSV'));
    } finally {
      setIsLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const filteredStudents = students.filter(student => 
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    student.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.examCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (student.currentName && student.currentName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
            className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-sky-600 dark:bg-sky-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5" />
                {isRtl ? 'إدارة الطلاب' : 'Manage Students'}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-8">
              {/* Add/Edit Student Form */}
              <div className="w-full md:w-1/3 space-y-6">
                {editingStudent ? (
                  <form onSubmit={handleEditStudent} className="space-y-4 bg-sky-50 dark:bg-sky-900/10 p-4 rounded-2xl border border-sky-100 dark:border-sky-900/30">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                        {isRtl ? 'تعديل بيانات الطالب' : 'Edit Student'}
                      </h3>
                      <button 
                        type="button"
                        onClick={() => setEditingStudent(null)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {error && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        {success}
                      </div>
                    )}

                    <div className="space-y-3">
                      <input
                        required
                        type="text"
                        placeholder={isRtl ? 'الاسم الكامل' : 'Full Name'}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                      />
                      <input
                        required
                        type="email"
                        placeholder={isRtl ? 'البريد الإلكتروني' : 'Email'}
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                      />
                      <input
                        type="password"
                        placeholder={isRtl ? 'كلمة المرور (اختياري)' : 'Password (Optional)'}
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                      />
                      <input
                        required
                        type="text"
                        placeholder={isRtl ? 'كود الامتحان' : 'Exam Code'}
                        value={editExamCode}
                        onChange={(e) => setEditExamCode(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                      />
                      {editingStudent.userUid && isMasterAdmin && (
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl space-y-4 border border-orange-100 dark:border-orange-800/30">
                          <h4 className="font-bold text-orange-800 dark:text-orange-300">
                            {isRtl ? 'إدارة الستريك' : 'Streak Management'}
                          </h4>
                          
                          <div className="flex items-center justify-between border-b border-orange-200 dark:border-orange-800/30 pb-4 relative z-10">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {isRtl ? 'سجل الستريك' : 'Streak History Log'}
                            </label>
                            <button
                              onClick={(e) => { e.preventDefault(); setShowHistoryModalFor(editingStudent); }}
                              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer"
                            >
                              {isRtl ? 'عرض السجل' : 'View History'}
                            </button>
                          </div>
                          
                          {user?.isMasterAdmin && (
                            <>
                              <div className="space-y-2 relative z-10 border-b border-orange-200 dark:border-orange-800/30 pb-4">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {isRtl ? 'منح دروع التجميد' : 'Grant Freeze Tokens'}
                                </label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    placeholder={isRtl ? 'عدد الدروع' : 'Token count'}
                                    value={freezeAmount || ''}
                                    onChange={(e) => setFreezeAmount(parseInt(e.target.value) || 0)}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none"
                                  />
                                  <button
                                    onClick={(e) => handleGrantFreeze(editingStudent.userUid!, e)}
                                    disabled={isSubmitting || freezeAmount <= 0}
                                    className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl whitespace-nowrap"
                                  >
                                    {isRtl ? 'منح' : 'Grant'}
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-2 relative z-10">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {isRtl ? 'استرجاع الستريك (Recovery)' : 'Streak Recovery'}
                                </label>
                                <div className="flex gap-2 mb-2">
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
                                  placeholder={isRtl ? 'سبب الاسترجاع...' : 'Reason for recovery...'}
                                  value={recoveryReason}
                                  onChange={(e) => setRecoveryReason(e.target.value)}
                                  className="w-full px-4 py-2.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none mb-2"
                                />
                                <button
                                    onClick={(e) => handleStreakRecovery(editingStudent.userUid!, editingStudent.email, e)}
                                    disabled={isSubmitting || !recoveryReason || editStreakCount === ''}
                                    className="w-full px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl whitespace-nowrap"
                                  >
                                    {isRtl ? 'استرجاع الستريك المُستحق' : 'Recover Streak'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <button
                        disabled={isSubmitting}
                        type="submit"
                        className="w-full py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-100 dark:shadow-none"
                      >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        {isRtl ? 'حفظ التعديلات' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleAddStudent} className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {isRtl ? 'إضافة طالب جديد' : 'Add New Student'}
                    </h3>
                    
                    {error && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        {success}
                      </div>
                    )}

                    <div className="space-y-3">
                      <input
                        required
                        type="text"
                        placeholder={isRtl ? 'الاسم الكامل' : 'Full Name'}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                      />
                      <input
                        required
                        type="email"
                        placeholder={isRtl ? 'البريد الإلكتروني' : 'Email'}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                      />
                      <input
                        required
                        type="password"
                        placeholder={isRtl ? 'كلمة المرور' : 'Password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                      />
                    <input
                      required
                      type="text"
                      placeholder={isRtl ? 'كود الامتحان' : 'Exam Code'}
                      value={examCode}
                      onChange={(e) => setExamCode(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                    />
                    <button
                      disabled={isSubmitting}
                      type="submit"
                      className="w-full py-2.5 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-100 dark:shadow-none"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                      {isRtl ? 'إضافة طالب' : 'Add Student'}
                    </button>
                  </div>
                </form>
                )}

                <div className="pt-6 border-t border-slate-200 dark:border-zinc-800">
                  <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
                    {isRtl ? 'استيراد من CSV' : 'Import from CSV'}
                  </h3>
                  <label className="w-full py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-zinc-700">
                    <Upload className="w-5 h-5" />
                    {isRtl ? 'اختر ملف CSV' : 'Choose CSV File'}
                    <input
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleCsvUpload}
                    />
                  </label>
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    {isRtl ? 'الأعمدة: name, email, password, examCode' : 'Columns: name, email, password, examCode'}
                  </p>
                </div>
              </div>

              {/* Student List */}
              <div className="w-full md:w-2/3 flex flex-col">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {isRtl ? 'قائمة الطلاب' : 'Student List'} ({students.length})
                    </h3>
                    <div className="relative flex-1 max-w-sm">
                      <input
                        type="text"
                        placeholder={isRtl ? 'البحث بالاسم، الإيميل، أو الكود...' : 'Search by name, email, or code...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700/50 text-slate-900 dark:text-zinc-100 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                  {isMasterAdmin && students.length > 0 && (
                    <div className="relative">
                      {isDeletingAll ? (
                        <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 p-1 rounded-lg shadow-sm border border-slate-200 dark:border-zinc-700">
                          <button
                            onClick={handleDeleteAllStudents}
                            className="px-2 py-1 text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-md transition-colors"
                          >
                            {isRtl ? 'تأكيد الحذف' : 'Confirm Delete'}
                          </button>
                          <button
                            onClick={() => setIsDeletingAll(false)}
                            className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-700 dark:text-slate-300 rounded-md transition-colors"
                          >
                            {isRtl ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsDeletingAll(true)}
                          className="px-3 py-1.5 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isRtl ? 'حذف جميع الطلاب' : 'Delete All Students'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 overflow-auto bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-700">
                  {isLoading ? (
                    <div className="flex justify-center items-center h-full py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-sky-600 dark:text-sky-400" />
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
                      <Users className="w-12 h-12 mb-4 opacity-50" />
                      <p>{isRtl ? 'لا توجد نتائج' : 'No results found'}</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 dark:bg-zinc-800 sticky top-0 z-10">
                        <tr>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'الاسم' : 'Name'}</th>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'البريد' : 'Email'}</th>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'الكود' : 'Code'}</th>
                          {user?.isMasterAdmin && (
                            <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'الستريك' : 'Streak'}</th>
                          )}
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'الحالة' : 'Status'}</th>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'إجراء' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((student) => (
                          <tr key={student.id} className="border-b border-slate-200 dark:border-zinc-700/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors">
                            <td className="p-3">
                              <div className="text-sm font-medium text-slate-900 dark:text-stone-100">{student.name}</div>
                              {student.currentName && student.currentName !== student.name && (
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                  {isRtl ? 'الاسم الحالي: ' : 'Current: '}{student.currentName}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{student.email}</td>
                            <td className="p-3 text-sm font-mono text-slate-500 dark:text-slate-400">{student.examCode}</td>
                            {user?.isMasterAdmin && (
                              <td className="p-3 text-center text-sm font-bold text-orange-600">{student.streakCount !== undefined ? student.streakCount : '-'}</td>
                            )}
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleToggleActive(student)}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                                  student.isActive 
                                    ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                    : 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                                }`}
                                title={student.isActive ? (isRtl ? 'تعطيل' : 'Deactivate') : (isRtl ? 'تفعيل' : 'Activate')}
                              >
                                {student.isActive ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                              </button>
                            </td>
                            <td className="p-3 text-center">
                              {deletingId === student.id ? (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleDeleteStudent(student.id)}
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
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingStudent(student);
                                      setEditName(student.name);
                                      setEditEmail(student.email);
                                      setEditPassword('');
                                      setEditExamCode(student.examCode || '');
                                      setEditStreakCount(student.streakCount ?? 0);
                                    }}
                                    className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(student.id)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showHistoryModalFor && (
        <StreakHistoryModal
          student={showHistoryModalFor}
          isOpen={!!showHistoryModalFor}
          onClose={() => setShowHistoryModalFor(null)}
          lang={lang}
        />
      )}
    </AnimatePresence>
  );
}
