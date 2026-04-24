import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Lecture } from '../../types';
import { BookOpen, X, Clock, Trophy, AlertTriangle, ArrowRight, ArrowLeft, Bot, Library } from 'lucide-react';
import { getLockedAnswers } from '../../services/mcqAnswerService';
import { BankQuestion } from '../../types/questionBank.types';

interface Props {
  lecture: Lecture;
  questionsCount: number;
  bankQuestions?: BankQuestion[];
  firstAttemptStatus: { hasCompleted: boolean; score: number | null };
  onStart: () => void;
  onClose: () => void;
  userId: string;
}

export default function MCQIntroScreen({ lecture, questionsCount, bankQuestions = [], firstAttemptStatus, onStart, onClose, userId }: Props) {
  const isRetake = firstAttemptStatus.hasCompleted;
  const [lockedCount, setLockedCount] = useState(0);

  useEffect(() => {
    if (!isRetake && userId) {
      getLockedAnswers(userId, lecture.id).then(answers => {
        setLockedCount(Object.keys(answers).length);
      });
    }
  }, [isRetake, userId, lecture.id]);

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
            اختبارات: {lecture.title}
          </h1>
        </div>

        {/* AI Section (Existing) */}
        <div className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-slate-100 dark:border-zinc-700 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-5 h-5 text-sky-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">أسئلة الذكاء الاصطناعي</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{questionsCount} سؤال مولّد من محتوى المحاضرة</p>
          
          <div className="space-y-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg">
                 <BookOpen className="w-4 h-4" />
              </div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">بدون وقت محدد</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg">
                 <Trophy className="w-4 h-4" />
              </div>
              <p className="font-bold text-sm text-slate-900 dark:text-white">أول محاولة تُحسب في اللوحة</p>
            </div>
          </div>

          {isRetake && (
            <div className="space-y-3 mb-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl flex items-center justify-between">
                <span className="font-bold text-sm text-emerald-800 dark:text-emerald-300">محاولتك الأولى:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400">{firstAttemptStatus.score}%</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>هذه إعادة — لن تؤثر على ترتيبك في لوحة الصدارة.</p>
              </div>
            </div>
          )}

          {!isRetake && lockedCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-xl flex items-start gap-2 mb-4 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-amber-800 dark:text-amber-300">
                لديك {lockedCount} إجابة محفوظة. لا يمكن تغييرها.
              </div>
            </div>
          )}
          
          <button 
            onClick={onStart}
            className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors mt-2"
          >
            {lockedCount > 0 && !isRetake ? 'أكمل اختبار AI' : 'ابدأ اختبار AI'}
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Bank Section */}
        {bankQuestions.length > 0 && (
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-5 border border-slate-100 dark:border-zinc-700 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Library className="w-5 h-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">بنك الأسئلة</h2>
              </div>
              <span className="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded text-sm">{bankQuestions.length} سؤال</span>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {['وزاري', 'سنين_سابقة', 'سؤال_الدكتور', 'مهم'].map(tag => {
                const count = bankQuestions.filter(q => q.tags.includes(tag as any)).length;
                if (count === 0) return null;
                const colors = {
                  'وزاري': 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                  'سنين_سابقة': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                  'سؤال_الدكتور': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                  'مهم': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }[tag] || 'bg-slate-100 text-slate-600';
                return (
                  <span key={tag} className={`text-xs font-bold px-2 py-1 rounded ${colors}`}>
                    {tag.replace('_', ' ')}: {count}
                  </span>
                )
              })}
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('open-bank-browse', { detail: { bankQuestions, lectureId: lecture.id } }))}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl flex items-center justify-center transition-colors"
               >
                 تصفح
              </button>
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('open-bank-quiz', { detail: { bankQuestions, lectureId: lecture.id } }))}
                className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
               >
                 ابدأ اختبار مخصص
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
