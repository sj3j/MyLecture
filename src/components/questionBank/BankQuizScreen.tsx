import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, X, ArrowRight, Play, CheckCircle } from 'lucide-react';
import { BankQuestion } from '../../types/questionBank.types';
import { saveUserBankAnswer } from '../../services/questionBankService';
import { ConfirmModal } from '../ui/ConfirmModal';

interface Props {
  questions: BankQuestion[];
  onFinish: () => void;
  onBack: () => void;
  userId: string;
}

export default function BankQuizScreen({ questions, onFinish, onBack, userId }: Props) {
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [answers, setAnswers] = useState<Record<string, string>>({}); 
  const [isFinished, setIsFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);

  const handleAnswer = async (q: BankQuestion, choiceText: string) => {
    if (isFinished) return;
    setAnswers(prev => ({ ...prev, [q.id]: choiceText }));
  };

  const executeFinish = async () => {
    let correct = 0;
    for (const q of questions) {
       const userAns = answers[q.id];
       if (userAns) {
         const isCorrect = userAns === q.correctAnswer;
         if (isCorrect) correct++;
         await saveUserBankAnswer(userId, q.id, userAns, isCorrect, sessionId, q.tags);
       }
    }
    setScore(correct);
    setIsFinished(true);
  };

  const handleFinish = async () => {
    if (Object.keys(answers).length < questions.length) {
      setShowConfirmFinish(true);
      return;
    }
    await executeFinish();
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
        <span className="font-bold text-lg dark:text-white">اختبار مخصص</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 pb-20">
        {isFinished && (
           <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-6 rounded-2xl text-center mb-6">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mb-2">انتهى الاختبار</h2>
              <p className="text-xl font-bold text-slate-800 dark:text-slate-200">
                أجبت على {score}/{questions.length} بشكل صحيح
              </p>
           </div>
        )}

        {questions.map((q, index) => {
          const userAns = answers[q.id];
          
          return (
            <div key={q.id} className="bg-white dark:bg-zinc-800 rounded-3xl p-5 shadow-sm border border-slate-100 dark:border-zinc-700">
              <div className="flex justify-between items-start mb-4">
                 <span className="px-3 py-1 bg-slate-100 text-slate-600 dark:bg-zinc-700 dark:text-slate-300 rounded font-bold text-sm">
                   السؤال {index + 1}
                 </span>
                 {isFinished && userAns && (
                    <span className="font-bold flex items-center gap-1">
                      {userAns === q.correctAnswer ? (
                         <span className="text-emerald-600 flex items-center gap-1"><Check className="w-4 h-4"/> صحيح</span>
                      ) : (
                         <span className="text-red-600 flex items-center gap-1"><X className="w-4 h-4"/> خطأ</span>
                      )}
                    </span>
                 )}
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 select-none" dir="auto">{q.stem}</h3>
              
              <div className="space-y-2">
                {q.choices.map((c, i) => {
                  let btnClass = "w-full text-right p-4 rounded-2xl font-bold transition-all border-2 ";
                  const isSelected = userAns === c.text;
                  const isActualCorrect = c.text === q.correctAnswer;

                  if (!isFinished) {
                    if (isSelected) {
                      btnClass += "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:border-sky-400 dark:text-sky-300";
                    } else {
                      btnClass += "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-300";
                    }
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
                      disabled={isFinished}
                      className={btnClass}
                      dir="auto"
                    >
                       {c.text}
                    </button>
                  );
                })}
              </div>

              {isFinished && q.explanation && (
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
        })}
      </div>

      {!isFinished && (
        <div className="p-6 bg-white dark:bg-zinc-800 border-t border-slate-100 dark:border-zinc-700">
          <button 
            onClick={handleFinish}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg rounded-2xl transition-colors shadow-lg shadow-emerald-500/20"
          >
            إنهاء الاختبار
          </button>
        </div>
      )}
      
      <ConfirmModal
        isOpen={showConfirmFinish}
        onClose={() => setShowConfirmFinish(false)}
        onConfirm={executeFinish}
        title="إنهاء الاختبار"
        message="هناك أسئلة لم تقم بالإجابة عليها، هل أنت متأكد من رغبتك في إنهاء الاختبار الآن؟"
        confirmText="نعم، إنهاء الاختبار"
        cancelText="العودة للاختبار"
        isDestructive={false}
      />
    </motion.div>
  );
}
