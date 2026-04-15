import React, { useState, useEffect, useRef } from 'react';
import { Language, TRANSLATIONS, UserProfile, Lecture } from '../types';
import { Loader2, Megaphone, RefreshCw, Plus, X, Image as ImageIcon, Video, Link, Trash2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import LectureCard from './LectureCard';

interface TelegramPost {
  id: string;
  date: number;
  type: string;
  text: string;
  caption?: string;
  photo_url?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  content?: string;
  embeddedLectures?: string[];
}

interface AnnouncementsScreenProps {
  user: UserProfile | null;
  lang: Language;
  lectures: Lecture[];
}

export default function AnnouncementsScreen({ user, lang, lectures }: AnnouncementsScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [posts, setPosts] = useState<TelegramPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Create Post State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostFile, setNewPostFile] = useState<File | null>(null);
  const [newPostFileType, setNewPostFileType] = useState<'image' | 'video' | null>(null);
  const [selectedLectures, setSelectedLectures] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdminOrModerator = user?.role === 'admin' || user?.role === 'moderator';

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newPosts: TelegramPost[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        newPosts.push({
          id: doc.id,
          date: data.createdAt?.toMillis() ? data.createdAt.toMillis() / 1000 : Date.now() / 1000,
          type: data.type || 'text',
          text: data.text || data.content || '',
          caption: data.caption || '',
          photo_url: data.imageUrl || data.photo_url || null,
          imageUrl: data.imageUrl || null,
          videoUrl: data.videoUrl || null,
          content: data.content || '',
          embeddedLectures: data.embeddedLectures || [],
        });
      });
      setPosts(newPosts);
      setLastUpdated(new Date());
      setIsLoading(false);
      setIsRefreshing(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements');
      setIsLoading(false);
      setIsRefreshing(false);
    });

    return () => unsubscribe();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        setError(isRtl ? 'حجم الملف يجب أن يكون أقل من 50 ميجابايت' : 'File size must be less than 50MB');
        return;
      }
      setNewPostFile(file);
      setNewPostFileType(file.type.startsWith('video/') ? 'video' : 'image');
      setError(null);
    }
  };

  const toggleLectureSelection = (lectureId: string) => {
    setSelectedLectures(prev => 
      prev.includes(lectureId) 
        ? prev.filter(id => id !== lectureId)
        : [...prev, lectureId]
    );
  };

  const handleCreatePost = async () => {
    if (!newPostText.trim() && !newPostFile && selectedLectures.length === 0) {
      setError(isRtl ? 'يرجى إدخال محتوى أو إرفاق ملف أو اختيار محاضرة' : 'Please enter content, attach a file, or select a lecture');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let fileUrl = null;

      if (newPostFile) {
        const safeFileName = newPostFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `announcements/${Date.now()}_${safeFileName}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, newPostFile);

        fileUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed', 
            null, 
            (err) => reject(err), 
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (err) {
                reject(err);
              }
            }
          );
        });
      }

      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newPostText.trim(),
          type: newPostFileType || 'text',
          imageUrl: newPostFileType === 'image' ? fileUrl : null,
          videoUrl: newPostFileType === 'video' ? fileUrl : null,
          embeddedLectures: selectedLectures,
          createdBy: user?.uid,
          authorName: user?.name
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create announcement');
      }

      setShowCreateModal(false);
      setNewPostText('');
      setNewPostFile(null);
      setNewPostFileType(null);
      setSelectedLectures([]);
    } catch (err) {
      console.error('Error creating post:', err);
      setError(isRtl ? 'حدث خطأ أثناء نشر التبليغ' : 'Error publishing announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const response = await fetch(`/api/admin/announcements/${postId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete announcement');
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  const timeString = lastUpdated.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-stone-100 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          {t.navAnnouncements}
        </h1>
        
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-medium mr-4">
            <span>{isRtl ? 'آخر تحديث:' : 'Last updated:'} {timeString}</span>
            <button 
              onClick={handleRefresh}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              title={isRtl ? 'تحديث' : 'Refresh'}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-500' : ''}`} />
            </button>
          </div>
          
          {isAdminOrModerator && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl font-bold transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">{t.createPost}</span>
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map(post => {
            const content = post.text || post.content || post.caption || '';
            const date = new Date(post.date * 1000);
            
            return (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key={post.id}
                className="bg-white dark:bg-zinc-800 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-zinc-700 shadow-sm relative group"
              >
                {isAdminOrModerator && (
                  <div 
                    className={`absolute top-4 z-10 ${isRtl ? 'left-4 right-auto' : 'right-4 left-auto'}`}
                    style={isRtl ? { left: '1rem', right: 'auto' } : { right: '1rem', left: 'auto' }}
                  >
                    {deletingId === post.id ? (
                      <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 p-1 rounded-lg shadow-sm border border-slate-200 dark:border-zinc-700">
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="px-2 py-1 text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-md transition-colors"
                        >
                          {isRtl ? 'تأكيد' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-700 dark:text-slate-300 rounded-md transition-colors"
                        >
                          {isRtl ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(post.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold overflow-hidden">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-slate-900 dark:text-stone-100">
                      {isRtl ? 'إعلان جديد' : 'New Announcement'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {date.toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {content && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed" dir="auto">
                      {content}
                    </p>
                  )}
                  
                  {post.photo_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-zinc-700 mt-3">
                      <img 
                        src={post.photo_url} 
                        alt="Announcement" 
                        className="w-full h-auto max-h-[400px] object-contain bg-slate-50 dark:bg-zinc-900 mx-auto" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                  {post.videoUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-zinc-700 mt-3">
                      <video 
                        src={post.videoUrl} 
                        controls
                        className="w-full h-auto max-h-[400px] object-contain bg-slate-50 dark:bg-zinc-900 mx-auto" 
                      />
                    </div>
                  )}
                  
                  {post.embeddedLectures && post.embeddedLectures.length > 0 && (
                    <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 dark:border-zinc-700">
                      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {isRtl ? 'المحاضرات المرفقة' : 'Attached Lectures'}
                      </h4>
                      <div className="grid gap-3">
                        {post.embeddedLectures.map(lectureId => {
                          const lecture = lectures.find(l => l.id === lectureId);
                          if (!lecture) return null;
                          return (
                            <LectureCard 
                              key={lecture.id} 
                              lecture={lecture} 
                              lang={lang} 
                              user={user} 
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 border-dashed">
          <Megaphone className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {t.noPosts}
          </p>
        </div>
      )}

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 dark:border-zinc-800">
                <h2 className="text-xl font-bold text-slate-900 dark:text-stone-100">{t.createPost}</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                {error && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      {t.postContent}
                    </label>
                    <textarea
                      value={newPostText}
                      onChange={(e) => setNewPostText(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none resize-none h-32 text-slate-900 dark:text-stone-100"
                      placeholder={isRtl ? 'اكتب التبليغ هنا...' : 'Write announcement here...'}
                      dir="auto"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      {isRtl ? 'إرفاق ملف (اختياري)' : 'Attach File (Optional)'}
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*,video/*"
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-xl hover:border-sky-500 dark:hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors text-slate-600 dark:text-slate-400 font-medium"
                      >
                        <ImageIcon className="w-5 h-5" />
                        {isRtl ? 'صورة / فيديو' : 'Image / Video'}
                      </button>
                    </div>
                    {newPostFile && (
                      <div className="mt-2 flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 rounded-xl border border-sky-100 dark:border-sky-800/50">
                        <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 text-sm font-medium truncate">
                          {newPostFileType === 'video' ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                          <span className="truncate">{newPostFile.name}</span>
                        </div>
                        <button
                          onClick={() => {
                            setNewPostFile(null);
                            setNewPostFileType(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="p-1 text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200 rounded-full hover:bg-sky-100 dark:hover:bg-sky-800/50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                      {isRtl ? 'إرفاق محاضرات (اختياري)' : 'Attach Lectures (Optional)'}
                    </label>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-zinc-700 rounded-xl bg-slate-50 dark:bg-zinc-800 p-2 space-y-1">
                      {lectures.map(lecture => (
                        <div 
                          key={lecture.id}
                          onClick={() => toggleLectureSelection(lecture.id)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            selectedLectures.includes(lecture.id) 
                              ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' 
                              : 'hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="text-sm font-medium truncate pr-2">{lecture.title}</span>
                          {selectedLectures.includes(lecture.id) && <Check className="w-4 h-4 shrink-0" />}
                        </div>
                      ))}
                      {lectures.length === 0 && (
                        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                          {isRtl ? 'لا توجد محاضرات متاحة' : 'No lectures available'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50">
                <button
                  onClick={handleCreatePost}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Megaphone className="w-5 h-5" />
                      {t.publishPost}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
