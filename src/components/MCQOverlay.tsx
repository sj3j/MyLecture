import React, { useState, useReducer, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lecture, UserProfile, Language } from '../types';
import { X, Loader2, ArrowRight } from 'lucide-react';
import { generateMCQsForLecture } from '../services/mcqGenerationService';
import { getFirstAttemptStatus, finalizeFirstAttempt, submitRetakeAttempt } from '../services/mcqAnswerService';
import { checkMCQBanStatus } from '../services/antiCheatService';
import { getQuestionsForLecture } from '../services/questionBankService';
import { BankQuestion } from '../types/questionBank.types';

import MCQIntroScreen from './mcq/MCQIntroScreen';
import MCQQuizScreen from './mcq/MCQQuizScreen';
import MCQResultScreen from './mcq/MCQResultScreen';
import MCQReviewScreen from './mcq/MCQReviewScreen';
import BankBrowseScreen from './questionBank/BankBrowseScreen';
import BankQuizSetupScreen from './questionBank/BankQuizSetupScreen';
import BankQuizScreen from './questionBank/BankQuizScreen';

export type MCQStackRoute = 'loading' | 'intro' | 'quiz' | 'result' | 'review' | 'banned' | 'bank_browse' | 'bank_quiz_setup' | 'bank_quiz' | 'bank_result';

interface MCQOverlayProps {
  lecture: Lecture;
  user: UserProfile;
  lang: Language;
  onClose: () => void;
}

export default function MCQOverlay({ lecture, user, lang, onClose }: MCQOverlayProps) {
  const isRtl = lang === 'ar';
  const [route, setRoute] = useState<MCQStackRoute>('loading');
  
  // High-level state to pass to screens
  const [questions, setQuestions] = useState<any[]>([]);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankQuizQuestions, setBankQuizQuestions] = useState<BankQuestion[]>([]);
  const [firstAttemptStatus, setFirstAttemptStatus] = useState<{hasCompleted: boolean, score: number | null}>({hasCompleted: false, score: null});
  const [finalResult, setFinalResult] = useState<any>(null); // from submitting
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const initMCQ = async () => {
      try {
        const isBanned = await checkMCQBanStatus(user.uid);
        if (!active) return;
        
        if (isBanned) {
          setRoute('banned');
          return;
        }

        // 0. Fetch Bank Questions
        const bq = await getQuestionsForLecture(lecture.id, lecture.subjectId || '');
        if (active) setBankQuestions(bq);

        // 1. Fetch first attempt status
        const status = await getFirstAttemptStatus(user.uid, lecture.id);
        if (!active) return;
        setFirstAttemptStatus(status);

        // 2. Generate or fetch questions
        const fetchedQuestions = await generateMCQsForLecture(lecture.id, lecture.category, lecture.pdfUrl);
        if (!active) return;
        
        setQuestions(fetchedQuestions);
        setRoute('intro');
      } catch (err: any) {
        console.error(err);
        if (active) {
          setErrorMsg('فشل التوليد. يرجى المحاولة مرة أخرى.'); // "Generation failed. Please try again."
        }
      }
    };
    initMCQ();
    return () => { active = false; };
  }, [lecture, user.uid]);

  const handleStartQuiz = () => setRoute('quiz');
  
  const handleFinishQuiz = async (answersState: any, correctCount: number, score: number) => {
    // Process submission
    try {
      let result;
      if (!firstAttemptStatus.hasCompleted) {
         result = await finalizeFirstAttempt(user.uid, lecture.id, lecture.category, answersState, questions.length);
      } else {
         result = await submitRetakeAttempt(user.uid, lecture.id, answersState, questions.length);
      }
      setFinalResult({ ...result, answers: answersState });
      setRoute('result');
    } catch (e) {
      console.error(e);
      alert('Error submitting answers.');
    }
  };

  useEffect(() => {
    const handleBrowse = (e: any) => {
      setRoute('bank_browse');
    };
    const handleQuizSetup = (e: any) => {
      setRoute('bank_quiz_setup');
    };
    window.addEventListener('open-bank-browse', handleBrowse);
    window.addEventListener('open-bank-quiz', handleQuizSetup);
    return () => {
      window.removeEventListener('open-bank-browse', handleBrowse);
      window.removeEventListener('open-bank-quiz', handleQuizSetup);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-zinc-900 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      <AnimatePresence mode="wait">
        {route === 'loading' && (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center flex-col p-6"
          >
            {errorMsg ? (
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold mb-2 dark:text-white">{errorMsg}</h2>
                <button onClick={onClose} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">{isRtl ? 'إغلاق' : 'Close'}</button>
              </div>
            ) : (
              <div className="text-center">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  {/* Pulse animation matching design system */}
                  <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-full animate-ping opacity-75"></div>
                  <div className="relative w-full h-full bg-white dark:bg-zinc-800 border-4 border-blue-500 rounded-full flex items-center justify-center shadow-lg">
                     <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  </div>
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-stone-100 mb-2">جاري توليد الأسئلة بالذكاء الاصطناعي...</h2>
                <p className="text-slate-500 font-medium">قد يستغرق هذا 10-30 ثانية</p>
              </div>
            )}
          </motion.div>
        )}

        {route === 'banned' && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center p-6 bg-red-50 dark:bg-red-900/10"
          >
             <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200">
               <X className="w-10 h-10" />
             </div>
             <h2 className="text-2xl font-black text-red-700 dark:text-red-500 mb-2 text-center">🚫 تم تعليق صلاحيتك للوصول للاختبارات</h2>
             <p className="text-slate-600 dark:text-slate-400 font-medium text-center max-w-md">يرجى التواصل مع الإدارة. تم اكتشاف محاولات تصوير شاشة أو خروج من التطبيق بشكل متكرر أثناء الامتحانات السابقة.</p>
             <button onClick={onClose} className="mt-8 px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 active:scale-95 transition-all">العودة للرئيسية</button>
          </motion.div>
        )}

        {route === 'intro' && (
          <MCQIntroScreen 
            lecture={lecture} 
            questionsCount={questions.length}
            bankQuestions={bankQuestions}
            firstAttemptStatus={firstAttemptStatus}
            onStart={handleStartQuiz}
            onClose={onClose}
            userId={user.uid}
          />
        )}

        {route === 'quiz' && (
          <MCQQuizScreen 
            lecture={lecture}
            questions={questions}
            onFinish={handleFinishQuiz}
            onClose={onClose}
          />
        )}

        {route === 'result' && (
          <MCQResultScreen 
            lecture={lecture}
            result={finalResult}
            isFirstAttempt={!firstAttemptStatus.hasCompleted}
            questionsCount={questions.length}
            onReview={() => setRoute('review')}
            onRetake={() => {
               // Update local stat to pretend it's a retake now
               setFirstAttemptStatus({ hasCompleted: true, score: finalResult.score });
               setRoute('intro');
            }}
            onClose={onClose}
          />
        )}

        {route === 'review' && (
          <MCQReviewScreen 
            questions={questions}
            answers={finalResult.answers}
            onBack={() => setRoute('result')}
            lectureId={lecture.id}
          />
        )}

        {route === 'bank_browse' && (
          <BankBrowseScreen 
            questions={bankQuestions}
            onBack={() => setRoute('intro')}
            userId={user.uid}
          />
        )}

        {route === 'bank_quiz_setup' && (
          <BankQuizSetupScreen 
            bankQuestions={bankQuestions}
            onStartQuiz={(filtered) => {
               setBankQuizQuestions(filtered);
               setRoute('bank_quiz');
            }}
            onBack={() => setRoute('intro')}
          />
        )}

        {route === 'bank_quiz' && (
          <BankQuizScreen 
            questions={bankQuizQuestions}
            onFinish={() => {}} // finishes internally
            onBack={() => setRoute('intro')}
            userId={user.uid}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
