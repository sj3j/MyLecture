import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Stage, Subject, TRANSLATIONS, Language } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { GraduationCap, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface ProgressionModalProps {
  user: UserProfile;
  lang: Language;
}

export default function ProgressionModal({ user, lang }: ProgressionModalProps) {
  const isRtl = lang === 'ar';
  const t = TRANSLATIONS[lang];
  
  const [stages, setStages] = useState<Stage[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedOption, setSelectedOption] = useState<'pass' | 'fail' | 'tahmeel' | null>(null);
  const [selectedTahmeel, setSelectedTahmeel] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  const currentStageOrder = stages.find(s => s.id === user.stageId)?.order || 3; // Default to 3 for migration
  const nextStage = stages.find(s => s.order === currentStageOrder + 1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stagesSnap = await getDocs(query(collection(db, 'stages'), orderBy('order', 'asc')));
        setStages(stagesSnap.docs.map(d => d.data() as Stage));
        
        // Fetch subjects for the user's CURRENT stage (which they just finished)
        // because Tahmeel is carrying over subjects from the year they just completed.
        const currentId = user.stageId || 'stage_3';
        const subjSnap = await getDocs(query(collection(db, 'subjects'), where('stageId', '==', currentId)));
        setSubjects(subjSnap.docs.map(d => d.data() as Subject));
      } catch (error) {
        console.error("Error fetching progression data:", error);
      } finally {
        setFetchingData(false);
      }
    };
    fetchData();
  }, [user.stageId]);

  const handleSubmit = async () => {
    if (!selectedOption) return;
    setIsLoading(true);

    try {
      const payload: Partial<UserProfile> = {
        hasCompletedProgression: true,
        lastProgressionYear: "2026-2027" // This should ideally be fetched from app_settings
      };

      if (selectedOption === 'pass') {
        payload.stageId = nextStage ? nextStage.id : user.stageId;
        payload.tahmeelSubjects = [];
      } else if (selectedOption === 'fail') {
        payload.stageId = user.stageId; // Retain current stage
        payload.tahmeelSubjects = [];
      } else if (selectedOption === 'tahmeel') {
        payload.stageId = nextStage ? nextStage.id : user.stageId;
        payload.tahmeelSubjects = selectedTahmeel;
      }

      await updateDoc(doc(db, 'users', user.uid), payload);
    } catch (error) {
      console.error("Error updating progression:", error);
      alert(isRtl ? "حدث خطأ أثناء حفظ البيانات." : "An error occurred while saving data.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTahmeel = (subjectId: string) => {
    setSelectedTahmeel(prev => 
      prev.includes(subjectId) ? prev.filter(id => id !== subjectId) : [...prev, subjectId]
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-10 h-10 text-sky-600 dark:text-sky-400" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
            {isRtl ? 'عام دراسي جديد!' : 'New Academic Year!'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            {isRtl 
              ? 'يرجى تحديد حالتك الدراسية للمضي قدماً في التطبيق.'
              : 'Please select your academic status to continue using the app.'}
          </p>
        </div>

        {fetchingData ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            <button
              onClick={() => setSelectedOption('pass')}
              className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                selectedOption === 'pass' 
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' 
                  : 'border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300 hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-900/10'
              }`}
            >
              <CheckCircle className={`w-6 h-6 ${selectedOption === 'pass' ? 'text-green-500' : 'text-slate-400'}`} />
              <div className="text-start">
                <div className="font-bold">{isRtl ? 'ناجح' : 'Passed'}</div>
                <div className="text-sm opacity-80">
                  {isRtl ? `العبور إلى ${nextStage?.nameAr || 'المرحلة التالية'}` : `Move to ${nextStage?.nameEn || 'Next Stage'}`}
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelectedOption('fail')}
              className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                selectedOption === 'fail' 
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' 
                  : 'border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300 hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-900/10'
              }`}
            >
              <AlertTriangle className={`w-6 h-6 ${selectedOption === 'fail' ? 'text-red-500' : 'text-slate-400'}`} />
              <div className="text-start">
                <div className="font-bold">{isRtl ? 'راسب' : 'Repeating Year'}</div>
                <div className="text-sm opacity-80">
                  {isRtl ? 'البقاء في المرحلة الحالية' : 'Stay in current stage'}
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelectedOption('tahmeel')}
              className={`w-full p-4 rounded-2xl border-2 transition-all flex flex-col gap-2 ${
                selectedOption === 'tahmeel' 
                  ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' 
                  : 'border-slate-200 dark:border-zinc-800 hover:border-yellow-300 hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10'
              }`}
            >
              <div className="flex items-center gap-4 w-full">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedOption === 'tahmeel' ? 'border-yellow-500 bg-yellow-500 text-white' : 'border-slate-300'}`}>
                  {selectedOption === 'tahmeel' && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
                </div>
                <div className="text-start flex-1">
                  <div className={`font-bold ${selectedOption === 'tahmeel' ? 'text-yellow-700 dark:text-yellow-300' : 'text-slate-700 dark:text-slate-300'}`}>
                    {isRtl ? 'عبور بمواد تحميل' : 'Passed with Carry-over (Tahmeel)'}
                  </div>
                </div>
              </div>

              {selectedOption === 'tahmeel' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  className="mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-800/50 w-full"
                >
                  <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-3 text-start">
                    {isRtl ? 'اختر مواد التحميل:' : 'Select carry-over subjects:'}
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {subjects.map(sub => (
                      <label key={sub.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/50 dark:hover:bg-black/20 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTahmeel.includes(sub.id)}
                          onChange={() => toggleTahmeel(sub.id)}
                          className="w-4 h-4 rounded text-yellow-500 focus:ring-yellow-500"
                        />
                        <span className="text-sm text-yellow-900 dark:text-yellow-100 font-medium">
                          {isRtl ? sub.nameAr : sub.nameEn}
                        </span>
                      </label>
                    ))}
                    {subjects.length === 0 && (
                      <div className="text-sm text-yellow-700 opacity-70">
                        {isRtl ? 'لا توجد مواد متاحة.' : 'No subjects available.'}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </button>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selectedOption || isLoading || (selectedOption === 'tahmeel' && selectedTahmeel.length === 0)}
          className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRtl ? 'تأكيد وحفظ' : 'Confirm & Save')}
        </button>
      </motion.div>
    </div>
  );
}
