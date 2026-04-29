import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, Check, X, AlertCircle, RefreshCw, Trash2, Save, Undo } from 'lucide-react';
import { collection, query, getDocs, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { UserProfile, CATEGORIES, TRANSLATIONS } from '../../types';
import { parseGradeFile, ParsedRow } from '../../services/gradeFileParser';
import { matchGradesToStudents } from '../../services/fuzzyMatchingService';
import { MatchedResult, GradeBatch } from '../../types/grades.types';
import { confirmDegreeBatchClient, undoDegreeBatch } from '../../services/adminGradeService';
import { motion, AnimatePresence } from 'motion/react';

export interface AdminGradesScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AdminGradesScreen({ isOpen, onClose }: AdminGradesScreenProps) {
  const isMasterAdmin = auth.currentUser?.email === 'almdrydyl335@gmail.com' || auth.currentUser?.email === 'fenix.admin@gmail.com';
  
  if (isOpen && !isMasterAdmin) {
    onClose();
    return null;
  }
  
  const [tab, setTab] = useState<'upload' | 'history'>('upload');

  // Upload/Review State
  const [examName, setExamName] = useState('');
  const [material, setMaterial] = useState('');
  const [maxDegree, setMaxDegree] = useState('100');
  const [isParsing, setIsParsing] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [matchedResults, setMatchedResults] = useState<MatchedResult[]>([]);
  const [sortUnmatchedFirst, setSortUnmatchedFirst] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmingBatchId, setConfirmingBatchId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // History State
  const [batches, setBatches] = useState<any[]>([]);

  // Fetch all students exactly once
  useEffect(() => {
    if (!isOpen) return;
    const fetchStudents = async () => {
      try {
        // Fetch registration names from students collection
        const studentsSnap = await getDocs(collection(db, 'students'));
        const registeredStudentsMap = new Map<string, any>();
        studentsSnap.docs.forEach(d => {
          const data = d.data();
          const emailKey = (data.email || d.id).toLowerCase().trim();
          registeredStudentsMap.set(emailKey, { id: d.id, ...data });
        });

        const q = query(collection(db, 'users'), where('role', '==', 'student'));
        const usersSnap = await getDocs(q);
        
        const addedEmails = new Set<string>();

        const st: (UserProfile & { isRegistered?: boolean })[] = usersSnap.docs.map(d => {
          const data = d.data();
          const email = (data.email || d.id).toLowerCase().trim();
          addedEmails.add(email);
          const regData = registeredStudentsMap.get(email);
          const regName = regData?.name || null;
          return { 
            uid: d.id, 
            ...data, 
            originalName: regName ? regName : `${data.name || email} (غير مسجل رسمياً)`,
            isRegistered: !!regName
          } as UserProfile & { isRegistered?: boolean };
        }); 

        // Important: Add students who are registered but have NEVER logged into the app yet
        registeredStudentsMap.forEach((data, email) => {
          if (!addedEmails.has(email)) {
            // The uid for custom token logic is implicitly their email.
            // Using data.id (which is the doc id in 'students', usually their email).
            st.push({
              uid: data.id, 
              email: email,
              name: data.name || email,
              originalName: data.name || email,
              role: data.role || 'student',
              isRegistered: true,
              favorites: [],
              studied: [],
              completedWeeklyTasks: [],
              notificationPreferences: { lectures: true, announcements: true, chat: true, records: true, homeworks: true }
            } as UserProfile & { isRegistered?: boolean });
          }
        });
        
        setStudents(st);
      } catch (err) {
        console.error("Error fetching students:", err);
      }
    };
    fetchStudents();
  }, [isOpen]);

  // Fetch batches history
  useEffect(() => {
    if (!isOpen) return;
    if (tab === 'history') {
      const q = query(collection(db, 'degreeBatches'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        setBatches(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      });
      return () => unsub();
    }
  }, [tab, isOpen]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!examName.trim()) {
      setErrorMsg("يرجى إدخال اسم الاختبار/السعي أولاً");
      return;
    }
    
    if (!material) {
      setErrorMsg("يرجى اختيار المادة الدراسية");
      return;
    }

    setErrorMsg('');
    setIsParsing(true);
    try {
      const parsedStats = await parseGradeFile(file);
      setIsParsing(false);
      setIsMatching(true);
      
      const results = matchGradesToStudents(parsedStats, students);
      setMatchedResults(results);
    } catch (err: any) {
      setErrorMsg("فشل تحليل الملف: " + err.message);
    } finally {
      setIsParsing(false);
      setIsMatching(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleManualMatchToggle = (rowId: string, studentId: string | null) => {
    setMatchedResults(prev => prev.map(r => {
      if (r.rowId === rowId) {
        const student = students.find(s => s.uid === studentId);
        return {
          ...r,
          matchedUserId: student?.uid || null,
          matchedUserName: student?.name || null,
          matchScore: student ? 1.0 : 0
        };
      }
      return r;
    }));
  };

  const handleManualDegreeChange = (rowId: string, newDegree: string) => {
    setMatchedResults(prev => prev.map(r => 
      r.rowId === rowId ? { ...r, degree: newDegree } : r
    ));
  };

  const addManualRow = () => {
    const newRowId = `manual_${Date.now()}`;
    setMatchedResults(prev => [{
      rowId: newRowId,
      excelName: 'إدخال يدوي',
      degree: '',
      matchedUserId: null,
      matchedUserName: null,
      matchScore: 0,
      originalRowData: {}
    }, ...prev]);
  };

  const removeRowRowId = (rowId: string) => {
    setMatchedResults(prev => prev.filter(r => r.rowId !== rowId));
  };

  const handleConfirmBatch = async () => {
    if (!matchedResults.length) return;
    setIsSaving(true);
    try {
       await confirmDegreeBatchClient(examName, matchedResults, Number(maxDegree) || 100, material);
       setMatchedResults([]);
       setExamName('');
       setMaterial('');
       setMaxDegree('100');
       setTab('history');
    } catch (err: any) {
      setErrorMsg("فشل الحفظ: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = async (batchId: string) => {
    setIsDeleting(true);
    setErrorMsg('');
    try {
      await undoDegreeBatch(batchId);
      setConfirmingBatchId(null);
    } catch (err: any) {
      setErrorMsg("فشل التراجع: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedStudentIds = new Set(matchedResults.map(r => r.matchedUserId).filter(Boolean));

  const sortedMatchedResults = [...matchedResults].sort((a, b) => {
    if (sortUnmatchedFirst) {
      const aMatched = !!a.matchedUserId;
      const bMatched = !!b.matchedUserId;
      if (aMatched === bMatched) return 0;
      return aMatched ? 1 : -1;
    }
    return 0;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="p-4 sm:p-6 lg:p-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold dark:text-white mt-1">إدارة الدرجات والسعيّات</h1>
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg">
                  <button 
                    className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${tab === 'upload' ? 'bg-white dark:bg-zinc-700 shadow text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                    onClick={() => setTab('upload')}
                  >
                    رفع كشف جديد
                  </button>
                  <button 
                    className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${tab === 'history' ? 'bg-white dark:bg-zinc-700 shadow text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
                    onClick={() => setTab('history')}
                  >
                    سجل الكشوفات
                  </button>
                </div>
              </div>

      {errorMsg && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 p-4 rounded-lg mb-6 flex items-center gap-2 border border-red-100 dark:border-red-900/30">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-6">
          {matchedResults.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-6 sm:p-10 text-center">
              <FileSpreadsheet className="w-16 h-16 text-emerald-100 dark:text-emerald-900/50 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">رفع نتائج وسعيّات جديدة</h2>
              <p className="text-gray-500 dark:text-zinc-400 max-w-md mx-auto mb-8">
                قم بتسمية الاختبار، ثم ارفع ملف إكسيل أو CSV. سيحاول النظام تلقائياً مطابقة أسماء الطلاب مع قاعدة البيانات.
              </p>

              <div className="max-w-md mx-auto mb-6 flex flex-col sm:flex-row gap-4">
                <div className="flex-1 text-right">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اسم الاختبار أو التقييم *</label>
                  <input 
                    type="text"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder="مثال: سعي الفصل الأول، امتحان الميدترم..."
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                  />
                </div>
                <div className="w-full sm:w-32 text-right">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الدرجة السقف</label>
                  <input 
                    type="number"
                    value={maxDegree}
                    onChange={(e) => setMaxDegree(e.target.value)}
                    placeholder="100"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                  />
                </div>
              </div>

              <div className="max-w-md mx-auto mb-8 text-right">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المادة الدراسية *</label>
                <select
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:text-white appearance-none"
                >
                  <option value="" disabled>اختر المادة الدراسية...</option>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>
                      {TRANSLATIONS.ar[c.labelKey]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-w-md mx-auto relative group">
                <input 
                  type="file" 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={isParsing || isMatching}
                />
                <div className="bg-emerald-50 border-2 border-dashed border-emerald-300 dark:border-emerald-900/50 dark:bg-emerald-900/10 rounded-2xl p-8 transition-colors group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/20 flex flex-col items-center justify-center">
                  {(isParsing || isMatching) ? (
                    <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
                  ) : (
                    <Upload className="w-8 h-8 text-emerald-500 mb-3" />
                  )}
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    {isParsing ? 'جاري تحليل الملف...' : isMatching ? 'جاري مطابقة الأسماء...' : 'اضغط لاختيار ملف Excel / CSV'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
               <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                 <div>
                   <h2 className="text-lg font-bold text-gray-900 dark:text-white">مراجعة كشف: {examName}</h2>
                   <div className="flex items-center gap-4 mt-1">
                     <p className="text-sm text-gray-500 dark:text-zinc-400">
                       تم العثور على {matchedResults.length} صف. المطابق: {matchedResults.filter(r => r.matchedUserId).length}
                     </p>
                     <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                       <input 
                         type="checkbox" 
                         checked={sortUnmatchedFirst} 
                         onChange={(e) => setSortUnmatchedFirst(e.target.checked)}
                         className="rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                       />
                       <span className="text-gray-600 dark:text-gray-300 font-bold">فرز "غير مطابق" أولاً</span>
                     </label>
                   </div>
                 </div>
                 <div className="flex gap-2 w-full sm:w-auto">
                   <button
                     onClick={addManualRow}
                     disabled={isSaving}
                     className="flex-1 sm:flex-none px-4 py-2 border border-emerald-300 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 font-medium transition-colors whitespace-nowrap"
                   >
                     + إضافة طالب
                   </button>
                   <button 
                     onClick={() => setMatchedResults([])}
                     disabled={isSaving}
                     className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 font-medium transition-colors"
                   >
                     إلغاء
                   </button>
                   <button 
                     onClick={handleConfirmBatch}
                     disabled={isSaving}
                     className="flex-1 sm:flex-none px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                   >
                     {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                     اعتماد وحفظ
                   </button>
                 </div>
               </div>

               <div className="overflow-x-auto">
                 <table className="w-full text-sm text-right text-gray-500 dark:text-zinc-400 mt-4">
                   <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-800/50 dark:text-zinc-300">
                     <tr>
                       <th className="px-6 py-3">الاسم في الكشف</th>
                       <th className="px-6 py-3">الدرجة</th>
                       <th className="px-6 py-3">المطابقة مع النظام</th>
                       <th className="px-6 py-3">إجراء</th>
                     </tr>
                   </thead>
                   <tbody>
                     {sortedMatchedResults.map((result) => (
                       <tr key={result.rowId} className="border-b border-gray-50 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                         <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                           {result.rowId.startsWith('manual_') ? (
                             <input
                               type="text"
                               value={result.excelName === 'إدخال يدوي' ? '' : result.excelName}
                               onChange={(e) => setMatchedResults(prev => prev.map(r => r.rowId === result.rowId ? { ...r, excelName: e.target.value } : r))}
                               className="w-full max-w-[150px] px-2 py-1 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-md focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                               placeholder="اسم الطالب"
                             />
                           ) : (
                             <div>
                               <div className="font-bold text-gray-900 dark:text-white">📄 {result.excelName}</div>
                               {result.matchedUserId && (
                                 <div className="text-[10px] text-gray-500 dark:text-zinc-400 mt-1 space-y-0.5 border-t border-gray-100 dark:border-zinc-800 pt-1">
                                   <div>👤 الاسم: {result.matchedUserOriginalName || result.matchedUserName}</div>
                                   {result.matchedUserOriginalName && result.matchedUserOriginalName !== result.matchedUserName && (
                                     <div className="text-gray-400 dark:text-zinc-500 text-[9px]">الاسم الحالي: {result.matchedUserName}</div>
                                   )}
                                   <div className="text-sky-600 dark:text-sky-400">🎯 الثقة: {Math.round(result.matchScore * 100)}%</div>
                                 </div>
                               )}
                             </div>
                           )}
                         </td>
                         <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400">
                           {result.rowId.startsWith('manual_') ? (
                             <input
                               type="text"
                               value={result.degree}
                               onChange={(e) => handleManualDegreeChange(result.rowId, e.target.value)}
                               className="w-20 px-2 py-1 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-md focus:ring-emerald-500 focus:border-emerald-500 dark:text-white"
                               placeholder="الدرجة"
                             />
                           ) : (
                             result.degree
                           )}
                         </td>
                         <td className="px-6 py-4">
                           <select
                              value={result.matchedUserId || ''}
                              onChange={(e) => handleManualMatchToggle(result.rowId, e.target.value || null)}
                              className={`w-full max-w-[200px] border-gray-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-900 dark:text-white focus:ring-emerald-500 focus:border-emerald-500
                                ${result.matchedUserId && result.matchScore > 0.8 ? 'border-emerald-500 ring-1 ring-emerald-500' : 
                                  result.matchedUserId ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-red-400 ring-1 ring-red-400'}
                              `}
                           >
                             <option value="">غير متطابق (لن يتم الحفظ)</option>
                             {students.filter(s => !selectedStudentIds.has(s.uid) || result.matchedUserId === s.uid).map(s => {
                               const showAlias = s.name && s.originalName && !s.originalName.includes(s.name) && s.originalName !== s.name;
                               return (
                                 <option key={s.uid} value={s.uid}>
                                   {s.originalName} {showAlias ? `(الاسم بحسابه: ${s.name})` : ''} - {s.email || s.uid}
                                 </option>
                               );
                             })}
                           </select>
                           {result.matchedUserId && result.matchScore < 1 && (
                             <div className="mt-1 text-[10px] text-yellow-600 dark:text-yellow-500">تمت مطابقة تقريبية</div>
                           )}
                         </td>
                         <td className="px-6 py-4">
                           <button onClick={() => removeRowRowId(result.rowId)} className="text-red-500 hover:text-red-700 p-1">
                             <Trash2 className="w-5 h-5" />
                           </button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          {batches.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-zinc-400">لا توجد كشوفات محفوظة مسبقاً</div>
          ) : (
            batches.map(batch => (
              <div key={batch.id} className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {batch.examName}
                    {batch.material && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {TRANSLATIONS.ar[CATEGORIES.find(c => c.value === batch.material)?.labelKey as keyof typeof TRANSLATIONS.ar] || batch.material}
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-4 mt-2 text-sm text-gray-500 dark:text-zinc-400">
                    <span>التاريخ: {batch.createdAt?.toDate ? new Date(batch.createdAt.toDate()).toLocaleDateString('ar-EG') : 'الآن'}</span>
                    <span>الطلاب المقيمين: {batch.stats.matched}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {confirmingBatchId === batch.id ? (
                    <>
                      <button 
                        onClick={() => handleUndo(batch.id)}
                        disabled={isDeleting}
                        className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl font-medium text-sm transition-colors flex items-center gap-2"
                      >
                        {isDeleting ? 'جاري الحذف...' : 'تأكيد الحذف نهائياً'}
                      </button>
                      <button 
                        onClick={() => setConfirmingBatchId(null)}
                        disabled={isDeleting}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 rounded-xl font-medium text-sm transition-colors"
                      >
                        إلغاء
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => setConfirmingBatchId(batch.id)}
                      className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-xl font-medium text-sm transition-colors flex items-center gap-2"
                    >
                      <Undo className="w-4 h-4" />
                      حذف الكشف والتراجع
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
