import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { X, Calendar as CalendarIcon, Download, Loader2, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Language, TRANSLATIONS, Student } from '../types';
import { getAuth } from 'firebase/auth';

interface StreakHistoryModalProps {
  student: Student | any;
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  isMasterAdmin?: boolean;
  onStreakUpdated?: () => void;
}

interface ActivityDay {
  date: string;
  wasActive: boolean;
  freezeUsed: boolean;
  timestamp: Date;
}

export default function StreakHistoryModal({ student, isOpen, onClose, lang, isMasterAdmin, onStreakUpdated }: StreakHistoryModalProps) {
  const t = TRANSLATIONS[lang];
  const auth = getAuth();
  const isRtl = lang === 'ar';
  
  const [history, setHistory] = useState<ActivityDay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Admin Management States
  const [freezeAmount, setFreezeAmount] = useState<number>(0);
  const [editStreakCount, setEditStreakCount] = useState<number | ''>('');
  const [recoveryReason, setRecoveryReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && (student.userUid || student.uid)) {
      fetchHistory();
      // Reset admin states
      setFreezeAmount(0);
      setEditStreakCount(student.streakCount ?? '');
      setRecoveryReason('');
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, student.userUid, student.uid, student.streakCount]);
  
  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const targetUid = student.userUid || student.uid;
      if (!targetUid) {
        setHistory([]);
        setIsLoading(false);
        return;
      }
      
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");

      const res = await fetch(`/api/streak-history/${targetUid}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!res.ok) throw new Error("Failed to fetch streak history");
      
      const { history } = await res.json();
      
      const data: ActivityDay[] = history.map((docData: any) => ({
        date: docData.date,
        wasActive: docData.wasActive,
        freezeUsed: docData.freezeUsed,
        timestamp: new Date(docData.timestamp)
      })).sort((a: any, b: any) => b.date.localeCompare(a.date)); // Descending dates
      
      setHistory(data);
    } catch (err) {
      console.error("Streak history fetch error:", err);
      // Fallback to empty history since we failed to fetch
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrantFreeze = async (e: React.MouseEvent) => {
    e.preventDefault();
    const targetUid = student.userUid || student.uid;
    if (!targetUid || freezeAmount <= 0) return;
    
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/grant-freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userUid: targetUid, amount: freezeAmount })
      });
      if (res.ok) {
        setSuccess(isRtl ? 'تم منح دروع التجميد بنجاح' : 'Freeze tokens granted successfully');
        setFreezeAmount(0);
        onStreakUpdated?.();
      } else throw new Error("API error");
    } catch (err) {
      setError(isRtl ? 'فشل في منح دروع التجميد' : 'Failed to grant freeze tokens');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStreakRecovery = async (e: React.MouseEvent) => {
    e.preventDefault();
    const targetUid = student.userUid || student.uid;
    if (!targetUid || editStreakCount === '' || !recoveryReason) {
      setError(isRtl ? 'يرجى إدخال الستريك الجديد والسبب' : 'Please enter new streak and reason');
      return;
    }
    
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No auth token");
      const res = await fetch("/api/admin/streak-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ userUid: targetUid, studentEmail: student.email, newStreak: editStreakCount, reason: recoveryReason })
      });
      if (res.ok) {
        setSuccess(isRtl ? 'تم استرجاع الستريك بنجاح' : 'Streak recovered successfully');
        setRecoveryReason('');
        onStreakUpdated?.();
      } else throw new Error("API error");
    } catch (err) {
      setError(isRtl ? 'فشل في استرجاع الستريك' : 'Failed to recover streak');
    } finally {
      setIsSubmitting(false);
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

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  
  if (!isOpen) return null;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  
  const monthNames = [
    isRtl ? 'يناير' : 'January', isRtl ? 'فبراير' : 'February', isRtl ? 'مارس' : 'March', 
    isRtl ? 'أبريل' : 'April', isRtl ? 'مايو' : 'May', isRtl ? 'يونيو' : 'June',
    isRtl ? 'يوليو' : 'July', isRtl ? 'أغسطس' : 'August', isRtl ? 'سبتمبر' : 'September', 
    isRtl ? 'أكتوبر' : 'October', isRtl ? 'نوفمبر' : 'November', isRtl ? 'ديسمبر' : 'December'
  ];

  const daysOfWeek = isRtl 
    ? ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const gridDays = [];
  for (let i = 0; i < firstDay; i++) gridDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) gridDays.push(i);

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
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-sky-500" /></div>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={prevMonth} className="px-3 py-1 bg-slate-100 dark:bg-zinc-800 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors font-medium text-slate-700 dark:text-slate-300">
                    &lt;
                  </button>
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 min-w-[150px] text-center">
                    {monthNames[month]} {year}
                  </h3>
                  <button onClick={nextMonth} className="px-3 py-1 bg-slate-100 dark:bg-zinc-800 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors font-medium text-slate-700 dark:text-slate-300">
                    &gt;
                  </button>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  {isRtl ? 'تصدير CSV' : 'Export CSV'}
                </button>
              </div>

              <div className="w-full max-w-lg mx-auto">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {daysOfWeek.map(day => (
                    <div key={day} className="text-center font-bold text-xs text-slate-500 py-2">
                       {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {gridDays.map((dayNum, i) => {
                    if (!dayNum) return <div key={`empty-${i}`} className="aspect-square bg-transparent rounded-xl" />;
                    
                    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                    const record = history.find(h => h.date === dateStr);
                    
                    let bgClass = "bg-slate-100 dark:bg-zinc-800/80 text-slate-600 dark:text-slate-400"; 
                    if (record?.wasActive && record?.freezeUsed) bgClass = "bg-sky-400 dark:bg-sky-500 text-white font-bold ring-2 ring-sky-200 dark:ring-sky-900";
                    else if (record?.wasActive) bgClass = "bg-orange-500 dark:bg-orange-600 text-white font-bold ring-2 ring-orange-200 dark:ring-orange-900 overflow-hidden relative shadow-sm";
                    
                    return (
                      <div 
                        key={'day-' + year + '-' + month + '-' + dayNum}
                        title={`${dateStr}: ${record?.wasActive ? (record.freezeUsed ? 'Freeze Used' : 'Active') : 'Inactive'}`}
                        className={`aspect-square rounded-xl flex items-center justify-center text-sm transition-all cursor-pointer ${bgClass}`}
                      >
                         {dayNum}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="flex gap-4 items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-slate-100 dark:bg-zinc-800 rounded-md"></div> {isRtl ? 'غير نشط' : 'Inactive'}</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-orange-500 dark:bg-orange-600 rounded-md shadow-sm"></div> {isRtl ? 'نشط' : 'Active'}</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-sky-400 dark:bg-sky-500 rounded-md shadow-sm"></div> {isRtl ? 'تجميد مُستخدم' : 'Freeze Used'}</div>
              </div>
              
              <div className="mt-8 bg-slate-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-slate-100 dark:border-zinc-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">{isRtl ? 'كيف يعمل الستريك؟' : 'How does the streak work?'}</h3>
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                  <p><strong>{isRtl ? 'النشاط اليومي:' : 'Daily Activity:'}</strong> {isRtl ? 'كل يوم تفتح فيه التطبيق، يزداد الستريك الخاص بك. يرجى العلم أنّ اليوم يُحسب حسب توقيت العراق.' : 'Every day you open the app, your streak increases by one day. Note that the day restarts according to Iraq timezone.'}</p>
                  <p><strong>{isRtl ? 'دروع التجميد:' : 'Freeze Shields:'}</strong> {isRtl ? 'يتم منح درع التجميد وفقاً لنشاطك المستمر وتفاعلك (الحد الأقصى 3 دروع). سيتم استخدام درع تلقائياً إذا فوتّ يوماً لحماية الستريك من الضياع.' : 'Freeze shields are granted based on your continuous activity (Max: 3 shields). A shield will be used automatically if you miss a day to protect your streak from being lost.'}</p>
                </div>
              </div>
              
              <div className="mt-8 border-t border-slate-100 dark:border-zinc-800 pt-8">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">{isRtl ? 'سجل الأيام المفصل' : 'Detailed Log'}</h3>
                <div className="max-h-64 overflow-y-auto border border-slate-100 dark:border-zinc-800 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-zinc-800/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400 font-bold">{isRtl ? 'التاريخ' : 'Date'}</th>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400 font-bold">{isRtl ? 'نشط' : 'Active'}</th>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400 font-bold">{isRtl ? 'تجميد الستريك' : 'Freeze'}</th>
                        <th className="px-4 py-3 text-slate-500 dark:text-slate-400 font-bold">{isRtl ? 'وقت الخادم' : 'Server Time'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-slate-500">{isRtl ? 'لا توجد بيانات' : 'No data available'}</td>
                        </tr>
                      ) : (
                        history.map((h, i) => (
                          <tr key={i} className="border-t border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{h.date}</td>
                            <td className="px-4 py-3">
                              {h.wasActive ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{isRtl ? 'نعم' : 'Yes'}</span> : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{isRtl ? 'لا' : 'No'}</span>}
                            </td>
                            <td className="px-4 py-3">
                              {h.freezeUsed ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">{isRtl ? 'مُستخدم' : 'Used'}</span> : <span className="text-slate-400">-</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                              {h.timestamp.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {isMasterAdmin && (
                <div className="mt-8 border-t border-orange-200 dark:border-orange-800/30 pt-6">
                  <div className="p-6 bg-orange-50 dark:bg-orange-900/10 rounded-2xl space-y-6 border border-orange-100 dark:border-orange-800/30 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Shield className="w-24 h-24 text-orange-500" />
                    </div>
                    
                    <h3 className="font-bold text-xl text-orange-800 dark:text-orange-300 flex items-center gap-2 relative z-10">
                      <Shield className="w-5 h-5" />
                      {isRtl ? 'إدارة الستريك (للمشرفين فقط)' : 'Streak Management (Master Admin)'}
                    </h3>

                    {error && (
                      <div className="p-3 bg-red-100 text-red-700 rounded-xl text-sm flex items-center gap-2 relative z-10">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl text-sm flex items-center gap-2 relative z-10">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {success}
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-6 relative z-10">
                      <div className="space-y-3 bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-sm border border-orange-100 dark:border-orange-800/30">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 block">
                          {isRtl ? 'منح دروع التجميد' : 'Grant Freeze Tokens'}
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                           {isRtl ? 'إضافة دروع إضافية لتعويض أيام الغياب.' : 'Add extra shields to cover missed days.'}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder={isRtl ? 'عدد الدروع' : 'Tokens'}
                            value={freezeAmount || ''}
                            onChange={(e) => setFreezeAmount(parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-sky-500 transition-all font-medium"
                          />
                          <button
                            onClick={handleGrantFreeze}
                            disabled={isSubmitting || freezeAmount <= 0}
                            className="px-6 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl whitespace-nowrap font-bold transition-all flex items-center gap-2 disabled:cursor-not-allowed"
                          >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {isRtl ? 'منح' : 'Grant'}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-sm border border-orange-100 dark:border-orange-800/30">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 block">
                          {isRtl ? 'استرجاع وتصحيح الستريك' : 'Streak Recovery'}
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                           {isRtl ? 'تعديل قيمة الستريك مباشرة لأسباب تقنية أو استثنائية.' : 'Directly modify streak value for technical or exceptional reasons.'}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder={isRtl ? 'الستريك الجديد' : 'New Streak Value'}
                            value={editStreakCount === '' ? '' : editStreakCount}
                            onChange={(e) => setEditStreakCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                            className="w-2/5 px-4 py-2.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                          />
                          <input
                            type="text"
                            placeholder={isRtl ? 'سبب التعديل...' : 'Reason for edit...'}
                            value={recoveryReason}
                            onChange={(e) => setRecoveryReason(e.target.value)}
                            className="w-3/5 px-4 py-2.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
                          />
                        </div>
                        <button
                          onClick={handleStreakRecovery}
                          disabled={isSubmitting || !recoveryReason || editStreakCount === ''}
                          className="w-full mt-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl whitespace-nowrap transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          {isRtl ? 'تطبيق التعديل' : 'Recover Streak'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}