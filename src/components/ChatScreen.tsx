import React, { useState, useEffect, useRef } from 'react';
import { Language, TRANSLATIONS, UserProfile } from '../types';
import { Send, Settings, Trash2, Power, Clock, StopCircle, RefreshCw, Archive, Bell, MessageSquare, Paperclip, X, ThumbsUp, Heart } from 'lucide-react';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc, doc, getDoc, updateDoc, writeBatch, limit, where, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface ChatMessage {
  id: string;
  text: string;
  senderName: string;
  senderEmail: string;
  senderAvatar: string;
  senderId?: string;
  timestamp: any;
  createdAt: number;
  replyTo?: {
    messageId: string;
    senderName: string;
    text: string;
  } | null;
  reactions?: {
    like: string[];
    heart: string[];
    thanks: string[];
  };
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
  const isAdminOrModerator = (user?.role === 'admin' || user?.role === 'moderator') && user?.permissions?.manageChat !== false;
  const CHAT_DOC_ID = 'config';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<ChatSettings>({
    isChatOpen: false,
    messageCooldown: 30,
    closedMessage: 'الشات مغلق حالياً'
  });
  
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<{messageId: string; senderName: string; text: string} | null>(null);
  const [showReactionPickerFor, setShowReactionPickerFor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastMessageTime, setLastMessageTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [showAdminControls, setShowAdminControls] = useState(false);
  const [isBundling, setIsBundling] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track last visible document for pagination
  const [lastVisibleMessageId, setLastVisibleMessageId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Ghost sender bug fix & rendering cleanup
  const getIsMe = (msg: ChatMessage) => {
    return !!(user && ((msg.senderEmail && user.email === msg.senderEmail) || (msg.senderId && user.uid === msg.senderId)));
  };
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

  // Listen for Live Messages (Replacing Polling)
  useEffect(() => {
    setIsLoading(true);
    const q = query(
      collection(db, 'chat_messages'),
      orderBy('timestamp', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(prev => {
        let newArray = [...prev];
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const msg: ChatMessage = {
              id: change.doc.id,
              text: data.text || '',
              senderName: data.senderName || (data.senderEmail ? data.senderEmail.split('@')[0] : 'Unknown'),
              senderEmail: data.senderEmail || '',
              senderId: data.senderId || '',
              senderAvatar: data.senderAvatar || '',
              timestamp: data.timestamp,
              createdAt: data.timestamp?.toMillis() || Date.now(),
              replyTo: data.replyTo || null,
              reactions: data.reactions || { like: [], heart: [], thanks: [] }
            };

            if (change.type === 'added') {
               if (!newArray.some(m => m.id === msg.id)) {
                  newArray.push(msg);
               }
            }
            if (change.type === 'modified') {
               const idx = newArray.findIndex(m => m.id === msg.id);
               if (idx >= 0) {
                 newArray[idx] = msg;
               }
            }
            if (change.type === 'removed') {
               newArray = newArray.filter(m => m.id !== msg.id);
            }
        });
        
        // Return chronologically sorted array
        newArray.sort((a, b) => a.createdAt - b.createdAt);
        return newArray;
      });
      
      if (!snapshot.empty) {
        setLastVisibleMessageId(snapshot.docs[snapshot.docs.length - 1].id);
      }
      setIsLoading(false);

      // Auto scroll down if user is near bottom
      const container = containerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom) {
          setTimeout(() => scrollToBottom(), 100);
        }
      }
    }, (e) => {
      console.error('Chat live listener error: ', e);
      setIsLoading(false);
    });

    return () => unsubscribe();
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
    const replyData = replyingTo ? { ...replyingTo } : null;
    setNewMessage('');
    setReplyingTo(null);
    setIsSending(true);

    try {
      const docRef = await addDoc(collection(db, 'chat_messages'), {
        text: messageText,
        senderName: user.name,
        senderEmail: user.email,
        senderId: user.uid,
        senderAvatar: user.photoUrl || user.name.charAt(0).toUpperCase(),
        timestamp: serverTimestamp(),
        replyTo: replyData,
        reactions: { like: [], heart: [], thanks: [] }
      });

      // Optimistic UI update
      setMessages(prev => [...prev, {
        id: docRef.id,
        text: messageText,
        senderName: user.name,
        senderEmail: user.email,
        senderId: user.uid,
        senderAvatar: user.photoUrl || user.name.charAt(0).toUpperCase(),
        timestamp: new Date(),
        createdAt: Date.now(),
        replyTo: replyData,
        reactions: { like: [], heart: [], thanks: [] }
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
          senderName: data.senderName || (data.senderEmail ? data.senderEmail.split('@')[0] : 'Unknown'),
          senderEmail: data.senderEmail || '',
          senderId: data.senderId || '',
          senderAvatar: data.senderAvatar || '',
          timestamp: data.timestamp,
          createdAt: data.timestamp?.toMillis() || Date.now(),
          replyTo: data.replyTo || null,
          reactions: data.reactions || { like: [], heart: [], thanks: [] }
        });
      });

      if (oldMessages.length > 0) {
        setMessages(prev => {
          const uniqueOld = oldMessages.reverse().filter(nm => !prev.some(pm => pm.id === nm.id));
          return [...uniqueOld, ...prev];
        });
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
    setIsClearing(true);
    try {
      let documentCount = 0;
      let q = query(collection(db, 'chat_messages'), limit(500));
      let snapshot = await getDocs(q);

      while (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
          documentCount++;
        });
        await batch.commit();
        
        // fetch the next 500
        q = query(collection(db, 'chat_messages'), limit(500));
        snapshot = await getDocs(q);
      }
      setMessages([]);
      setShowClearConfirm(false);
      setAlertMessage(isRtl ? `تم حذف جميع الرسائل. (${documentCount} رسالة)` : `Successfully cleared all messages. (${documentCount} messages)`);
    } catch (e) {
      console.error('Failed to clear messages', e);
      setAlertMessage(isRtl ? 'حدث خطأ أثناء حذف الرسائل' : 'Error clearing messages');
    } finally {
      setIsClearing(false);
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
        setAlertMessage(isRtl ? 'تم تجميع الرسائل بنجاح وايقاف القراءات للرسائل القديمة.' : 'Messages successfully bundled. Old message reads optimized.');
      } else {
        setAlertMessage(isRtl ? 'حدث خطأ أثناء التجميع.' : 'Error bundling messages.');
      }
    } catch (e) {
      console.error('Bundling failed', e);
    } finally {
      setIsBundling(false);
    }
  };

  const handleReaction = async (msgId: string, emoji: 'like' | 'heart' | 'thanks', msgReactions: any) => {
    if (!user) return;
    const hasReacted = msgReactions && msgReactions[emoji] && msgReactions[emoji].includes(user.email);
    
    // Optimistic UI update
    setMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        const reactions = m.reactions || { like: [], heart: [], thanks: [] };
        const updated = { ...reactions };
        if (hasReacted) {
          updated[emoji] = updated[emoji].filter((e: string) => e !== user.email);
        } else {
          updated[emoji] = [...(updated[emoji] || []), user.email];
        }
        return { ...m, reactions: updated };
      }
      return m;
    }));
    setShowReactionPickerFor(null);
    
    try {
      const ref = doc(db, 'chat_messages', msgId);
      await updateDoc(ref, {
        [`reactions.${emoji}`]: hasReacted ? arrayRemove(user.email) : arrayUnion(user.email)
      });
    } catch (e) {
      console.error('Failed to react', e);
      fetchMessages(); // revert on fail
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
                  onClick={() => setShowClearConfirm(true)}
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
            const isMe = getIsMe(msg);
            const msgDate = new Date(msg.createdAt);
            const timeStr = msgDate.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
            
            // Should display name? (If previous message is not from same user or it's > 5 mins difference)
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const diffMins = prevMsg ? (msg.createdAt - prevMsg.createdAt) / 60000 : 999;
            const showHeader = !isMe && (!prevMsg || prevMsg.senderEmail !== msg.senderEmail || diffMins > 5);

            return (
              <div id={`msg-${msg.id}`} key={msg.id} className={`flex w-full transition-colors duration-500 rounded-lg ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[85%] sm:max-w-[75%] gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  
                  {/* Avatar */}
                  {!isMe && showHeader && (
                    <div className="w-8 h-8 rounded-full bg-sky-200 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex-shrink-0 flex items-center justify-center mt-1 font-bold text-sm overflow-hidden border border-sky-100 dark:border-zinc-800">
                      {msg.senderAvatar?.startsWith('http') ? (
                        <img src={msg.senderAvatar} alt={msg.senderName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        msg.senderAvatar || msg.senderName.charAt(0).toUpperCase()
                      )}
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

                    <div 
                      className={`relative px-4 py-2.5 shadow-sm text-[15px] cursor-pointer transition-colors ${
                        isMe 
                          ? 'bg-sky-600 text-white rounded-2xl rounded-tr-sm rtl:rounded-tr-2xl rtl:rounded-tl-sm' 
                          : 'bg-white dark:bg-zinc-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm rtl:rounded-tl-2xl rtl:rounded-tr-sm border border-slate-100 dark:border-zinc-700'
                      }`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setShowReactionPickerFor(showReactionPickerFor === msg.id ? null : msg.id);
                      }}
                    >
                      {msg.replyTo && (
                        <div 
                           onClick={(e) => {
                             e.stopPropagation();
                             const el = document.getElementById(`msg-${msg.replyTo!.messageId}`);
                             if (el) {
                               el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                               el.classList.add('bg-sky-100', 'dark:bg-sky-900/40');
                               setTimeout(() => el.classList.remove('bg-sky-100', 'dark:bg-sky-900/40'), 2000);
                             }
                           }}
                           className={`mb-1.5 p-2 rounded-lg text-xs border-l-2 rtl:border-l-0 rtl:border-r-2 cursor-pointer hover:opacity-80 transition-opacity ${isMe ? 'bg-sky-700/50 border-sky-300' : 'bg-slate-100 dark:bg-zinc-700/50 border-sky-500'}`}
                        >
                          <div className="font-bold mb-0.5 opacity-90">{msg.replyTo.senderName}</div>
                          <div className="opacity-80 truncate" dir="auto">{msg.replyTo.text}</div>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words leading-relaxed" dir="auto">{msg.text}</p>
                      
                      <div className={`flex items-center justify-end mt-1 gap-1 -mb-1 opacity-70 ${isMe ? 'text-sky-100' : 'text-slate-400'}`}>
                        <span className="text-[10px] font-medium">{timeStr}</span>
                      </div>
                    </div>

                    {/* Reactions Display */}
                    {msg.reactions && (msg.reactions.like?.length > 0 || msg.reactions.heart?.length > 0 || msg.reactions.thanks?.length > 0) && (
                      <div className={`flex flex-wrap gap-1 mt-1 z-10 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {msg.reactions.like?.length > 0 && (
                          <button title={msg.reactions.like.join(', ')} onClick={() => handleReaction(msg.id, 'like', msg.reactions)} className={`px-1.5 py-0.5 rounded-full text-xs flex items-center gap-1 border hover:scale-105 transition-transform ${msg.reactions.like.includes(user?.email || '') ? 'bg-sky-50 dark:bg-sky-900 border-sky-200 text-sky-700' : 'bg-white dark:bg-zinc-800 border-slate-200 text-slate-600'}`}>
                            👍 {msg.reactions.like.length}
                          </button>
                        )}
                        {msg.reactions.heart?.length > 0 && (
                          <button title={msg.reactions.heart.join(', ')} onClick={() => handleReaction(msg.id, 'heart', msg.reactions)} className={`px-1.5 py-0.5 rounded-full text-xs flex items-center gap-1 border hover:scale-105 transition-transform ${msg.reactions.heart.includes(user?.email || '') ? 'bg-rose-50 dark:bg-rose-900 border-rose-200 text-rose-700' : 'bg-white dark:bg-zinc-800 border-slate-200 text-slate-600'}`}>
                            ❤️ {msg.reactions.heart.length}
                          </button>
                        )}
                        {msg.reactions.thanks?.length > 0 && (
                          <button title={msg.reactions.thanks.join(', ')} onClick={() => handleReaction(msg.id, 'thanks', msg.reactions)} className={`px-1.5 py-0.5 rounded-full text-xs flex items-center gap-1 border hover:scale-105 transition-transform ${msg.reactions.thanks.includes(user?.email || '') ? 'bg-emerald-50 dark:bg-emerald-900 border-emerald-200 text-emerald-700' : 'bg-white dark:bg-zinc-800 border-slate-200 text-slate-600'}`}>
                            🙏 {msg.reactions.thanks.length}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Reaction / Action Picker */}
                    <AnimatePresence>
                      {showReactionPickerFor === msg.id && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          className={`absolute -top-12 z-[100] bg-white dark:bg-zinc-800 shadow-xl rounded-full px-2 py-1.5 flex items-center gap-1 border border-slate-200 dark:border-zinc-700 ${isMe ? 'right-0' : 'left-0'}`}
                        >
                          <button onClick={() => handleReaction(msg.id, 'like', msg.reactions)} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full transition-colors text-lg">👍</button>
                          <button onClick={() => handleReaction(msg.id, 'heart', msg.reactions)} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full transition-colors text-lg">❤️</button>
                          <button onClick={() => handleReaction(msg.id, 'thanks', msg.reactions)} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full transition-colors text-lg">🙏</button>
                          <div className="w-px h-6 bg-slate-200 dark:bg-zinc-700 mx-1"></div>
                          <button 
                            onClick={() => { setReplyingTo({ messageId: msg.id, senderName: msg.senderName, text: msg.text.substring(0, 50) }); setShowReactionPickerFor(null); }} 
                            className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full text-xs font-bold text-sky-600 flex items-center gap-1"
                          >
                            ↩ {isRtl ? 'رد' : 'Reply'}
                          </button>
                          <button onClick={() => setShowReactionPickerFor(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full text-slate-400 ml-1"><X className="w-4 h-4"/></button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Delete Action (Admin) */}
                    {isAdminOrModerator && (
                      <button 
                        onClick={() => deleteMessage(msg.id)}
                        className={`absolute top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1.5 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-full shadow-sm hover:scale-110 ${isMe ? '-left-10 rtl:left-auto rtl:-right-10' : '-right-10 rtl:right-auto rtl:-left-10'}`}
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
      <div className="bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 p-2 sm:p-4 pb-[max(env(safe-area-inset-bottom),1rem)] mt-auto z-20 relative">
        {!settings.isChatOpen && !isAdminOrModerator ? (
          <div className="bg-slate-100 dark:bg-zinc-800 rounded-xl p-3 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-zinc-700 border-dashed">
            <StopCircle className="w-5 h-5" />
            <span className="font-medium text-sm">{settings.closedMessage || 'الشات مغلق حالياً — يمكنك القراءة فقط'}</span>
          </div>
        ) : (
          <div className="relative">
            {replyingTo && (
              <div className="absolute bottom-full left-0 right-0 mb-3 mx-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 shadow-lg flex items-start gap-2">
                <div className="flex-1 overflow-hidden">
                  <div className="text-xs font-bold text-sky-600 dark:text-sky-400 mb-0.5">
                    ↩ {isRtl ? 'رد على' : 'Replying to'} {replyingTo.senderName}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 truncate" dir="auto">{replyingTo.text}</div>
                </div>
                <button type="button" onClick={() => setReplyingTo(null)} className="p-1 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Telegram-style fixed input bar. LTR -> input then send. RTL -> send then input */}
            <form onSubmit={handleSendMessage} className={`flex items-end gap-2 relative`} dir={isRtl ? 'rtl' : 'ltr'}>
              <button
                type="button"
                className="w-11 h-11 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 rounded-full flex items-center justify-center transition-colors shrink-0 shadow-sm"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={isRtl ? 'رسالتك...' : 'Message...'}
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
          </div>
        )}
      </div>

      {/* Clear All Confirm Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-800 rounded-3xl shadow-2xl overflow-hidden p-6 border border-slate-200 dark:border-zinc-700"
            >
              <h3 className="text-xl font-bold text-slate-900 dark:text-stone-100 mb-2">{isRtl ? 'مسح جميع الرسائل' : 'Clear All Messages'}</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">{isRtl ? 'هل أنت متأكد من مسح جميع الرسائل بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure you want to permanently delete all messages? This action cannot be undone.'}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-zinc-700/50 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={clearAllMessages}
                  disabled={isClearing}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isClearing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  {isRtl ? 'تأكيد الحذف' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
        
        {alertMessage && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAlertMessage(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-800 rounded-3xl shadow-2xl overflow-hidden p-6 text-center border border-slate-200 dark:border-zinc-700"
            >
              <p className="text-slate-800 dark:text-slate-200 font-medium mb-6">{alertMessage}</p>
              <button
                onClick={() => setAlertMessage(null)}
                className="w-full py-3 px-4 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-700 transition-colors"
              >
                {isRtl ? 'حسناً' : 'OK'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
