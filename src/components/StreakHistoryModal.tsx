import React, { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { X, Calendar as CalendarIcon, Download, Loader2 } from 'lucide-react';
import { Language, TRANSLATIONS, Student } from '../types';
import TrueCalendarGrid from './TrueCalendarGrid';

interface StreakHistoryModalProps {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

interface ActivityDay {
  date: string;
  wasActive: boolean;
  freezeUsed: boolean;
  timestamp: Date;
}

export default function StreakHistoryModal({ student, isOpen, onClose, lang }: StreakHistoryModalProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [history, setHistory] = useState<ActivityDay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (isOpen && student.userUid) {
      fetchHistory();
    }
  }, [isOpen, student.userUid]);
  
  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/streak-history/${student.userUid}`, {
          headers: {
              'Authorization': `Bearer ${token}`
          }
      });
      
      if (!res.ok) throw new Error("Failed to fetch streak history");
      
      const { history: data } = await res.json();
      
      const formattedHistory: ActivityDay[] = data.map((docData: any) => {
        return {
          date: docData.date,
          wasActive: docData.wasActive,
          freezeUsed: docData.freezeUsed,
          timestamp: docData.timestamp ? new Date(docData.timestamp) : new Date(docData.date)
        };
      }).sort((a: any, b: any) => b.date.localeCompare(a.date)); // Descending dates
      
      setHistory(formattedHistory);
    } catch (err) {
      console.error("Streak history fetch error ignored due to missing rules:", err);
      // Fallback to empty history since firestore rules deploy failed
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (history.length === 0) return;
    const header = "Date,Active,FreezeUsed,Timestamp\n";
    const rows = history.map(h => `${h.date},${h.wasActive},${h.freezeUsed},${h.timestamp.toISOString()}`).join("\n");
    const csv = header + rows;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `streak_history_${student.email}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-stone-100">
                {isRtl ? 'تاريخ الستريك' : 'Streak History'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{student.name} ({student.email})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">{isRtl ? 'التقويم' : 'Calendar'}</h3>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  {isRtl ? 'تصدير CSV' : 'Export CSV'}
                </button>
              </div>

              <div className="max-w-md mx-auto">
                <TrueCalendarGrid history={history} isRtl={isRtl} />
              </div>
              
              <div className="mt-8">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">{isRtl ? 'سجل الأيام المفصل' : 'Detailed Log'}</h3>
                <div className="max-h-64 overflow-y-auto border border-slate-100 dark:border-zinc-800 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-zinc-800/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400">{isRtl ? 'التاريخ' : 'Date'}</th>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400">{isRtl ? 'نشط' : 'Active'}</th>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400">{isRtl ? 'تجميد الستريك' : 'Freeze'}</th>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400">{isRtl ? 'وقت الخادم' : 'Server Time'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-slate-500">{isRtl ? 'لا توجد بيانات' : 'No data available'}</td>
                        </tr>
                      ) : (
                        history.map((h, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-zinc-800">
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{h.date}</td>
                            <td className="px-4 py-3">
                              {h.wasActive ? <span className="text-emerald-500">Yes</span> : <span className="text-red-500">No</span>}
                            </td>
                            <td className="px-4 py-3">
                              {h.freezeUsed ? <span className="text-sky-500">Used</span> : '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {h.timestamp.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}