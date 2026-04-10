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
  const [admins, setAdmins] = useState<{ id: string; email: string }[]>([]);
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
        email: doc.id
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
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-indigo-600 text-white">
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
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t.addAdmin}</h3>
                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-2 text-sm">
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
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  <button
                    disabled={isSubmitting}
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                    {t.addAdmin}
                  </button>
                </div>
              </form>

              {/* Admin List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t.adminList}</h3>
                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  </div>
                ) : admins.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-4 italic">No sub-admins added yet</p>
                ) : (
                  <div className="space-y-2">
                    {admins.map((admin) => (
                      <div key={admin.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                            {admin.email[0].toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-700">{admin.email}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteAdmin(admin.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
