import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { History, Award, Calendar, Target, Flame, Hash } from 'lucide-react';

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
        // Streak and MCQ are archived under the same season id, so the two
        // subcollections merge into one row per season.
        const [streakSnap, mcqSnap] = await Promise.all([
          getDocs(query(collection(db, 'users', userUid, 'streakHistory'), orderBy('archivedAt', 'desc'))),
          getDocs(query(collection(db, 'users', userUid, 'mcqHistory'), orderBy('archivedAt', 'desc')))
            .catch(() => null), // collection may not exist yet
        ]);

        const merged = new Map<string, any>();
        streakSnap.docs.forEach(d => {
          merged.set(d.id, { id: d.id, streak: d.data(), archivedAt: d.data().archivedAt });
        });
        mcqSnap?.docs.forEach(d => {
          const existing = merged.get(d.id);
          if (existing) existing.mcq = d.data();
          else merged.set(d.id, { id: d.id, mcq: d.data(), archivedAt: d.data().archivedAt });
        });

        setHistory(
          Array.from(merged.values())
            .sort((a, b) => (b.archivedAt?.seconds || 0) - (a.archivedAt?.seconds || 0))
        );
      } catch (err) {
        console.error('Error fetching season history:', err);
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
        {isRtl ? 'سجل المواسم السابقة' : 'Previous Seasons'}
      </h4>
      <div className="space-y-3">
        {history.map(season => {
          const streak = season.streak;
          const mcq = season.mcq;
          const name = streak?.semesterName || streak?.seasonName || mcq?.seasonName || season.id;
          const date = season.archivedAt?.seconds
            ? new Date(season.archivedAt.seconds * 1000).toLocaleDateString(isRtl ? 'ar-IQ' : 'en-US')
            : '';

          return (
            <div key={season.id} className="bg-white/60 dark:bg-zinc-800/60 rounded-2xl p-4 border border-orange-100 dark:border-orange-800/30 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {name}
                </div>
                <div className="text-xs text-slate-500">{date}</div>
              </div>

              {streak && (
                <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-zinc-700/60">
                  <span className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5" />
                    {isRtl ? 'الستريك' : 'Streak'}
                  </span>
                  <div className="flex items-center gap-4 text-end">
                    {streak.rank != null && (
                      <Stat label={isRtl ? 'الترتيب' : 'Rank'} value={`#${streak.rank}`} tone="sky" />
                    )}
                    <Stat label={isRtl ? 'الأطول' : 'Longest'} value={streak.longestStreak || 0} tone="amber" />
                    <Stat label={isRtl ? 'النهائي' : 'Final'} value={streak.finalStreak || 0} tone="orange" />
                  </div>
                </div>
              )}

              {mcq && (
                <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-zinc-700/60">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    MCQ
                  </span>
                  <div className="flex items-center gap-4 text-end">
                    {mcq.rank != null && (
                      <Stat label={isRtl ? 'الترتيب' : 'Rank'} value={`#${mcq.rank}`} tone="sky" />
                    )}
                    <Stat label={isRtl ? 'النقاط' : 'Score'} value={mcq.score ?? 0} tone="sky" />
                    <Stat label={isRtl ? 'الأسئلة' : 'Questions'} value={`${mcq.totalCorrect ?? 0}/${mcq.totalAnswered ?? 0}`} tone="slate" />
                    <Stat label={isRtl ? 'الدقة' : 'Accuracy'} value={`${Math.round(mcq.accuracy ?? 0)}%`} tone="emerald" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  sky: 'text-sky-700 dark:text-sky-400',
  amber: 'text-amber-700 dark:text-amber-400',
  orange: 'text-orange-700 dark:text-orange-400',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  slate: 'text-slate-700 dark:text-slate-300',
};

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold mb-0.5 uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <div className={`text-sm sm:text-base font-black ${TONES[tone] || TONES.slate}`}>{value}</div>
    </div>
  );
}
