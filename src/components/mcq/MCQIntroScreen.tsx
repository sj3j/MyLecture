import React from 'react';
import { motion } from 'motion/react';
import { Lecture } from '../../types';
import { BookOpen, X, Clock, Trophy, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';

interface Props {
  lecture: Lecture;
  questionsCount: number;
  firstAttemptStatus: { hasCompleted: boolean; score: number | null };
  onStart: () => void;
  onClose: () => void;
}

export default function MCQIntroScreen({ lecture, questionsCount, firstAttemptStatus, onStart, onClose }: Props) {
  const isRetake = firstAttemptStatus.hasCompleted;

  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }} 
      animate={{ x: 0, opacity: 1 }} 
      exit={{ x: -20, opacity: 0 }}
      className="flex flex-col h-full bg-stone-50 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 border-b border-slate-100 dark:border-zinc-700">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-700">
          <X className="w-6 h-6" />
        </button>
        <span className="font-bold text-lg dark:text-white">تفاصيل الاختبار</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6">
          <div className="inline-flex px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-bold mb-3">
            {lecture.category}
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
            اختبار: {lecture.title}
          </h1>
        </div>

        <div className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-slate-100 dark:border-zinc-700 shadow-sm mb-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg">
               <BookOpen className="w-5 h-5" />
            </div>
            <div>
               <p className="font-bold text-slate-900 dark:text-white">{questionsCount} سؤال</p>
               <p className="text-xs text-slate-500">تم توليدها تلقائياً</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 rounded-lg">
               <Clock className="w-5 h-5" />
            </div>
            <div>
               <p className="font-bold text-slate-900 dark:text-white">بدون وقت محدد</p>
               <p className="text-xs text-slate-500">خذ وقتك في التفكير</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg">
               <Trophy className="w-5 h-5" />
            </div>
            <div>
               <p className="font-bold text-slate-900 dark:text-white">أول محاولة تُحسب في اللوحة</p>
               <p className="text-xs text-slate-500">ركز للحصول على أعلى نقاط</p>
            </div>
          </div>
        </div>

        {isRetake && (
          <div className="space-y-4 mb-6">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl flex items-center justify-between">
              <span className="font-bold text-emerald-800 dark:text-emerald-300">محاولتك الأولى:</span>
              <span className="font-black text-lg text-emerald-600 dark:text-emerald-400">{firstAttemptStatus.score}%</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                ⚠️ هذه إعادة — لن تؤثر على ترتيبك في لوحة الصدارة.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-white dark:bg-zinc-800 border-t border-slate-100 dark:border-zinc-700">
        <button 
          onClick={onStart}
          className="w-full py-4 bg-sky-600 hover:bg-sky-700 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-2 transition-colors"
        >
          ابدأ الآن
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
}
