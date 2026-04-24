import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { MCQQuestion } from '../../types/mcq.types';
import { ArrowRight, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { enableAntiScreenshot, disableAntiScreenshot } from '../../services/antiCheatService';

interface Props {
  questions: MCQQuestion[];
  answers: Record<string, { selected: string, isCorrect: boolean }>;
  onBack: () => void;
  lectureId: string;
}

export default function MCQReviewScreen({ questions, answers, onBack, lectureId }: Props) {
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (user && lectureId) {
      enableAntiScreenshot(user.uid, lectureId);
    }
    return () => {
      if (user && lectureId) disableAntiScreenshot(user.uid, lectureId);
    };
  }, [lectureId]);

  const filteredQuestions = questions.filter(q => {
    if (filter === 'all') return true;
    const isCorrect = answers[q.id]?.isCorrect;
    if (filter === 'correct') return isCorrect;
    return !isCorrect;
  });

  const correctTotal = Object.values(answers).filter(a => a.isCorrect).length;

  return (
    <div className="flex flex-col h-full bg-stone-50 dark:bg-zinc-900" dir="rtl">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-zinc-800 border-b border-slate-100 dark:border-zinc-700 shadow-sm z-10">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={onBack} className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-slate-300">
            <ArrowRight className="w-6 h-6" />
          </button>
          <span className="font-bold text-lg text-slate-900 dark:text-white">مراجعة الإجابات</span>
        </div>
        
        {/* Filter Chips */}
        <div className="flex gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="الكل" count={questions.length} />
          <FilterChip active={filter === 'correct'} onClick={() => setFilter('correct')} label="صحيح" count={correctTotal} color="green" />
          <FilterChip active={filter === 'incorrect'} onClick={() => setFilter('incorrect')} label="خطأ" count={questions.length - correctTotal} color="red" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredQuestions.map((q, index) => {
          const ans = answers[q.id];
          const isExpanded = expandedId === q.id;
          
          return (
            <motion.div 
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-white dark:bg-zinc-800 rounded-2xl p-5 border-2 ${ans?.isCorrect ? 'border-green-100 dark:border-green-900/30' : 'border-red-100 dark:border-red-900/30'}`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                 <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white ${ans?.isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                      {questions.findIndex(x => x.id === q.id) + 1}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded">
                       <div className={`w-1.5 h-1.5 rounded-full ${q.difficulty === 'easy' ? 'bg-green-500' : q.difficulty === 'medium' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                       {q.difficulty === 'easy' ? 'سهل' : q.difficulty === 'medium' ? 'متوسط' : 'صعب'}
                    </span>
                 </div>
                 {ans?.isCorrect ? <Check className="w-5 h-5 text-green-500 flex-shrink-0" /> : <X className="w-5 h-5 text-red-500 flex-shrink-0" />}
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 select-none" dir="auto" onContextMenu={(e) => e.preventDefault()}>{q.stem}</h3>

              <div className="space-y-2 mb-4">
                {/* Only show selected and correct answers to save space */}
                {q.type === 'true_false' ? (
                  <>
                     <ReviewChoice label="True" text="صحيح" isSelected={ans?.selected === 'True'} isCorrectAnswer={q.correctAnswer === 'True'} />
                     <ReviewChoice label="False" text="خطأ" isSelected={ans?.selected === 'False'} isCorrectAnswer={q.correctAnswer === 'False'} />
                  </>
                ) : (
                  q.choices.map((c: any) => {
                    const isSelected = ans?.selected === c.label;
                    const isCorrectAnswer = q.correctAnswer === c.label;
                    if (!isSelected && !isCorrectAnswer) return null; // Hide untargeted wrong answers
                    return <ReviewChoice key={c.label} label={c.label} text={c.text} isSelected={isSelected} isCorrectAnswer={isCorrectAnswer} />
                  })
                )}
              </div>

              {/* Explanation Accordion */}
              <button 
                onClick={() => setExpandedId(isExpanded ? null : q.id)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="font-bold text-sm">عرض الشرح</span>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {isExpanded && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }} 
                  animate={{ height: 'auto', opacity: 1 }} 
                  className="mt-3 p-4 bg-sky-50 dark:bg-sky-900/10 text-sky-900 dark:text-sky-100 rounded-xl text-sm font-medium leading-relaxed"
                >
                  {q.explanation}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ReviewChoice({ label, text, isSelected, isCorrectAnswer }: { label: string, text: string, isSelected: boolean, isCorrectAnswer: boolean, key?: React.Key }) {
  let style = "bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-slate-400";
  let icon = null;
  
  if (isCorrectAnswer) {
    style = "bg-green-50 dark:bg-green-900/20 border-green-500 text-green-900 dark:text-green-100 relative shadow-sm";
    icon = <Check className="w-4 h-4 text-green-600" />;
  } else if (isSelected && !isCorrectAnswer) {
    style = "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-100 relative shadow-sm";
    icon = <X className="w-4 h-4 text-red-600" />;
  }

  return (
     <div className={`w-full text-left p-3 rounded-xl border-2 flex items-start gap-4 ${style}`} dir="auto">
       <div className="flex-shrink-0 font-bold text-sm mt-0.5">{label}.</div>
       <span className="font-semibold text-sm sm:text-base leading-tight flex-1">{text}</span>
       {icon && <div className="flex-shrink-0 mt-0.5">{icon}</div>}
     </div>
  );
}

function FilterChip({ active, onClick, label, count, color = 'blue' }: any) {
  let activeClass = '';
  if (color === 'blue') activeClass = 'bg-slate-800 text-white dark:bg-white dark:text-slate-900';
  if (color === 'green') activeClass = 'bg-green-600 text-white';
  if (color === 'red') activeClass = 'bg-red-600 text-white';

  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm transition-colors ${
        active ? activeClass : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
      }`}
    >
      {label}
      <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-black/20 dark:bg-black/10' : 'bg-white dark:bg-zinc-700'}`}>
        {count}
      </span>
    </button>
  );
}
