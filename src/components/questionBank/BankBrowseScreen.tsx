import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { BankQuestion } from '../../types/questionBank.types';
import { saveUserBankAnswer } from '../../services/questionBankService';

interface Props {
  questions: BankQuestion[];
  onBack: () => void;
  userId: string;
}

export default function BankBrowseScreen({ questions, onBack, userId }: Props) {
  // sessionId for tracking
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [answers, setAnswers] = useState<Record<string, string>>({}); // qId -> selected choice

  const handleAnswer = async (q: BankQuestion, choiceText: string) => {
    if (answers[q.id]) return; // already answered
    setAnswers(prev => ({ ...prev, [q.id]: choiceText }));
    const isCorrect = choiceText === q.correctAnswer;
    await saveUserBankAnswer(userId, q.id, choiceText, isCorrect, sessionId, q.tags);
  };

  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }} 
      animate={{ x: 0, opacity: 1 }} 
      exit={{ x: -20, opacity: 0 }}
      className="flex flex-col h-full bg-stone-50 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 border-b border-slate-100 dark:border-zinc-700">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-700">
          <ArrowRight className="w-6 h-6" />
        </button>
        <span className="font-bold text-lg dark:text-white">تصفح بنك الأسئلة</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 pb-20">
        {questions.length === 0 ? (
          <p className="text-center p-10 text-slate-500">لا توجد أسئلة.</p>
        ) : (
          questions.map((q, index) => {
            const hasAnswered = !!answers[q.id];
            const isCorrect = answers[q.id] === q.correctAnswer;
            
            return (
              <div key={q.id} className="bg-white dark:bg-zinc-800 rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-zinc-700">
                <div className="flex gap-2 mb-3 flex-wrap">
                  {q.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600 dark:bg-zinc-700 dark:text-slate-300">
                      {t.replace('_', ' ')}
                    </span>
                  ))}
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                    {q.scope === 'lecture' ? 'هذه المحاضرة' : q.scope === 'subject' ? 'المادة' : 'عام'}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 select-none" dir="auto">{q.stem}</h3>
                
                <div className="space-y-2">
                  {q.choices.map((c, i) => {
                    let btnClass = "w-full text-right p-4 rounded-2xl font-bold transition-all border-2 ";
                    const isSelected = answers[q.id] === c.text;
                    const isActualCorrect = c.text === q.correctAnswer;

                    if (!hasAnswered) {
                      btnClass += "bg-stone-50 border-transparent hover:bg-slate-100 text-slate-700 dark:bg-zinc-900 dark:text-slate-300";
                    } else {
                      if (isActualCorrect) {
                        btnClass += "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-500/20";
                      } else if (isSelected) {
                        btnClass += "bg-red-50 border-red-500 text-red-700 dark:bg-red-500/20";
                      } else {
                        btnClass += "bg-stone-50 border-transparent text-slate-500 opacity-50 dark:bg-zinc-900";
                      }
                    }

                    return (
                      <button
                        key={i}
                        onClick={() => handleAnswer(q, c.text)}
                        disabled={hasAnswered}
                        className={btnClass}
                        dir="auto"
                      >
                         {c.text}
                      </button>
                    );
                  })}
                </div>

                {hasAnswered && q.explanation && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    className="mt-4 p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-900/50 rounded-2xl"
                  >
                    <p className="text-sm font-bold text-sky-800 dark:text-sky-300">💡 توضيح:</p>
                    <p className="text-sm text-sky-700 dark:text-sky-400 mt-2 font-medium" dir="auto">{q.explanation}</p>
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
