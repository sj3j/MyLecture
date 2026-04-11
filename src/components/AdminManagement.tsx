import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Shield, Loader2, AlertCircle } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, serverTimestamp, setDoc } from 'firebase/firestore';
import { Language, TRANSLATIONS } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminManagementProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export default function AdminManagement({ isOpen, onClose, lang }: AdminManagementProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'moderator'>('admin');
  const [admins, setAdmins] = useState<{ id: string; email: string; role?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'allowed_admins'));
      const snapshot = await getDocs(q);
      const adminList = snapshot.docs.map(doc => ({
        id: doc.id,
        email: doc.id,
        role: doc.data().role || 'admin'
      }));
      setAdmins(adminList);
    } catch (err) {
      console.error('Error fetching admins:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAdmins();
    }
  }, [isOpen]);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!email.includes('@')) {
        setError(isRtl ? 'بريد إلكتروني غير صالح' : 'Invalid email');
        setIsSubmitting(false);
        return;
      }

      await setDoc(doc(db, 'allowed_admins', email.toLowerCase()), {
        email: email.toLowerCase(),
        role: role,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      });

      setEmail('');
      fetchAdmins();
    } catch (err) {
      console.error('Error adding admin:', err);
      setError(isRtl ? 'فشل إضافة المسؤول' : 'Failed to add admin');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!window.confirm(t.confirmDeleteAdmin)) return;
    
    try {
      await deleteDoc(doc(db, 'allowed_admins', id));
      fetchAdmins();
    } catch (err) {
      console.error('Error deleting admin:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-sky-600 dark:bg-sky-600 text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {t.manageAdmins}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-8">
              {/* Add Admin Form */}
              <form onSubmit={handleAddAdmin} className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.addAdmin}</h3>
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
                <div className="space-y-3">
                  <input
                    required
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none transition-all"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'admin' | 'moderator')}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none transition-all"
                  >
                    <option value="admin">Admin (Full Access)</option>
                    <option value="moderator">Moderator (Content Only)</option>
                  </select>
                  <button
                    disabled={isSubmitting}
                    type="submit"
                    className="w-full py-2.5 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 rounded-xl font-bold hover:bg-sky-700 dark:hover:bg-sky-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-100 dark:shadow-none"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                    {t.addAdmin}
                  </button>
                </div>
              </form>

              {/* Admin List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.adminList}</h3>
                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-sky-600 dark:text-sky-400" />
                  </div>
                ) : admins.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-4 italic">No sub-admins added yet</p>
                ) : (
                  <div className="space-y-2">
                    {admins.map((admin) => (
                      <div key={admin.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-100 dark:border-zinc-700">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${admin.role === 'moderator' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'}`}>
                            {admin.email[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-700 dark:text-slate-300 leading-tight">{admin.email}</span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${admin.role === 'moderator' ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400'}`}>
                              {admin.role || 'admin'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteAdmin(admin.id)}
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
