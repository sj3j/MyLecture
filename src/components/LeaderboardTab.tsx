import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, where, documentId, getCountFromServer } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Language } from '../types';
import { Flame, Medal, Trophy, Crown, Loader2, Target, CheckCircle2, RefreshCw } from 'lucide-react';
import { UserMCQStats } from '../types/mcq.types';

interface LeaderboardTabProps {
  user: UserProfile | null;
  lang: Language;
}

export default function LeaderboardTab({ user, lang }: LeaderboardTabProps) {
  const isRtl = lang === 'ar';
  const [activeTab, setActiveTab] = useState<'streak' | 'mcq'>('streak');
  const [streakLeaders, setStreakLeaders] = useState<UserProfile[]>([]);
  const [mcqLeaders, setMcqLeaders] = useState<(UserMCQStats & { profile?: UserProfile })[]>([]);
  const [userStreakRank, setUserStreakRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = async (force = false) => {
    setLoading(true);
    try {
      if (activeTab === 'streak') {
        if (streakLeaders.length === 0 || force) {
          const q = query(collection(db, 'users'), orderBy('streakCount', 'desc'), limit(20));
          const snap = await getDocs(q);
          const data = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as unknown as UserProfile));
          setStreakLeaders(data);
        }
        if (user) {
          const myStreak = user.streakCount || 0;
          if (myStreak > 0) {
            const countQ = query(collection(db, 'users'), where('streakCount', '>', myStreak));
            const countSnap = await getCountFromServer(countQ);
            setUserStreakRank(countSnap.data().count + 1);
          } else {
            setUserStreakRank(null);
          }
        }
      } else {
        if (mcqLeaders.length === 0 || force) {
          const q = query(collection(db, 'userMCQStats'), orderBy('mcqLeaderboardScore', 'desc'), limit(20));
          const snap = await getDocs(q);
          const rawData = snap.docs.map(doc => doc.data() as UserMCQStats);
          
          const userIds = rawData.map(r => r.userId);
          if (userIds.length > 0) {
            const userMap = new Map<string, UserProfile>();
            
            // Fetch users in chunks of 10 to respect Firestore 'in' limits
            const chunkSize = 10;
            for (let i = 0; i < userIds.length; i += chunkSize) {
              const chunk = userIds.slice(i, i + chunkSize);
              if (chunk.length > 0) {
                const chunkQuery = query(collection(db, 'users'), where(documentId(), 'in', chunk));
                const chunkSnap = await getDocs(chunkQuery);
                chunkSnap.forEach(d => userMap.set(d.id, {uid: d.id, ...d.data()} as unknown as UserProfile));
              }
            }
            
            const merged = rawData.map(stat => ({
              ...stat,
              profile: userMap.get(stat.userId)
            }));
            setMcqLeaders(merged);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [activeTab]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLeaderboard(true);
  };

  const getRankBadge = (index: number) => {
    switch(index) {
      case 0: return <Crown className="w-5 h-5 text-yellow-500" />;
      case 1: return <Medal className="w-5 h-5 text-slate-400" />;
      case 2: return <Medal className="w-5 h-5 text-amber-700" />;
      default: return <span className="font-bold text-slate-400 px-1">{index + 1}</span>;
    }
  };

  return (
    <div className="pb-24 max-w-2xl mx-auto relative" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2 mb-4 mx-2">
        <div className="flex bg-slate-200 dark:bg-zinc-800 p-1 rounded-xl flex-1">
          <button
            onClick={() => setActiveTab('streak')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'streak' ? 'bg-white dark:bg-zinc-700 text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            <Flame className="w-4 h-4" />
            {isRtl ? 'الستريك' : 'Streak'}
          </button>
          <button
            onClick={() => setActiveTab('mcq')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'mcq' ? 'bg-white dark:bg-zinc-700 text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
          >
            <Target className="w-4 h-4" />
            {isRtl ? 'دقة MCQ' : 'MCQ Accuracy'}
          </button>
        </div>
        <button onClick={handleRefresh} className="p-3 bg-white dark:bg-zinc-800 text-slate-500 hover:text-sky-500 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-700">
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 dark:border-zinc-700">
        
        {loading && !refreshing ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
          </div>
        ) : activeTab === 'streak' ? (
          <div className="space-y-3">
          {streakLeaders.map((leader, index) => {
             const isMe = user?.uid === leader.uid;
             const hideName = leader.hideNameOnLeaderboard;
             const hidePhoto = leader.hidePhotoOnLeaderboard;
             
             const displayName = hideName && !isMe ? (isRtl ? 'مستخدم مجهول' : 'Anonymous User') : leader.name;
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
                       {displayName} {isMe && (isRtl ? '(أنت)' : '(You)')} 
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
        ) : (
          <div className="space-y-3">
          {mcqLeaders.length === 0 ? (
            <div className="text-center py-10">
              <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">{isRtl ? 'بعدك م حلّيت ولا MCQ، حل حتى ترفع تصنيفك' : 'No MCQ attempts yet, start solving to rank up'}</p>
            </div>
          ) : mcqLeaders.map((leader, index) => {
            const isMe = user?.uid === leader.userId;
            const hideName = leader.profile?.hideNameOnLeaderboard;
            const hidePhoto = leader.profile?.hidePhotoOnLeaderboard;
            
            const displayName = hideName && !isMe ? (isRtl ? 'مستخدم مجهول' : 'Anonymous User') : leader.profile?.name;
            const displayPhoto = hidePhoto && !isMe ? null : leader.profile?.photoUrl;
            
            return (
              <div 
                 key={leader.userId}
                 className={`flex items-center justify-between p-3 sm:p-4 rounded-2xl transition-all ${
                   isMe 
                     ? 'bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-100 dark:border-sky-900/50' 
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
                      {displayName} {isMe && (isRtl ? '(أنت)' : '(You)')}
                    </h3>
                    <p className={`text-xs ${isMe ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500'}`}>
                      {leader.lecturesAttempted} {isRtl ? 'محاضرة' : 'Lectures'} • {isRtl ? 'دقة' : 'Accuracy'} {Math.round(leader.accuracy)}%
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <div className={`flex items-center gap-1.5 font-black text-lg sm:text-xl ${
                    isMe ? 'text-sky-600 dark:text-sky-400' : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {Math.round(leader.mcqLeaderboardScore)} <span className="text-sm font-medium pr-1">نقطة</span>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Rank Chip */}
      {user && (
         <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
           {activeTab === 'mcq' ? (
             mcqLeaders.findIndex(l => l.userId === user.uid) !== -1 ? (
               <div className="bg-slate-900/90 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-xl border border-slate-700/50 flex items-center gap-3">
                 <span className="font-bold text-sm opacity-80">{isRtl ? 'مرتبتك الحالية' : 'Your Rank'}</span>
                 <div className="w-px h-4 bg-slate-700" />
                 <span className="font-black text-lg text-sky-400">#{mcqLeaders.findIndex(l => l.userId === user.uid) + 1}</span>
               </div>
             ) : (
               <div className="bg-slate-900/90 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-xl border border-slate-700/50 flex items-center gap-2 text-sm font-bold">
                 <span>{isRtl ? 'لم تقم بحل أي MCQ بعد' : 'No MCQ solved yet'}</span>
               </div>
             )
           ) : (
             userStreakRank !== null ? (
               <div className="bg-slate-900/90 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-xl border border-slate-700/50 flex items-center gap-3">
                 <span className="font-bold text-sm opacity-80">{isRtl ? 'مرتبتك الحالية' : 'Your Rank'}</span>
                 <div className="w-px h-4 bg-slate-700" />
                 <span className="font-black text-lg text-orange-400">#{userStreakRank}</span>
               </div>
             ) : (
               <div className="bg-slate-900/90 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-xl border border-slate-700/50 flex items-center gap-2 text-sm font-bold">
                 <span>{isRtl ? 'ليس لديك ستريك حالياً' : 'You have no streak yet'}</span>
               </div>
             )
           )}
         </div>
      )}
    </div>
  );
}
