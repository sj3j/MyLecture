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
  authorName?: string;
  fileUrl?: string | null;
  fileName?: string | null;
  linkUrl?: string | null;
  linkTitle?: string | null;
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

  // Create/Edit Post State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [newPostText, setNewPostText] = useState('');
  const [newPostFile, setNewPostFile] = useState<File | null>(null);
  const [newPostFileType, setNewPostFileType] = useState<'image' | 'video' | 'file' | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [selectedLectures, setSelectedLectures] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdminOrModerator = (user?.role === 'admin' || user?.role === 'moderator') && user?.permissions?.manageAnnouncements !== false;

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
          authorName: data.authorName || '',
          fileUrl: data.fileUrl || null,
          fileName: data.fileName || null,
          linkUrl: data.linkUrl || null,
          linkTitle: data.linkTitle || null,
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

  const formatMessageDate = (date: Date) => {
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && 
                    date.getMonth() === today.getMonth() && 
                    date.getFullYear() === today.getFullYear();
    if (isToday) {
      return isRtl ? 'اليوم' : 'Today';
    }
    return date.toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
      month: 'long', 
      day: 'numeric'
    });
  };

  const groupedPosts = posts.reduce((acc, post) => {
    const postDate = new Date(post.date * 1000);
    const dateKey = formatMessageDate(postDate);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(post);
    return acc;
  }, {} as Record<string, TelegramPost[]>);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        setError(isRtl ? 'حجم الملف يجب أن يكون أقل من 50 ميجابايت' : 'File size must be less than 50MB');
        return;
      }
      setNewPostFile(file);
      if (file.type.startsWith('video/')) setNewPostFileType('video');
      else if (file.type.startsWith('image/')) setNewPostFileType('image');
      else setNewPostFileType('file');
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
    if (!newPostText.trim() && !newPostFile && !linkUrl.trim() && selectedLectures.length === 0) {
      setError(isRtl ? 'يرجى إدخال محتوى أو إرفاق ملف أو رابط أو اختيار محاضرة' : 'Please enter content, attach a file, link, or select a lecture');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let fileUrl = null;
      let finalFileName = null;

      if (newPostFile) {
        const safeFileName = newPostFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        finalFileName = newPostFile.name;
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

      const postData: any = {
        content: newPostText.trim(),
        text: newPostText.trim(),
        embeddedLectures: selectedLectures,
        linkUrl: linkUrl.trim() || null,
        linkTitle: linkTitle.trim() || null,
      };

      if (newPostFile) {
        postData.type = newPostFileType || 'file';
        postData.imageUrl = newPostFileType === 'image' ? fileUrl : null;
        postData.videoUrl = newPostFileType === 'video' ? fileUrl : null;
        postData.fileUrl = newPostFileType === 'file' ? fileUrl : null;
        postData.fileName = finalFileName;
      } else if (!editingPostId) {
        postData.type = 'text';
      }

      const { updateDoc } = await import('firebase/firestore');

      if (editingPostId) {
        // Find existing post to merge
        const existingPost = posts.find(p => p.id === editingPostId);
        if (existingPost) {
          // If no new file uploaded, keep the old file type and URLs
          if (!newPostFile) {
             postData.type = existingPost.type;
             postData.imageUrl = existingPost.imageUrl || null;
             postData.videoUrl = existingPost.videoUrl || null;
             postData.fileUrl = existingPost.fileUrl || null;
             postData.fileName = existingPost.fileName || null;
          }
        }
        postData.updatedAt = serverTimestamp();
        await updateDoc(doc(db, 'announcements', editingPostId), postData);
      } else {
        postData.createdBy = user?.uid;
        postData.authorName = user?.name;
        postData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'announcements'), postData);
      }

      closeModal();
    } catch (err) {
      console.error('Error saving post:', err);
      setError(isRtl ? 'حدث خطأ أثناء حفظ التبليغ' : 'Error saving announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingPostId(null);
    setNewPostText('');
    setNewPostFile(null);
    setNewPostFileType(null);
    setLinkUrl('');
    setLinkTitle('');
    setSelectedLectures([]);
  };

  const openEditModal = (post: TelegramPost) => {
    setEditingPostId(post.id);
    setNewPostText(post.text || post.content || '');
    setLinkUrl(post.linkUrl || '');
    setLinkTitle(post.linkTitle || '');
    setSelectedLectures(post.embeddedLectures || []);
    setNewPostFile(null); // Force re-upload if they want to change the file
    setNewPostFileType(null);
    setShowCreateModal(true);
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', postId));
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
      ) : Object.keys(groupedPosts).length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedPosts).map(([dateKey, postsArray]) => {
            const datePosts = postsArray as TelegramPost[];
            return (
            <div key={dateKey} className="flex flex-col gap-3">
              {/* Date Header */}
              <div className="flex justify-center sticky top-4 z-20">
                <span className="bg-slate-200/80 dark:bg-zinc-700/80 backdrop-blur-md text-slate-600 dark:text-zinc-300 px-3 py-1 rounded-full text-xs font-bold leading-none shadow-sm">
                  {dateKey}
                </span>
              </div>
              
              <div className="flex flex-col gap-3">
                {datePosts.map((post) => {
                  const content = post.text || post.content || post.caption || '';
                  const date = new Date(post.date * 1000);
                  const timeString = date.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
                  
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={post.id}
                      className={`relative group w-full max-w-[92%] sm:max-w-[85%] ${isRtl ? 'ml-auto' : 'mr-auto'}`}
                    >
                      <div className={`bg-white dark:bg-zinc-800 p-3 shadow-sm relative ${
                        isRtl ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'
                      } border border-slate-100 dark:border-zinc-700/50`}>
                        
                        {isAdminOrModerator && (
                          <div className={`absolute top-2 z-10 flex gap-1 ${isRtl ? 'left-2 right-auto' : 'right-2 left-auto'}`}>
                            <button
                              onClick={() => openEditModal(post)}
                              className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>

                            {deletingId === post.id ? (
                              <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 p-1 rounded-lg shadow-sm border border-slate-200 dark:border-zinc-700">
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
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                        
                        <div className="text-sky-600 dark:text-sky-400 font-bold text-[13px] px-1 mb-1">
                          {post.authorName || (isRtl ? 'إعلان جديد' : 'New Announcement')}
                        </div>
                        
                        {post.photo_url && (
                          <div className="rounded-xl overflow-hidden mb-2 relative">
                            <img 
                              src={post.photo_url} 
                              alt="Announcement" 
                              className="w-full h-auto max-h-[400px] object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        {post.videoUrl && (
                          <div className="rounded-xl overflow-hidden mb-2 bg-black">
                            <video 
                              src={post.videoUrl} 
                              controls
                              className="w-full h-auto max-h-[400px] object-contain" 
                            />
                          </div>
                        )}
                        
                        {content && (
                          <p className="text-[15px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed px-1 mb-1" dir="auto">
                            {content.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                              part.match(/(https?:\/\/[^\s]+)/g) ? (
                                <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-600 hover:underline">{part}</a>
                              ) : (
                                <span key={i}>{part}</span>
                              )
                            )}
                          </p>
                        )}

                        {post.fileUrl && !post.photo_url && !post.videoUrl && (
                          <a href={post.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-700/50 hover:bg-slate-100 dark:hover:bg-zinc-800/80 transition-colors w-full">
                            <div className="flex items-center gap-3 w-full overflow-hidden relative">
                              <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 rounded-lg flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                              </div>
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{post.fileName || 'Download File'}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{isRtl ? 'اضغط للتحميل' : 'Click to download'}</p>
                              </div>
                            </div>
                          </a>
                        )}

                        {post.linkUrl && (
                          <a href={post.linkUrl.startsWith('http') ? post.linkUrl : `https://${post.linkUrl}`} target="_blank" rel="noopener noreferrer" className="mt-2 block w-full">
                            <div className="px-4 py-3 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors rounded-xl border border-sky-200 dark:border-sky-800/50 flex items-center gap-3 w-full">
                              <div className="w-8 h-8 rounded-full bg-sky-200 dark:bg-sky-800 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                                <Link className="w-4 h-4 shrink-0" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-sky-900 dark:text-sky-100 truncate">{post.linkTitle || post.linkUrl}</p>
                                <p className="text-xs text-sky-600 dark:text-sky-400 truncate text-left" dir="ltr">{post.linkUrl}</p>
                              </div>
                            </div>
                          </a>
                        )}
                        
                        {post.embeddedLectures && post.embeddedLectures.length > 0 && (
                          <div className={`mt-2 mb-1 pl-3 rtl:pl-0 rtl:pr-3 border-l-2 rtl:border-l-0 rtl:border-r-2 border-sky-500`}>
                            <div className="grid gap-2">
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
                        
                        <div className="flex items-center justify-end mt-1 pr-1 rtl:pr-0 rtl:pl-1">
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                            {timeString}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
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
                <h2 className="text-xl font-bold text-slate-900 dark:text-stone-100">{editingPostId ? (isRtl ? 'تعديل التبليغ' : 'Edit Announcement') : t.createPost}</h2>
                <button
                  onClick={closeModal}
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
                      {isRtl ? 'إرفاق ملف (اختياري - سيستبدل المرفق الحالي إن وجد)' : 'Attach File (Optional - Will replace existing)'}
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-xl hover:border-sky-500 dark:hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors text-slate-600 dark:text-slate-400 font-medium"
                      >
                        <ImageIcon className="w-5 h-5" />
                        {isRtl ? 'صورة / فيديو / ملف' : 'Image / Video / File'}
                      </button>
                    </div>
                    {newPostFile && (
                      <div className="mt-2 flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 rounded-xl border border-sky-100 dark:border-sky-800/50">
                        <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 text-sm font-medium truncate">
                          {newPostFileType === 'video' ? <Video className="w-4 h-4" /> : newPostFileType === 'image' ? <ImageIcon className="w-4 h-4" /> : <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>}
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {isRtl ? 'رابط خارجي (اختياري)' : 'External Link (Optional)'}
                      </label>
                      <input
                        type="url"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none text-[15px] text-slate-900 dark:text-stone-100 text-left dir-ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {isRtl ? 'عنوان الرابط (اختياري)' : 'Link Title (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={linkTitle}
                        onChange={(e) => setLinkTitle(e.target.value)}
                        placeholder={isRtl ? 'مثال: اضغط هنا للدخول' : 'e.g., Click here to enter'}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none text-[15px] text-slate-900 dark:text-stone-100"
                      />
                    </div>
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
                      {editingPostId ? (isRtl ? 'حفظ التعديلات' : 'Save Changes') : t.publishPost}
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
