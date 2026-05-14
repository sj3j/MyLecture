import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { History, Award, Calendar } from 'lucide-react';

interface SemesterHistoryListProps {
  userUid: string;
  isRtl: boolean;
}

export default function SemesterHistoryList({ userUid, isRtl }: SemesterHistoryListProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const q = query(
          collection(db, 'users', userUid, 'streakHistory'),
          orderBy('archivedAt', 'desc')
        );
        const snap = await getDocs(q);
        setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error('Error fetching streak history:', err);
      } finally {
        setLoading(false);
      }
    };
    if (userUid) fetchHistory();
  }, [userUid]);

  if (loading) return null;
  if (history.length === 0) return null;

  return (
    <div className="mt-8 border-t border-orange-100 dark:border-orange-800/30 pt-6">
      <h4 className="text-sm font-bold text-orange-900 dark:text-orange-300 mb-4 flex items-center gap-2">
        <History className="w-4 h-4 text-orange-500" />
        {isRtl ? 'سجل الفصول السابقة' : 'Previous Semesters History'}
      </h4>
      <div className="space-y-3">
        {history.map(semester => (
          <div key={semester.id} className="bg-white/60 dark:bg-zinc-800/60 rounded-2xl p-4 border border-orange-100 dark:border-orange-800/30 flex items-center justify-between shadow-sm">
            <div>
               <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                 <Calendar className="w-4 h-4 text-slate-400" />
                 {semester.semesterName}
               </div>
               <div className="text-xs text-slate-500">
                 {semester.archivedAt?.seconds 
                   ? new Date(semester.archivedAt.seconds * 1000).toLocaleDateString(isRtl ? 'ar-IQ' : 'en-US') 
                   : ''}
               </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 font-bold mb-0.5 uppercase tracking-wider">{isRtl ? 'الأطول' : 'Longest'}</p>
                <div className="text-sm sm:text-base font-black text-amber-700 dark:text-amber-400 flex items-center gap-1 justify-end">
                  {semester.longestStreak || 0}
                </div>
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-orange-600 dark:text-orange-400 font-bold mb-0.5 uppercase tracking-wider">{isRtl ? 'النهائي' : 'Final'}</p>
                <div className="text-sm sm:text-base font-black text-orange-700 dark:text-orange-400 flex items-center gap-1 justify-end">
                  {semester.finalStreak || 0}
                  <Award className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
