import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Users, Loader2, AlertCircle, CheckCircle2, XCircle, Upload } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Language, TRANSLATIONS, Student, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

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

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/students');
      if (!response.ok) throw new Error('Failed to fetch students');
      const data = await response.json();
      setStudents(data.students);
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
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, examCode })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add student');
      }

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
      const response = await fetch(`/api/admin/students/${encodeURIComponent(student.id)}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !student.isActive })
      });
      
      if (!response.ok) throw new Error('Failed to toggle status');
      
      setStudents(students.map(s => s.id === student.id ? { ...s, isActive: !s.isActive } : s));
    } catch (err) {
      console.error('Error toggling student status:', err);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/students/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete student');
      
      setStudents(students.filter(s => s.id !== id));
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting student:', err);
    }
  };

  const handleDeleteAllStudents = async () => {
    try {
      const response = await fetch('/api/admin/students', {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete all students');
      
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
      const response = await fetch(`/api/admin/students/${encodeURIComponent(editingStudent.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          newEmail: editEmail,
          name: editName, 
          password: editPassword, 
          examCode: editExamCode 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update student');
      }

      setSuccess(isRtl ? 'تم تحديث الطالب بنجاح' : 'Student updated successfully');
      setEditingStudent(null);
      fetchStudents();
    } catch (err: any) {
      console.error('Error updating student:', err);
      setError(err.message || (isRtl ? 'فشل تحديث الطالب' : 'Failed to update student'));
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
      
      // Assuming CSV format: name,email,password,examCode
      let addedCount = 0;
      let errorCount = 0;

      // Skip header row if it exists
      const startIndex = rows[0].toLowerCase().includes('name') ? 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const [csvName, csvEmail, csvPassword, csvExamCode] = rows[i].split(',').map(s => s.trim());
        
        if (csvName && csvEmail && csvPassword && csvExamCode) {
          try {
            const response = await fetch('/api/admin/students', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                name: csvName, 
                email: csvEmail, 
                password: csvPassword, 
                examCode: csvExamCode 
              })
            });
            if (response.ok) {
              addedCount++;
            } else {
              errorCount++;
            }
          } catch (err) {
            errorCount++;
          }
        }
      }

      setSuccess(isRtl ? `تمت إضافة ${addedCount} طالب. أخطاء: ${errorCount}` : `Added ${addedCount} students. Errors: ${errorCount}`);
      fetchStudents();
    } catch (err) {
      console.error('CSV upload error:', err);
      setError(isRtl ? 'فشل قراءة الملف' : 'Failed to read file');
    } finally {
      setIsLoading(false);
      if (e.target) e.target.value = ''; // Reset file input
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {isRtl ? 'قائمة الطلاب' : 'Student List'} ({students.length})
                  </h3>
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
                  ) : students.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
                      <Users className="w-12 h-12 mb-4 opacity-50" />
                      <p>{isRtl ? 'لا يوجد طلاب مسجلين' : 'No students registered'}</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 dark:bg-zinc-800 sticky top-0 z-10">
                        <tr>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'الاسم' : 'Name'}</th>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'البريد' : 'Email'}</th>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300">{isRtl ? 'الكود' : 'Code'}</th>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'الحالة' : 'Status'}</th>
                          <th className="p-3 text-sm font-bold text-slate-600 dark:text-slate-300 text-center">{isRtl ? 'إجراء' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => (
                          <tr key={student.id} className="border-b border-slate-200 dark:border-zinc-700/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors">
                            <td className="p-3 text-sm font-medium text-slate-900 dark:text-stone-100">{student.name}</td>
                            <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{student.email}</td>
                            <td className="p-3 text-sm font-mono text-slate-500 dark:text-slate-400">{student.examCode}</td>
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
    </AnimatePresence>
  );
}
