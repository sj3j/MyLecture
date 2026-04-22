import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { Lecture } from '../../types';
import { Trophy, ArrowRight, RotateCcw, CheckCircle, XCircle, Search, Share2 } from 'lucide-react';

interface Props {
  lecture: Lecture;
  result: any;
  isFirstAttempt: boolean;
  questionsCount: number;
  onReview: () => void;
  onRetake: () => void;
  onClose: () => void;
}

export default function MCQResultScreen({ lecture, result, isFirstAttempt, questionsCount, onReview, onRetake, onClose }: Props) {
  const { score, correct } = result;
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // Check if share is available
    if (typeof navigator !== 'undefined' && navigator.share) {
      setCanShare(true);
    }
    
    // Confetti
    if (score >= 90) {
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#38bdf8', '#fbbf24', '#34d399']
        });
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#38bdf8', '#fbbf24', '#34d399']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [score]);

  const handleShare = async () => {
    if (canShare) {
      try {
        await navigator.share({
          title: 'نتيجتي في محاضراتي',
          text: `حصلت على ${correct}/${questionsCount} (${Math.round(score)}%) في امتحان محاضرة "${lecture.title}" 📚🎯`,
        });
      } catch (err) {
        console.warn('Share cancelled or failed', err);
      }
    }
  };

  let message = '';
  let emoji = '';
  if (score >= 90) { message = 'ممتاز!'; emoji = '🌟'; }
  else if (score >= 75) { message = 'جيد جداً!'; emoji = '👍'; }
  else if (score >= 60) { message = 'جيد، استمر'; emoji = '💪'; }
  else { message = 'تحتاج مراجعة'; emoji = '📖'; }

  // Draw circle SVG
  const radius = 60;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }} 
      exit={{ opacity: 0 }}
      className="flex flex-col h-full bg-stone-50 dark:bg-zinc-900 p-6 overflow-y-auto"
      dir="rtl"
    >
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full space-y-6 pt-10">
        
        {/* Score Hero Card */}
        <div className="bg-white dark:bg-zinc-800 rounded-3xl p-8 border border-slate-100 dark:border-zinc-700 shadow-xl shadow-sky-500/5 text-center relative overflow-hidden">
          <h2 className="text-xl font-bold text-slate-800 dark:text-stone-200 mb-8">{lecture.title}</h2>
          
          <div className="relative w-48 h-48 mx-auto mb-6 flex items-center justify-center">
            {/* SVG Progress Circle */}
            <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
              <circle
                stroke="currentColor"
                fill="transparent"
                strokeWidth={stroke}
                r={normalizedRadius}
                cx={radius}
                cy={radius}
                className="text-slate-100 dark:text-zinc-700"
              />
              <motion.circle
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                stroke="currentColor"
                fill="transparent"
                strokeWidth={stroke}
                strokeLinecap="round"
                r={normalizedRadius}
                cx={radius}
                cy={radius}
                style={{ strokeDasharray: circumference + ' ' + circumference }}
                className={score >= 75 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500'}
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-slate-900 dark:text-white capitalize">{Math.round(score)}%</span>
              <span className="text-sm font-bold text-slate-500">{correct} / {questionsCount}</span>
            </div>
          </div>
          
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{message} {emoji}</h3>
        </div>

        {/* Banners */}
        {isFirstAttempt ? (
           <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl flex items-center gap-3">
             <Trophy className="w-6 h-6 text-emerald-600 flex-shrink-0" />
             <p className="font-bold text-emerald-800 dark:text-emerald-300">🏆 تم حفظ نتيجتك في لوحة الصدارة!</p>
           </div>
        ) : (
           <div className="bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-4 rounded-xl flex items-center gap-3 text-center justify-center">
             <p className="font-bold text-slate-600 dark:text-slate-400">هذه إعادة — نتيجتك الأولى محفوظة</p>
           </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-4 border border-slate-100 dark:border-zinc-700 flex items-center gap-3">
             <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-lg"><CheckCircle className="w-5 h-5"/></div>
             <div>
               <p className="text-xs font-bold text-slate-500">صحيح</p>
               <p className="text-xl font-black text-slate-900 dark:text-white">{correct}</p>
             </div>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-4 border border-slate-100 dark:border-zinc-700 flex items-center gap-3">
             <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg"><XCircle className="w-5 h-5"/></div>
             <div>
               <p className="text-xs font-bold text-slate-500">خطأ</p>
               <p className="text-xl font-black text-slate-900 dark:text-white">{questionsCount - correct}</p>
             </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-4">
          {canShare && (
            <button 
              onClick={handleShare}
              className="w-full py-3.5 bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors mb-2"
            >
              <Share2 className="w-5 h-5" />
              مشاركة النتيجة
            </button>
          )}

          <button 
            onClick={onReview}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Search className="w-5 h-5" />
            مراجعة الإجابات
          </button>
          
          <button 
            onClick={onRetake}
            className="w-full py-3.5 bg-white dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 text-slate-700 dark:text-slate-300 font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            إعادة المحاولة
          </button>

          <button 
            onClick={onClose}
            className="w-full py-3.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-bold text-base flex items-center justify-center gap-2 transition-colors"
          >
            العودة للمحاضرات
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </motion.div>
  );
}
