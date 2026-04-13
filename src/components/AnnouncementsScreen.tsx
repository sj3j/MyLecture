import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Post, Language, TRANSLATIONS, UserProfile } from '../types';
import { Loader2, Megaphone, Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AnnouncementsScreenProps {
  user: UserProfile | null;
  lang: Language;
}

export default function AnnouncementsScreen({ user, lang }: AnnouncementsScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const isAdmin = user && user.role === 'admin';

  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } as Post));
      setPosts(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements');
    });
    return () => unsubscribe();
  }, []);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() || !user) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        content: newPostContent,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        authorName: user.name || 'Admin',
        authorPhotoUrl: user.photoUrl || null,
      });
      setNewPostContent('');
      setShowCreate(false);
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!postToDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'announcements', postToDelete));
      setPostToDelete(null);
    } catch (error) {
      console.error('Error deleting post:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeletePost = (postId: string) => {
    setPostToDelete(postId);
  };

  const startEditing = (post: Post) => {
    setEditingPostId(post.id);
    setEditPostContent(post.content);
  };

  const handleUpdatePost = async (postId: string) => {
    if (!editPostContent.trim()) return;
    
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'announcements', postId), {
        content: editPostContent,
      });
      setEditingPostId(null);
    } catch (error) {
      console.error('Error updating post:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-stone-100 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          {t.navAnnouncements}
        </h1>
      </div>

      <AnimatePresence>
        {showCreate && isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 overflow-hidden"
          >
            <form onSubmit={handleCreatePost} className="bg-white dark:bg-zinc-800 p-4 rounded-2xl border border-slate-200 dark:border-zinc-700 shadow-sm">
              <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder={t.postContent}
                className="w-full p-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none resize-none min-h-[100px] mb-3"
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newPostContent.trim()}
                  className="px-6 py-2 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 text-sm font-bold rounded-xl hover:bg-sky-700 dark:hover:bg-sky-600 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t.publishPost}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map(post => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={post.id}
              className="bg-white dark:bg-zinc-800 p-5 rounded-2xl border border-slate-200 dark:border-zinc-700 shadow-sm relative group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold overflow-hidden">
                  {post.authorPhotoUrl ? (
                    <img src={post.authorPhotoUrl} alt={post.authorName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    post.authorName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 dark:text-stone-100">{post.authorName}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(post.date?.toDate || post.createdAt?.toDate) ? (post.date || post.createdAt).toDate().toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : ''}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEditing(post)}
                      className="p-2 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              
              {editingPostId === post.id ? (
                <div className="mt-3">
                  <textarea
                    value={editPostContent}
                    onChange={(e) => setEditPostContent(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none resize-none min-h-[100px] mb-3"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingPostId(null)}
                      className="px-3 py-1.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      {t.close}
                    </button>
                    <button
                      onClick={() => handleUpdatePost(post.id)}
                      disabled={isUpdating || !editPostContent.trim()}
                      className="px-4 py-1.5 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 text-sm font-bold rounded-lg hover:bg-sky-700 dark:hover:bg-sky-600 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {isRtl ? 'حفظ' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {post.text || post.content}
                  </p>
                  
                  {post.type === 'image' && post.imageUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-zinc-700">
                      <img 
                        src={post.imageUrl} 
                        alt="Announcement" 
                        className="w-full h-auto max-h-[400px] object-contain bg-slate-50 dark:bg-zinc-900 mx-auto" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                  
                  {post.type === 'video' && post.videoUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-zinc-700">
                      <video 
                        src={post.videoUrl} 
                        controls 
                        className="w-full h-auto max-h-[400px] bg-black mx-auto"
                      />
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 border-dashed">
          <Megaphone className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t.noPosts}</p>
        </div>
      )}

      {isAdmin && !showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="fixed bottom-24 right-6 w-14 h-14 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 rounded-full shadow-lg shadow-sky-200 dark:shadow-none flex items-center justify-center hover:bg-sky-700 dark:hover:bg-sky-600 hover:scale-105 transition-all z-40"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {postToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir={isRtl ? 'rtl' : 'ltr'}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-zinc-700"
            >
              <h3 className="text-xl font-bold text-slate-900 dark:text-stone-100 mb-2">
                {isRtl ? 'حذف المنشور' : 'Delete Post'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                {isRtl ? 'هل أنت متأكد من حذف هذا المنشور؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure you want to delete this post? This action cannot be undone.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPostToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-slate-700 dark:text-stone-100 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600 rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  {t.close}
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isRtl ? 'حذف' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
