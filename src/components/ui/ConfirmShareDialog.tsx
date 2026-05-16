import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, X, Share2 } from 'lucide-react';
import { Language } from '../../types';

interface ConfirmShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  lang: Language;
}

export function ConfirmShareDialog({ isOpen, onClose, onConfirm, itemName, lang }: ConfirmShareDialogProps) {
  const isRtl = lang === 'ar';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir={isRtl ? 'rtl' : 'ltr'}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm overflow-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-10"
          >
            <div className="p-6">
              <div className="flex items-center justify-center w-16 h-16 mx-auto mb-5 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-100 dark:border-blue-800/30">
                <Share2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
                {isRtl ? 'تأكيد المشاركة' : 'Confirm Share'}
              </h3>
              <p className="text-center text-gray-600 dark:text-gray-300 mb-8 leading-relaxed font-medium">
                {isRtl ? `هل انت متأكد من إرسال ${itemName} إلى گروب الدفعة؟` : `Are you sure you want to send this ${itemName} to the batch group?`}
              </p>
              
              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                     onConfirm();
                     onClose();
                  }}
                  className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all"
                >
                  <Send className={`w-5 h-5 ${isRtl ? '-scale-x-100' : ''}`} />
                  {isRtl ? 'نعم، إرسال' : 'Yes, send'}
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                  {isRtl ? 'لا، لا ترسل' : 'No, do not send'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
