import React, { useReducer, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lecture } from '../../types';
import { MCQQuestion } from '../../types/mcq.types';
import { Check, X, ChevronUp, ArrowUp, Loader2 } from 'lucide-react';
import { trackEvent } from '../../lib/analytics';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { lockSingleAnswer, getLockedAnswers } from '../../services/mcqAnswerService';
import { enableAntiScreenshot, disableAntiScreenshot } from '../../services/antiCheatService';

interface Props {
  lecture: Lecture;
  questions: MCQQuestion[];
  onFinish: (answers: Record<string, { selected: string, isCorrect: boolean }>, correctCount: number, score: number) => void;
  onClose: () => void;
}

type QuizState = {
  answers: Record<string, { selected: string, isCorrect: boolean, answered: boolean }>;
  answeredCount: number;
};

type QuizAction = 
  | { type: 'SELECT_ANSWER'; payload: { questionId: string; selected: string; isCorrect: boolean } }
  | { type: 'RESTORE_ANSWERS'; payload: Record<string, { selected: string; isCorrect: boolean }> };

function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'RESTORE_ANSWERS': {
      const restored = { ...state.answers };
      let restoredCount = state.answeredCount;
      Object.keys(action.payload).forEach(qId => {
         if (!restored[qId]?.answered) {
           restored[qId] = {
             selected: action.payload[qId].selected,
             isCorrect: action.payload[qId].isCorrect,
             answered: true
           };
           restoredCount++;
         }
      });
      return { answers: restored, answeredCount: restoredCount };
    }
    case 'SELECT_ANSWER': {
      if (state.answers[action.payload.questionId]?.answered) return state; 
      
      const newAnswers = {
        ...state.answers,
        [action.payload.questionId]: {
          selected: action.payload.selected,
          isCorrect: action.payload.isCorrect,
          answered: true
        }
      };
      
      return {
        ...state,
        answers: newAnswers,
        answeredCount: state.answeredCount + 1,
      };
    }
    default:
      return state;
  }
}

export default function MCQQuizScreen({ lecture, questions, onFinish, onClose }: Props) {
  const [state, dispatch] = useReducer(quizReducer, {
    answers: {},
    answeredCount: 0,
  });
  
  const [showDrawer, setShowDrawer] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [isRetake, setIsRetake] = useState<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      enableAntiScreenshot(user.uid, lecture.id, () => {
        alert("تم اكتشاف محاولة تصوير. هذا مخالف. قد يؤدي تكرار هذا للفصل.");
      });
    }

    return () => {
      if (user) {
        disableAntiScreenshot(user.uid, lecture.id);
      }
    };
  }, [lecture.id]);

  useEffect(() => {
    // Check if it's a retake and fetch locked answers if it's the first attempt
    const checkAttempt = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const docRef = doc(db, `userMCQAnswers/${user.uid}/lectures/${lecture.id}`);
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().hasCompletedFirstAttempt) {
          setIsRetake(true);
        } else {
          setIsRetake(false);
          // Fetch existing locked answers for partial attempt
          const locked = await getLockedAnswers(user.uid, lecture.id);
          if (Object.keys(locked).length > 0) {
            dispatch({ type: 'RESTORE_ANSWERS', payload: locked });
          }
        }
      } catch (e) {
        setIsRetake(false);
      }
    };
    checkAttempt();
  }, [lecture.id]);

  const allAnswered = state.answeredCount === questions.length;

  const [loadingQuestionId, setLoadingQuestionId] = useState<string | null>(null);

  const handleSelect = async (questionId: string, choiceLabel: string, expectedAnswer: string, index: number) => {
    if (state.answers[questionId]?.answered || loadingQuestionId) return;
    
    let isCorrect = choiceLabel === expectedAnswer;
    
    // Only lock per-question for the first attempt
    if (isRetake === false) {
      setLoadingQuestionId(questionId);
      const user = auth.currentUser;
      const questionData = questions.find(q => q.id === questionId);
      const res = await lockSingleAnswer(
        user?.uid || '',
        lecture.id,
        questionId,
        choiceLabel,
        isCorrect,
        questionData?.explanation || '',
        expectedAnswer
      );
      setLoadingQuestionId(null);
      // In case server overrides correct status
      if (res && res.isCorrect !== undefined) {
        isCorrect = res.isCorrect;
      }
    }

    // Analytics
    trackEvent('mcq_question_answered', { questionId, isCorrect });
    
    dispatch({ type: 'SELECT_ANSWER', payload: { questionId, selected: choiceLabel, isCorrect } });

    // Auto scroll to next unanswered after 400ms
    setTimeout(() => {
      // If this was the last question overall, and now all answered, scroll to bottom
      if (state.answeredCount + 1 === questions.length) {
         if (containerRef.current) {
            containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
         }
         return;
      }

      // Find next unanswered
      let nextIndex = index + 1;
      while (nextIndex < questions.length) {
        if (!state.answers[questions[nextIndex].id]?.answered) {
          questionRefs.current[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
        nextIndex++;
      }
    }, 400);
  };

  const handleFinish = () => {
    let correctCount = 0;
    Object.values(state.answers).forEach((a: any) => { if (a.isCorrect) correctCount++ });
    const score = (correctCount / questions.length) * 100;
    
    trackEvent('mcq_quiz_completed', { lectureId: lecture.id, score });
    onFinish(state.answers, correctCount, score);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Show FAB if scrolled past ~ 5 questions (rough estimate 5 * 300px = 1500px)
    if (e.currentTarget.scrollTop > 800) {
      setShowFab(true);
    } else {
      setShowFab(false);
    }
  };

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const jumpTo = (index: number) => {
    setShowDrawer(false);
    questionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="flex flex-col h-full bg-stone-50 dark:bg-zinc-900 overflow-hidden relative" dir="rtl">
      
      {/* Sticky Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-slate-100 dark:border-zinc-700 z-30 shrink-0 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
          
          <div className="flex-1 px-3 text-center">
             <h2 className="font-bold text-sm sm:text-base text-slate-800 dark:text-stone-100 truncate" dir="auto">
               {lecture.title}
             </h2>
             <span className="text-xs text-slate-500 font-medium">{questions.length} سؤال</span>
          </div>

          <button 
             onClick={() => setShowDrawer(true)}
             className="p-2 -ml-2 bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-200 transition-colors"
          >
             <ChevronUp className="w-5 h-5 rotate-180" />
          </button>
        </div>
        
        <div className="flex items-center justify-between text-xs font-bold">
           {isRetake === null ? (
              <div className="w-20 h-5 bg-slate-100 dark:bg-zinc-700 animate-pulse rounded" />
           ) : isRetake ? (
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 dark:bg-zinc-700 dark:text-slate-400 rounded-lg">إعادة — لا تؤثر على ترتيبك</span>
           ) : (
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg flex items-center gap-1">🏆 أول محاولة</span>
           )}
           <span className="text-slate-500 dark:text-slate-400">أجبت على {state.answeredCount} من {questions.length}</span>
        </div>
      </div>

      {/* Scrollable Body */}
      <div 
         ref={containerRef}
         onScroll={handleScroll}
         className="flex-1 overflow-y-auto px-3 sm:px-4 py-6 scroll-smooth"
      >
        <div className="max-w-2xl mx-auto space-y-3 pb-[150px]">
          {questions.map((question, index) => {
            const answerState = state.answers[question.id];
            const isAnswered = !!answerState;

            return (
              <div 
                key={question.id} 
                ref={el => questionRefs.current[index] = el}
                className="bg-white dark:bg-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-100 dark:border-zinc-700 relative overflow-hidden"
              >
                {/* Meta details */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                     <span className="font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1">
                       Q{index + 1} 
                       <span className="text-slate-300 dark:text-zinc-600 px-1">·</span>
                       <span className="text-xs">
                          {question.difficulty === 'easy' ? 'سهل 🟢' : question.difficulty === 'medium' ? 'متوسط 🟡' : 'صعب 🔴'}
                       </span>
                     </span>
                  </div>
                  {isAnswered && (
                     <motion.div 
                       initial={{ opacity: 0, scale: 0.8 }}
                       animate={{ opacity: 1, scale: 1 }}
                       className="flex items-center gap-1 font-bold text-sm"
                     >
                        {answerState.isCorrect ? (
                           <span className="text-green-600 dark:text-green-500 flex items-center gap-1">صحيح <Check className="w-4 h-4"/></span>
                        ) : (
                           <span className="text-red-600 dark:text-red-500 flex items-center gap-1">خطأ <X className="w-4 h-4"/></span>
                        )}
                     </motion.div>
                  )}
                </div>
                
                {/* Stem */}
                <h3 className="text-[17px] sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed mb-5 select-none" dir="auto" onContextMenu={(e) => e.preventDefault()}>
                  {question.stemFormat === 'except' && <span className="inline-block px-1.5 py-0.5 mr-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-black rounded uppercase">Except</span>}
                  {question.stemFormat === 'regarding' && <span className="inline-block px-1.5 py-0.5 mr-2 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-black rounded uppercase">Regarding</span>}
                  {question.stem}
                </h3>

                {/* Choices */}
                <div className="space-y-2">
                  {question.type === 'true_false' ? (
                    <>
                      <ChoiceRow 
                        label="True" text="صحيح" expected={question.correctAnswer} 
                        isAnswered={isAnswered} answerState={answerState} 
                        isLoading={loadingQuestionId === question.id}
                        onSelect={() => handleSelect(question.id, 'True', question.correctAnswer, index)} />
                      <ChoiceRow 
                        label="False" text="خطأ" expected={question.correctAnswer} 
                        isAnswered={isAnswered} answerState={answerState} 
                        isLoading={loadingQuestionId === question.id}
                        onSelect={() => handleSelect(question.id, 'False', question.correctAnswer, index)} />
                    </>
                  ) : (
                    question.choices.map(c => (
                      <ChoiceRow 
                        key={c.label} label={c.label} text={c.text} expected={question.correctAnswer}
                        isAnswered={isAnswered} answerState={answerState}
                        isLoading={loadingQuestionId === question.id}
                        onSelect={() => handleSelect(question.id, c.label, question.correctAnswer, index)}
                      />
                    ))
                  )}
                </div>

                {/* Explanation */}
                <AnimatePresence>
                  {isAnswered && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-[#FFFDE7] dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-900/30 rounded-xl p-4">
                        <div className="flex gap-2 items-start">
                          <span className="text-xl leading-none shadow-sm">💡</span>
                          <div>
                            <span className="font-bold text-amber-900 dark:text-amber-500 text-sm block mb-1">الشرح:</span>
                            <p className="text-amber-950/80 dark:text-amber-200/80 text-sm leading-relaxed" dir="rtl">
                              {question.explanation}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky Footer */}
      <AnimatePresence>
         {allAnswered && (
            <motion.div 
               initial={{ y: 150 }}
               animate={{ y: 0 }}
               exit={{ y: 150 }}
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className="absolute bottom-0 left-0 w-full bg-white dark:bg-zinc-800 border-t border-slate-100 dark:border-zinc-700 p-4 sm:p-5 z-40 rounded-t-3xl shadow-[0_-10px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_20px_rgba(0,0,0,0.2)]"
            >
               <div className="max-w-2xl mx-auto flex flex-col items-center gap-3">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                     🎉 أجبت على كل الأسئلة!
                  </span>
                  <button 
                     onClick={handleFinish}
                     className="w-full py-4 bg-sky-500 hover:bg-sky-600 text-white font-bold text-lg rounded-xl shadow-md shadow-sky-500/20 transition-transform active:scale-95"
                  >
                     إنهاء وعرض النتيجة
                  </button>
               </div>
            </motion.div>
         )}
      </AnimatePresence>

      {/* Scroll to top FAB */}
      <AnimatePresence>
        {showFab && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={scrollToTop}
            className={`absolute ${allAnswered ? 'bottom-32' : 'bottom-6'} right-6 w-12 h-12 bg-white dark:bg-zinc-700 text-slate-800 dark:text-white rounded-full shadow-xl flex items-center justify-center border border-slate-100 dark:border-zinc-600 z-30 transition-all hover:bg-slate-50`}
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Overview Drawer */}
      <AnimatePresence>
        {showDrawer && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDrawer(false)}
              className="absolute inset-0 bg-black/40 z-50 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute bottom-0 w-full bg-white dark:bg-zinc-800 rounded-t-3xl p-6 pb-12 z-50 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg dark:text-white">نظرة عامة على الأسئلة</h3>
                <button onClick={() => setShowDrawer(false)} className="p-2 bg-slate-100 dark:bg-zinc-700 rounded-full text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-10 gap-3" dir="ltr">
                {questions.map((q, idx) => {
                   const ans = state.answers[q.id];
                   let circleClass = "bg-slate-100 dark:bg-zinc-700 text-slate-400";
                   if (ans) {
                     circleClass = ans.isCorrect ? "bg-green-500 text-white shadow-md shadow-green-500/20" : "bg-red-500 text-white shadow-md shadow-red-500/20";
                   }
                   
                   return (
                     <button
                       key={q.id}
                       onClick={() => jumpTo(idx)}
                       className={`w-12 h-12 rounded-xl font-bold flex items-center justify-center transition-all ${circleClass}`}
                     >
                       {idx + 1}
                     </button>
                   );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-component for individual choices
function ChoiceRow({ label, text, expected, isAnswered, answerState, onSelect, isLoading }: any) {
  const isSelected = answerState?.selected === label;
  const isCorrectOption = expected === label;
  
  let barWidth = "0%";
  let bgFill = "bg-transparent";
  let suffix = "";
  
  if (isAnswered) {
    if (isCorrectOption) {
      barWidth = "100%";
      bgFill = "bg-green-100 dark:bg-green-900/30";
      suffix = "✅";
    } else if (isSelected) {
      barWidth = "100%";
      bgFill = "bg-red-100 dark:bg-red-900/30";
      suffix = "❌";
    } else {
      bgFill = "bg-transparent";
    }
  }

  return (
    <motion.button
      whileTap={!isAnswered && !isLoading ? { scale: 0.97 } : {}}
      onClick={onSelect}
      disabled={isAnswered || isLoading}
      className={`w-full relative text-left rounded-xl transition-all overflow-hidden border ${
        isAnswered 
          ? (isCorrectOption ? 'border-green-200 dark:border-green-800' : isSelected ? 'border-red-200 dark:border-red-800' : 'border-transparent')
          : 'border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700/50'
      } ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
      dir="auto"
    >
      {/* Background fill for Telegram style */}
      {isAnswered && (
         <motion.div 
           initial={{ width: '0%' }}
           animate={{ width: barWidth }}
           transition={{ duration: 0.3, ease: 'easeOut' }}
           className={`absolute inset-0 z-0 ${bgFill}`}
         />
      )}
      
      <div className="relative z-10 p-3 sm:p-4 flex items-center gap-3">
        {!isAnswered ? (
           <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-zinc-600 flex-shrink-0 flex items-center justify-center">
             {isLoading && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
           </div>
        ) : (
           <div className="w-5 flex items-center justify-center font-bold text-sm flex-shrink-0">
             {isCorrectOption ? '100%' : isSelected ? '100%' : '0%'}
           </div>
        )}
        
        <div className="flex-1 text-sm sm:text-base font-medium text-slate-700 dark:text-slate-200 pr-2 select-none" onContextMenu={(e) => e.preventDefault()}>
          {text}
        </div>
        
        {isAnswered && suffix && (
          <div className="flex-shrink-0 flex items-center justify-center bg-white/50 dark:bg-black/20 rounded-full p-0.5 select-none text-xl lg:text-lg text-lg">
            {suffix}
          </div>
        )}
      </div>
    </motion.button>
  );
}
