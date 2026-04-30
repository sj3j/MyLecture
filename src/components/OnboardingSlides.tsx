import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Navigation, Flame, Trophy, Mic, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

interface OnboardingSlidesProps {
  onComplete: () => void;
}

export default function OnboardingSlides({ onComplete }: OnboardingSlidesProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      id: 'welcome',
      icon: <Sparkles className="w-16 h-16 text-[#2196F3]" />,
      title: 'مرحباً في واجهة محاضراتي الجديدة!',
      body: 'واجهة جديدة كلياً مع ميزات أقوى'
    },
    {
      id: 'nav',
      icon: <Navigation className="w-16 h-16 text-[#2196F3]" />,
      title: 'أقسام التطبيق',
      body: 'تنقل بين الأقسام بسهولة عبر شريط التنقل السفلي الجديد'
    },
    {
      id: 'streak',
      icon: <Flame className="w-16 h-16 text-orange-500" />,
      title: 'حافظ على ستريكك اليومي',
      body: 'كل يوم تفتح التطبيق = +1 يوم لستريكك 🔥'
    },
    {
      id: 'leaderboard',
      icon: <Trophy className="w-16 h-16 text-amber-400" />,
      title: 'لوحة الصدارة',
      body: 'تنافس مع زملائك على لوحة الصدارة وكن الأول 🥇'
    },
    {
      id: 'recordings',
      icon: <Mic className="w-16 h-16 text-emerald-500" />,
      title: 'تسجيل المحاضرات',
      body: 'اسمع محاضراتك مباشرة من داخل التطبيق 🎤'
    },
    {
      id: 'ready',
      icon: <CheckCircle2 className="w-16 h-16 text-[#2196F3]" />,
      title: 'أنت جاهز!',
      body: 'استمتع بالتجربة الجديدة الآن'
    }
  ];

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(s => s + 1);
    } else {
      onComplete();
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(s => s - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[#F5F7FA] dark:bg-zinc-950 flex flex-col pt-16 overflow-hidden" dir="rtl">
      
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col items-center w-full max-w-sm"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-full p-8 shadow-[0_2px_12px_rgba(0,0,0,0.06)] mb-8">
              {slides[currentSlide].icon}
            </div>
            
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 mb-4 tracking-tight">
              {slides[currentSlide].title}
            </h1>
            
            <p className="text-lg text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
              {slides[currentSlide].body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-8 pb-12 w-full max-w-md mx-auto flex flex-col gap-8">
        <div className="flex justify-center gap-3">
          {slides.map((_, i) => (
            <div 
              key={i} 
              className={`h-2 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-8 bg-[#2196F3]' : 'w-2 bg-slate-300 dark:bg-zinc-700'}`}
            />
          ))}
        </div>
        
        <div className="flex gap-4">
          {currentSlide > 0 && (
            <button
              onClick={prevSlide}
              className="w-14 h-14 flex items-center justify-center bg-white dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-transform active:scale-95 border border-slate-100 dark:border-zinc-700 font-bold"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          
          <button
            onClick={nextSlide}
            className="flex-1 h-14 bg-[#2196F3] text-white rounded-full font-bold text-lg shadow-[0_4px_16px_rgba(33,150,243,0.3)] transition-transform active:scale-95 flex items-center justify-center gap-2"
          >
            {currentSlide === slides.length - 1 ? 'ابدأ الآن' : 'التالي'}
            {currentSlide < slides.length - 1 && <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
      </div>
      
    </div>
  );
}
