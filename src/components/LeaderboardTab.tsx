import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Language } from '../types';
import { Flame, Medal, Trophy, Crown, Loader2 } from 'lucide-react';

interface LeaderboardTabProps {
  user: UserProfile | null;
  lang: Language;
}

export default function LeaderboardTab({ user, lang }: LeaderboardTabProps) {
  const isRtl = lang === 'ar';
  const [leaders, setLeaders] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const q = query(collection(db, 'users'), orderBy('streakCount', 'desc'), limit(20));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as unknown as UserProfile));
        setLeaders(data);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
      </div>
    );
  }

  const getRankBadge = (index: number) => {
    switch(index) {
      case 0: return <Crown className="w-5 h-5 text-yellow-500" />;
      case 1: return <Medal className="w-5 h-5 text-gray-400" />;
      case 2: return <Medal className="w-5 h-5 text-amber-700" />;
      default: return <span className="font-bold text-slate-400 px-1">{index + 1}</span>;
    }
  };

  return (
    <div className="pb-24 max-w-2xl mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white dark:bg-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-zinc-700">
        <div className="space-y-3">
          {leaders.map((leader, index) => {
            const isMe = user?.uid === leader.uid;
            
            // Apply hide name and photo settings
            const hideName = leader.hideNameOnLeaderboard;
            const hidePhoto = leader.hidePhotoOnLeaderboard;
            
            const displayName = hideName && !isMe ? (isRtl ? 'طالب مجهول' : 'Anonymous Student') : leader.name;
            const displayPhoto = hidePhoto && !isMe ? null : leader.photoUrl;
            
            return (
              <div 
                key={leader.uid || index}
                className={`flex items-center justify-between p-3 sm:p-4 rounded-2xl transition-all ${
                  isMe 
                    ? 'bg-[#2196F3]/10 border border-[#2196F3]/30 dark:bg-[#2196F3]/20 dark:border-[#2196F3]/40' 
                    : 'bg-slate-50 dark:bg-zinc-900 border border-transparent hover:border-slate-200 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-8 flex justify-center shrink-0">
                    {getRankBadge(index)}
                  </div>
                  
                  <div className="relative">
                    {displayPhoto ? (
                      <img src={displayPhoto} alt={displayName} className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-zinc-800 shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-400 to-[#2196F3] flex items-center justify-center text-white font-bold text-lg shadow-sm border-2 border-white dark:border-zinc-800">
                        {hidePhoto && !isMe ? '?' : displayName?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h3 className={`font-bold sm:text-lg ${isMe ? 'text-[#2196F3] dark:text-sky-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {displayName} {isMe && (isRtl ? '(أنت)' : '(You)')} {isMe && hideName && (isRtl ? '[اسم مخفي]' : '[Hidden Name]')} {isMe && hidePhoto && (isRtl ? '[صورة مخفية]' : '[Hidden Photo]')}
                    </h3>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    {leader.streakCount || 0} {isRtl ? 'أيام' : 'days'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
