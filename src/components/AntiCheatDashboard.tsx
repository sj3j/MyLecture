import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { X, ShieldAlert, Trash2, Ban, UserX, AlertTriangle, Eye, RefreshCw } from 'lucide-react';
import { TRANSLATIONS, Language } from '../types';

interface AntiCheatDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export default function AntiCheatDashboard({ isOpen, onClose, lang }: AntiCheatDashboardProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lecturesMap, setLecturesMap] = useState<Record<string, string>>({});
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  const fetchLogs = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // Fetch lectures for mapping
      const lecturesSnap = await getDocs(collection(db, 'lectures'));
      const lMap: Record<string, string> = {};
      lecturesSnap.forEach(d => {
        lMap[d.id] = d.data().title;
      });
      setLecturesMap(lMap);

      // Fetch users for mapping
      const usersSnap = await getDocs(collection(db, 'users'));
      const uMap: Record<string, string> = {};
      usersSnap.forEach(d => {
        uMap[d.id] = d.data().name || d.data().email || d.id;
      });
      setUsersMap(uMap);

      const q = query(collection(db, 'antiCheatLogs'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Group by user+lecture
      const grouped = data.reduce((acc: any, log: any) => {
        const key = `${log.userId}_${log.lectureId}`;
        if (!acc[key]) {
          acc[key] = {
            userId: log.userId,
            lectureId: log.lectureId,
            logs: [],
            latestTimestamp: log.timestamp?.toDate ? log.timestamp.toDate() : new Date()
          };
        }
        acc[key].logs.push(log);
        return acc;
      }, {});

      setLogs(Object.values(grouped));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen]);

  const handleCancelResult = async (userId: string, lectureId: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء نتيجة هذا الطالب لهذه المحاضرة؟')) return;
    
    try {
      // 1. Delete first attempt answer doc
      const answerRef = doc(db, `userMCQAnswers/${userId}/lectures/${lectureId}`);
      await deleteDoc(answerRef);

      // (We could also theoretically adjust stats, but deleting the attempt forces them to restart)

      alert('تم إلغاء النتيجة بنجاح.');
      fetchLogs();
    } catch (e: any) {
      alert('خطأ: ' + e.message);
    }
  };

  const handleBanMCQ = async (userId: string) => {
    if (!window.confirm('هل أنت متأكد من تعليق وصول الطالب للاختبارات؟')) return;
    
    try {
      const userRef = doc(db, `users/${userId}`);
      await updateDoc(userRef, { mcqBanned: true });
      alert('تم حظر الطالب من MCQ.');
    } catch (e: any) {
      alert('خطأ: ' + e.message);
    }
  };

  const handleIgnore = async (logGroup: any) => {
    if (!window.confirm('هل أنت متأكد من تجاهل هذه التنبيهات؟')) return;
    
    try {
      for (const log of logGroup.logs) {
         await deleteDoc(doc(db, 'antiCheatLogs', log.id));
      }
      fetchLogs();
    } catch (e: any) {
      alert('خطأ: ' + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">مراقبة الغش (MCQ)</h2>
          </div>
          <div className="flex gap-2">
             <button onClick={fetchLogs} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors text-red-600">
               <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
             </button>
             <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-gray-500">
               <X className="w-6 h-6" />
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20">
          {errorMsg && (
            <div className="p-4 mb-4 bg-red-50 text-red-600 rounded-xl">
              {errorMsg}
            </div>
          )}

          {logs.length === 0 ? (
            <div className="text-center py-12">
               <ShieldAlert className="w-16 h-16 text-emerald-500 mx-auto mb-4 opacity-50" />
               <p className="text-gray-500 dark:text-zinc-400 font-medium">لا توجد أي نشاطات مشبوهة حالياً. النظام آمن.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((group: any, idx) => {
                 const screenshotCount = group.logs.filter((l: any) => l.type === 'screenshot').length;
                 const backgroundCount = group.logs.filter((l: any) => l.type === 'app_backgrounded').length;

                 return (
                   <div key={idx} className="bg-white dark:bg-zinc-800 border border-red-100 dark:border-red-900/30 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                             <UserX className="w-4 h-4 text-slate-500" />
                             <span className="font-bold text-slate-900 dark:text-white">{usersMap[group.userId] || group.userId}</span>
                             <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 rounded text-xs font-bold">⚠️ مشبوه</span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">المحاضرة: {lecturesMap[group.lectureId] || group.lectureId}</p>
                          <p className="text-xs text-slate-400 mt-1">آخر نشاط: {group.latestTimestamp.toLocaleString('ar-EG')}</p>
                        </div>
                      </div>

                      <div className="flex gap-4 mb-6">
                         {screenshotCount > 0 && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300">
                               📸 تصوير شاشة <span className="text-red-600 px-1 bg-red-100 dark:bg-red-900/30 rounded">{screenshotCount}</span>
                            </div>
                         )}
                         {backgroundCount > 0 && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300">
                               📱 خروج من التطبيق <span className="text-amber-600 px-1 bg-amber-100 dark:bg-amber-900/30 rounded">{backgroundCount}</span>
                            </div>
                         )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                         <button 
                           onClick={() => handleCancelResult(group.userId, group.lectureId)}
                           className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 font-bold text-sm rounded-xl transition-colors"
                         >
                           <Trash2 className="w-4 h-4" />
                           إلغاء النتيجة
                         </button>
                         <button 
                           onClick={() => handleBanMCQ(group.userId)}
                           className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-200 dark:text-slate-900 font-bold text-sm rounded-xl transition-colors"
                         >
                           <Ban className="w-4 h-4" />
                           حظر MCQ
                         </button>
                         <button 
                           onClick={() => handleIgnore(group)}
                           className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-slate-400 font-bold text-sm rounded-xl transition-colors"
                         >
                           <Eye className="w-4 h-4" />
                           تجاهل وحذف
                         </button>
                      </div>
                   </div>
                 );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
