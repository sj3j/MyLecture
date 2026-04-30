import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import TrueCalendarGrid from './TrueCalendarGrid';

interface ProfileStreakCalendarProps {
  userUid: string;
  isRtl: boolean;
}

export default function ProfileStreakCalendar({ userUid, isRtl }: ProfileStreakCalendarProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!userUid) return;
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'streak_history'),
          where('userId', '==', userUid)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => doc.data());
        setHistory(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [userUid]);

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="w-full mt-6">
      <TrueCalendarGrid history={history} isRtl={isRtl} />
    </div>
  );
}
