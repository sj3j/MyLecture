import React, { useState, useEffect, useRef } from 'react';
import { Language, TRANSLATIONS, UserProfile } from '../types';
import { Send, Settings, Trash2, Power, Clock, StopCircle, RefreshCw, Archive, Bell, MessageSquare } from 'lucide-react';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc, doc, getDoc, updateDoc, writeBatch, limit, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  id: string;
  text: string;
  senderName: string;
  senderEmail: string;
  senderAvatar: string;
  timestamp: any;
  createdAt: number;
}

interface ChatSettings {
  isChatOpen: boolean;
  messageCooldown: number;
  closedMessage: string;
  latestBundleUrl?: string;
}

interface ChatScreenProps {
  user: UserProfile | null;
  lang: Language;
}

export default function ChatScreen({ user, lang }: ChatScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const isAdminOrModerator = user?.role === 'admin' || user?.role === 'moderator';
  const CHAT_DOC_ID = 'config';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<ChatSettings>({
    isChatOpen: false,
    messageCooldown: 30,
    closedMessage: 'الشات مغلق حالياً'
  });
  
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [showAdminControls, setShowAdminControls] = useState(false);
  const [isBundling, setIsBundling] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track last visible document for pagination
  const [lastVisibleMessageId, setLastVisibleMessageId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Auto scroll
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Cooldown timer
  useEffect(() => {
    if (cooldownRemaining > 0) {
      const timer = setTimeout(() => setCooldownRemaining(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownRemaining]);

  // Load Settings
  const loadSettings = async () => {
    try {
      const settingsSnap = await getDoc(doc(db, 'chat_settings', CHAT_DOC_ID));
      if (settingsSnap.exists()) {
        setSettings(settingsSnap.data() as ChatSettings);
      } else if (isAdminOrModerator) {
        // Initialize if not exists
        const defaultSettings = { isChatOpen: true, messageCooldown: 30, closedMessage: 'الشات مغلق حالياً' };
        await updateDoc(doc(db, 'chat_settings', CHAT_DOC_ID), defaultSettings).catch(async () => {
          // If update fails, might need to set (if doc doesn't exist)
           try {
             const setDoc = (await import('firebase/firestore')).setDoc;
             await setDoc(doc(db, 'chat_settings', CHAT_DOC_ID), defaultSettings);
           } catch(e) {}
        });
        setSettings(defaultSettings);
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  // Poll Settings every 15 seconds
  useEffect(() => {
    loadSettings();
    const interval = setInterval(loadSettings, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial messages
  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const q = query(
        collection(db, 'chat_messages'),
        orderBy('timestamp', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      
      const loadedMessages: ChatMessage[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        loadedMessages.push({
          id: doc.id,
          text: data.text || '',
          senderName: data.senderName || '',
          senderEmail: data.senderEmail || '',
          senderAvatar: data.senderAvatar || '',
          timestamp: data.timestamp,
          createdAt: data.timestamp?.toMillis() || Date.now()
        });
      });
      
      if (loadedMessages.length > 0) {
        setMessages(loadedMessages.reverse()); // Reverse to show oldest first at top
        setLastVisibleMessageId(snapshot.docs[snapshot.docs.length - 1].id);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom('auto'), 100);
    }
  };

  // Poll new messages
  useEffect(() => {
    fetchMessages();

    let lastPollTime = Date.now();
    const pollInterval = setInterval(async () => {
      try {
        // Fetch messages newer than lastPollTime
        const ts = new Date(lastPollTime);
        const q = query(
          collection(db, 'chat_messages'),
          where('timestamp', '>', ts),
          orderBy('timestamp', 'asc')
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const newMessages: ChatMessage[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            // Prevent duplicates
            if (!messages.find(m => m.id === doc.id)) {
              newMessages.push({
                id: doc.id,
                text: data.text || '',
                senderName: data.senderName || '',
                senderEmail: data.senderEmail || '',
                senderAvatar: data.senderAvatar || '',
                timestamp: data.timestamp,
                createdAt: data.timestamp?.toMillis() || Date.now()
              });
            }
          });
          
          if (newMessages.length > 0) {
            setMessages(prev => [...prev, ...newMessages]);
            // Only scroll to bottom if user is already near bottom
            const container = containerRef.current;
            if (container) {
              const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
              if (isNearBottom) {
                setTimeout(() => scrollToBottom(), 100);
              }
            }
          }
        }
        lastPollTime = Date.now();
      } catch (e) {
        console.error('Failed polling', e);
      }
    }, 10000); // 10 seconds polling for messages

    return () => clearInterval(pollInterval);
  }, []);

  // Check Local Storage Cooldown matching user
  useEffect(() => {
    if (!user) return;
    const saveKey = `chat_cooldown_${user.uid}`;
    const savedTime = localStorage.getItem(saveKey);
    if (savedTime) {
      const elapsed = Math.floor((Date.now() - parseInt(savedTime)) / 1000);
      if (elapsed < settings.messageCooldown) {
        setCooldownRemaining(settings.messageCooldown - elapsed);
      } else {
        localStorage.removeItem(saveKey);
      }
    }
  }, [user, settings.messageCooldown]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !settings.isChatOpen || cooldownRemaining > 0 || !user) return;
    if (!isAdminOrModerator) {
      if (cooldownRemaining > 0) return;
    }

    const messageText = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    try {
      const docRef = await addDoc(collection(db, 'chat_messages'), {
        text: messageText,
        senderName: user.name,
        senderEmail: user.email,
        senderAvatar: user.name.charAt(0).toUpperCase(),
        timestamp: serverTimestamp()
      });

      // Optimistic UI update
      setMessages(prev => [...prev, {
        id: docRef.id,
        text: messageText,
        senderName: user.name,
        senderEmail: user.email,
        senderAvatar: user.name.charAt(0).toUpperCase(),
        timestamp: new Date(),
        createdAt: Date.now()
      }]);
      setTimeout(() => scrollToBottom(), 100);

      // Start cooldown if not admin
      if (!isAdminOrModerator) {
        setCooldownRemaining(settings.messageCooldown);
        localStorage.setItem(`chat_cooldown_${user.uid}`, Date.now().toString());
      }
    } catch (e) {
      console.error('Failed to send message', e);
    } finally {
      setIsSending(false);
    }
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    
    // Feature Extension: Bundle Loader
    // We try to load a bundle first if there are old messages
    if (settings.latestBundleUrl) {
      try {
        const res = await fetch(settings.latestBundleUrl);
        if (res.ok) {
          const bundleData = await res.arrayBuffer();
          const { loadBundle } = await import('firebase/firestore');
          await loadBundle(db, bundleData);
          console.log('Bundle loaded securely from Cloud Storage');
        }
      } catch (e) {
        console.log('No bundle available or failed to load. Falling back to live query.', e);
      }
    }

    try {
      if (messages.length === 0) return;
      const oldestMessage = messages[0];
      
      const q = query(
        collection(db, 'chat_messages'),
        orderBy('timestamp', 'desc'),
        where('timestamp', '<', oldestMessage.timestamp),
        limit(20)
      );
      
      let snapshot;
      try {
        const { getDocsFromCache } = await import('firebase/firestore');
        snapshot = await getDocsFromCache(q);
        if (snapshot.empty) throw new Error('Cache empty');
      } catch (e) {
        snapshot = await getDocs(q);
      }

      const oldMessages: ChatMessage[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        oldMessages.push({
          id: doc.id,
          text: data.text || '',
          senderName: data.senderName || '',
          senderEmail: data.senderEmail || '',
          senderAvatar: data.senderAvatar || '',
          timestamp: data.timestamp,
          createdAt: data.timestamp?.toMillis() || Date.now()
        });
      });

      if (oldMessages.length > 0) {
        setMessages(prev => [...oldMessages.reverse(), ...prev]);
        setHasMore(oldMessages.length === 20);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('Failed to load more messages', e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Admin Actions
  const toggleChatStatus = async () => {
    try {
      const newState = !settings.isChatOpen;
      await updateDoc(doc(db, 'chat_settings', CHAT_DOC_ID), {
        isChatOpen: newState
      });
      setSettings(prev => ({ ...prev, isChatOpen: newState }));
    } catch (e) {
      console.error('Failed to toggle chat state', e);
    }
  };

  const updateCooldown = async (val: number) => {
    try {
      await updateDoc(doc(db, 'chat_settings', CHAT_DOC_ID), {
        messageCooldown: val
      });
      setSettings(prev => ({ ...prev, messageCooldown: val }));
    } catch (e) {
      console.error('Failed to update cooldown', e);
    }
  };

  const deleteMessage = async (id: string) => {
    if (!isAdminOrModerator) return;
    try {
      await deleteDoc(doc(db, 'chat_messages', id));
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Failed to delete message', e);
    }
  };

  const clearAllMessages = async () => {
    if (!isAdminOrModerator) return;
    if (window.confirm(isRtl ? 'هل أنت متأكد من مسح جميع الرسائل بشكل نهائي؟' : 'Are you sure you want to permanently delete all messages?')) {
      try {
        const batch = writeBatch(db);
        messages.forEach(msg => {
          batch.delete(doc(db, 'chat_messages', msg.id));
        });
        await batch.commit();
        setMessages([]);
      } catch (e) {
        console.error('Failed to clear messages', e);
      }
    }
  };

  const bundleOldMessages = async () => {
    if (!isAdminOrModerator) return;
    setIsBundling(true);
    try {
      const res = await fetch('/api/admin/create-chat-bundle', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await (await import('../lib/firebase')).auth.currentUser?.getIdToken() || ''}`
        }
      });
      if (res.ok) {
        alert(isRtl ? 'تم تجميع الرسائل بنجاح وايقاف القراءات للرسائل القديمة.' : 'Messages successfully bundled. Old message reads optimized.');
      } else {
        alert(isRtl ? 'حدث خطأ أثناء التجميع.' : 'Error bundling messages.');
      }
    } catch (e) {
      console.error('Bundling failed', e);
    } finally {
      setIsBundling(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full relative pb-16" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 p-4 sticky top-0 z-30 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/40 rounded-full flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Bell className="w-5 h-5" />
            </div>
            {settings.isChatOpen && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full"></span>
            )}
            {!settings.isChatOpen && (
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-red-500 border-2 border-white dark:border-zinc-900 rounded-full"></span>
            )}
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-800 dark:text-stone-100 leading-tight">شات الدفعة</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {settings.isChatOpen ? (isRtl ? 'مفتوح للمناقشة' : 'Open for discussion') : (isRtl ? 'مغلق حالياً' : 'Currently closed')}
            </p>
          </div>
        </div>

        {isAdminOrModerator && (
          <button 
            onClick={() => setShowAdminControls(!showAdminControls)}
            className={`p-2 rounded-xl transition-colors ${showAdminControls ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Admin Panel */}
      <AnimatePresence>
        {isAdminOrModerator && showAdminControls && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 shadow-inner z-20"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">الشات مفتوح / مغلق</span>
                <button
                  onClick={toggleChatStatus}
                  className={`w-14 h-7 rounded-full transition-colors relative flex items-center px-1 ${settings.isChatOpen ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-700'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute shadow-sm transition-all transform ${settings.isChatOpen ? (isRtl ? '-translate-x-7' : 'translate-x-7') : 'translate-x-0'}`} />
                </button>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200 block mb-2">وقت الانتظار بين الرسائل</label>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min="0" 
                      max="300" 
                      step="5"
                      value={settings.messageCooldown}
                      onChange={(e) => updateCooldown(Number(e.target.value))}
                      className="flex-1 accent-sky-500"
                    />
                    <span className="w-12 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
                      {settings.messageCooldown}ث
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[0, 10, 30, 60, 120].map((val) => (
                      <button
                        key={val}
                        onClick={() => updateCooldown(val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${settings.messageCooldown === val ? 'bg-sky-600 text-white' : 'bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300'}`}
                      >
                        {val === 0 ? 'بدون' : val >= 60 ? `${val/60} دقيقة` : `${val} ث`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap gap-2">
                <button
                  onClick={clearAllMessages}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40"
                >
                  <Trash2 className="w-4 h-4" />
                  {isRtl ? 'مسح كل الرسائل' : 'Clear All'}
                </button>
                <button
                  onClick={bundleOldMessages}
                  disabled={isBundling}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-100 disabled:opacity-50"
                  title="Optimize database reads by serving old messages as static files"
                >
                  {isBundling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  {isRtl ? 'تجميع (Optimize)' : 'Bundle (Optimize)'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-zinc-950 pb-20 scroll-smooth"
      >
        {hasMore && !isLoading && (
          <div className="flex justify-center mb-4">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-4 py-2 bg-white dark:bg-zinc-800 rounded-full border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-600 dark:text-slate-400 shadow-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center min-w-[120px]"
            >
              {isLoadingMore ? <RefreshCw className="w-4 h-4 animate-spin" /> : (isRtl ? 'تحميل المزيد القديمة' : 'Load Older')}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="h-full flex items-center justify-center">
             <RefreshCw className="w-6 h-6 text-sky-600 dark:text-sky-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-zinc-600 space-y-3">
            <MessageSquare className="w-12 h-12 opacity-50" />
            <p className="font-medium">{isRtl ? 'لا توجد رسائل بعد' : 'No messages yet'}</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = user?.email === msg.senderEmail;
            const msgDate = new Date(msg.createdAt);
            const timeStr = msgDate.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
            
            // Should display name? (If previous message is not from same user or it's > 5 mins difference)
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const diffMins = prevMsg ? (msg.createdAt - prevMsg.createdAt) / 60000 : 999;
            const showHeader = !isMe && (!prevMsg || prevMsg.senderEmail !== msg.senderEmail || diffMins > 5);

            return (
              <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[85%] sm:max-w-[75%] gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  
                  {/* Avatar */}
                  {!isMe && showHeader && (
                    <div className="w-8 h-8 rounded-full bg-sky-200 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex-shrink-0 flex items-center justify-center mt-1 font-bold text-sm">
                      {msg.senderAvatar}
                    </div>
                  )}
                  {!isMe && !showHeader && <div className="w-8 flex-shrink-0" />}

                  {/* Bubble */}
                  <div className={`group relative flex flex-col`}>
                    {!isMe && showHeader && (
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1 rtl:ml-0 rtl:mr-1 mb-1">
                        {msg.senderName} 
                        {msg.senderEmail === 'almdrydyl335@gmail.com' && <span className="text-sky-500 text-[10px] bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0.5 rounded ml-1">Admin</span>}
                      </span>
                    )}

                    <div className={`relative px-4 py-2.5 shadow-sm text-[15px] ${
                      isMe 
                        ? 'bg-sky-600 text-white rounded-2xl rounded-tr-sm rtl:rounded-tr-2xl rtl:rounded-tl-sm' 
                        : 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm rtl:rounded-tl-2xl rtl:rounded-tr-sm border border-slate-100 dark:border-zinc-700'
                    }`}>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                      
                      <div className={`flex items-center justify-end mt-1 gap-1 -mb-1 opacity-70 ${isMe ? 'text-sky-100' : 'text-slate-400'}`}>
                        <span className="text-[10px] font-medium">{timeStr}</span>
                      </div>
                    </div>

                    {/* Delete Action (Admin) */}
                    {isAdminOrModerator && (
                      <button 
                        onClick={() => deleteMessage(msg.id)}
                        className={`absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-full shadow-sm hover:scale-110 ${isMe ? '-left-10 rtl:left-auto rtl:-right-10' : '-right-10 rtl:right-auto rtl:-left-10'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} className="h-px" />
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 p-2 sm:p-4 pb-[max(env(safe-area-inset-bottom),1rem)] mt-auto z-20">
        {!settings.isChatOpen && !isAdminOrModerator ? (
          <div className="bg-slate-100 dark:bg-zinc-800 rounded-xl p-3 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-zinc-700 border-dashed">
            <StopCircle className="w-5 h-5" />
            <span className="font-medium text-sm">{settings.closedMessage || 'الشات مغلق حالياً — يمكنك القراءة فقط'}</span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex gap-2 items-end relative">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isRtl ? 'رسالتك...' : 'Type a message...'}
              className="flex-1 bg-slate-100 dark:bg-zinc-800 border border-transparent focus:border-sky-300 dark:focus:border-sky-700 rounded-2xl px-4 py-3 min-h-[44px] max-h-32 outline-none resize-none text-[15px] text-slate-900 dark:text-stone-100 transition-colors"
              dir="auto"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
            />
            {cooldownRemaining > 0 && !isAdminOrModerator ? (
              <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center text-slate-500 dark:text-zinc-400 font-bold shrink-0 shadow-inner">
                {cooldownRemaining}
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSending || !newMessage.trim()}
                className="w-11 h-11 bg-sky-600 hover:bg-sky-500 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-slate-300 dark:disabled:bg-zinc-700 transition-colors shrink-0 shadow-sm"
              >
                {isSending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className={`w-5 h-5 ${isRtl ? 'rotate-180 transform -ml-1' : 'ml-1'}`} />}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
