import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { X, Bell, MessageSquare, BookOpen, Clock } from 'lucide-react';
import { Language, TRANSLATIONS, UserProfile, Homework } from '../types';

const formatTimeAgo = (timestamp: number, isRtl: boolean) => {
  const diffInSeconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (diffInSeconds < 60) return isRtl ? 'الآن' : 'Just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return isRtl ? `منذ ${diffInMinutes} دقيقة` : `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return isRtl ? `منذ ${diffInHours} ساعة` : `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return isRtl ? `منذ ${diffInDays} يوم` : `${diffInDays}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString(isRtl ? 'ar-IQ' : 'en-US', { month: 'short', day: 'numeric' });
};

interface NotificationsModalProps {
  user: UserProfile;
  lang: Language;
  onClose: () => void;
}

interface NotificationItem {
  id: string;
  type: 'mention' | 'homework';
  title: string;
  body: string;
  createdAt: any;
  icon: any;
}

export default function NotificationsModal({ user, lang, onClose }: NotificationsModalProps) {
  const isRtl = lang === 'ar';
  const t = TRANSLATIONS[lang];
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const items: NotificationItem[] = [];
        
        // 1. Fetch Weekly Homeworks (latest 10)
        const hwQuery = query(collection(db, 'homeworks'), orderBy('createdAt', 'desc'), limit(10));
        const hwSnap = await getDocs(hwQuery);
        
        hwSnap.forEach(docSnap => {
          const data = docSnap.data() as Homework;
          items.push({
            id: docSnap.id,
            type: 'homework',
            title: isRtl ? 'واجب جديد' : 'New Homework',
            body: isRtl 
              ? `تم إضافة واجب جديد لمادة ${data.subject === 'organic_chemistry' ? 'الكيمياء العضوية' : data.subject}`
              : `New homework added for ${data.subject}`,
            createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
            icon: BookOpen
          });
        });

        // 2. Fetch Chat Mentions (last 200 messages)
        const chatQuery = query(collection(db, 'chat_messages'), orderBy('createdAt', 'desc'), limit(200));
        const chatSnap = await getDocs(chatQuery);
        
        const possibleMentions = [`@${user.name}`, `@${user.originalName}`, `@${user.email.split('@')[0]}`];
        
        chatSnap.forEach(docSnap => {
          const msg = docSnap.data();
          if (!msg.text) return;
          
          const text = msg.text.toLowerCase();
          const isMentioned = possibleMentions.some(m => m && text.includes(m.toLowerCase()));
          
          if (isMentioned && msg.senderId !== user.uid && msg.senderEmail !== user.email) {
            items.push({
              id: docSnap.id,
              type: 'mention',
              title: isRtl ? ' إشارة جديدة' : 'New Mention',
              body: isRtl 
                ? `قام ${msg.senderName} بذكرك في المحادثة: "${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"`
                : `${msg.senderName} mentioned you: "${msg.text.substring(0, 50)}${msg.text.length > 50 ? '...' : ''}"`,
              createdAt: msg.createdAt,
              icon: MessageSquare
            });
          }
        });

        // Sort combined
        items.sort((a, b) => b.createdAt - a.createdAt);
        setNotifications(items);
      } catch (err) {
        console.error('Error fetching notifications:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [user.name, user.uid, user.email, isRtl]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] shadow-2xl border border-slate-200 dark:border-zinc-800 relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-slate-100 dark:border-zinc-800 bg-sky-50 dark:bg-sky-900/10">
          <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
              {isRtl ? 'إشعارات المحادثة والتطبيق' : 'Chat & App Notifications'}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-zinc-950">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-sky-600 dark:text-sky-400">
              <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin" />
              <p className="text-sm font-medium animate-pulse">{isRtl ? 'جاري تحميل الإشعارات...' : 'Loading notifications...'}</p>
            </div>
          ) : notifications.length > 0 ? (
            notifications.map(item => (
              <div key={item.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 flex gap-4 items-start shadow-sm hover:shadow-md transition-shadow group">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  item.type === 'mention' 
                    ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                    : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                }`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 text-[15px] leading-tight">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      {formatTimeAgo(item.createdAt, isRtl)}
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">
                    {item.body}
                  </p>
                </div>
              </div>
            ))
          ) : (
             <div className="text-center py-12 px-4 flex flex-col items-center justify-center">
               <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 mb-4">
                 <Bell className="w-8 h-8" />
               </div>
               <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">{isRtl ? 'لا توجد إشعارات' : 'No notifications'}</h3>
               <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">{isRtl ? 'سوف تظهر الإشعارات عند وجود واجبات جديدة أو عند الإشارة إليك في المحادثة.' : 'Notifications will appear when new homework is added or someone mentions you in chat.'}</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
