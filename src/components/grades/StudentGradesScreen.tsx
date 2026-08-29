import React, { useState, useEffect } from 'react';
import { Award, Target, Trophy, Clock, Search, X } from 'lucide-react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
import { StudentDegree } from '../../types/grades.types';
import { CATEGORIES, TRANSLATIONS } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { useStageContext } from '../../contexts/StageContext';

export interface StudentGradesScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StudentGradesScreen({ isOpen, onClose }: StudentGradesScreenProps) {
  const [degrees, setDegrees] = useState<StudentDegree[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'current' | 'archive'>('current');
  const { effectiveStageId } = useStageContext();

  useEffect(() => {
    if (!isOpen) return;
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, `degrees/${user.uid}/exams`), 
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setDegrees(snap.docs.map(d => ({ ...d.data(), id: d.id } as StudentDegree)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `degrees/${user.uid}/exams`);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen]);

  const filteredDegrees = degrees.filter(d => {
    const matchesSearch = d.examName.toLowerCase().includes(search.toLowerCase());
    const dStage = d.stageId;
    // If degree has no stageId, it's legacy (assume it belongs to current/default stage for now, so it shows up)
    const matchesStage = viewMode === 'current' 
      ? (!dStage || dStage === effectiveStageId) 
      : (dStage && dStage !== effectiveStageId);
      
    return matchesSearch && matchesStage;
  });

  const groupedDegrees = filteredDegrees.reduce((acc, degree) => {
    const mat = degree.material || 'other';
    if (!acc[mat]) acc[mat] = [];
    acc[mat].push(degree);
    return acc;
  }, {} as Record<string, StudentDegree[]>);

  const renderDegreeCard = (degree: StudentDegree) => {
    let passRateColor = 'bg-gray-200';
    let passRateTextColor = 'text-gray-500';
    
    const degNum = Number(degree.degree);
    const maxDegNum = Number(degree.maxDegree);
    
    const hasPassRate = typeof degree.passRate === 'number' && !isNaN(degree.passRate);
    const passRate = hasPassRate ? degree.passRate! : null;

    if (passRate !== null) {
      if (passRate >= 85) {
        passRateColor = 'bg-emerald-500';
        passRateTextColor = 'text-emerald-600 dark:text-emerald-400';
      } else if (passRate >= 65) {
        passRateColor = 'bg-sky-500';
        passRateTextColor = 'text-sky-600 dark:text-sky-400';
      } else if (passRate >= 50) {
        passRateColor = 'bg-amber-500';
        passRateTextColor = 'text-amber-600 dark:text-amber-400';
      } else {
        passRateColor = 'bg-red-500';
        passRateTextColor = 'text-red-600 dark:text-red-400';
      }
    }

    return (
      <div key={degree.id} className="shrink-0 w-[280px] sm:w-[320px] bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group snap-start">
        <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center">
            <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          {degree.createdAt && (
            <div className="flex items-center gap-1 text-xs font-medium text-gray-400 dark:text-zinc-500">
              <Clock className="w-3 h-3" />
              {new Date((degree.createdAt as any)?.toDate ? (degree.createdAt as any).toDate() : degree.createdAt).toLocaleDateString('ar-EG')}
            </div>
          )}
        </div>
        
        <h3 className="font-bold text-gray-900 dark:text-white mb-1 line-clamp-1">{degree.examName}</h3>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">النتيجة المعتمدة</p>
        
        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-4 flex flex-col gap-3 border border-gray-100 dark:border-zinc-700/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-zinc-400 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> الدرجة:
            </span>
            <div className="flex items-baseline gap-1" dir="auto">
              <span className={`font-black ${!isNaN(degNum) && degree.degree !== '' ? 'font-mono text-xl text-gray-900 dark:text-white' : 'font-sans text-sm sm:text-base text-red-500 dark:text-red-400'}`}>
                {!isNaN(degNum) && degree.degree !== '' ? parseFloat(degNum.toFixed(4)) : degree.degree}
              </span>
              {!isNaN(degNum) && degree.degree !== '' && degree.maxDegree && (
                <span className="text-sm text-gray-400 dark:text-zinc-500 font-medium font-mono ml-1" dir="ltr">/ {!isNaN(maxDegNum) && degree.maxDegree !== '' ? parseFloat(maxDegNum.toFixed(4)) : degree.maxDegree}</span>
              )}
            </div>
          </div>
          
          {passRate !== null && (
            <div className="mt-1 space-y-2">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-gray-500 dark:text-zinc-400">نسبة نجاح الطلاب بالامتحان:</span>
                <span className={passRateTextColor} dir="ltr">{passRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden" dir="ltr">
                <div 
                  className={`h-full ${passRateColor} transition-all duration-1000`} 
                  style={{ width: `${Math.min(100, Math.max(0, passRate))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="p-4 sm:p-6 lg:p-8">
              <div className="mb-6 sm:mb-8 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">السعيّات والدرجات</h1>
                  <p className="text-gray-500 dark:text-zinc-400">سجل بجميع الدرجات المعتمدة من الكلية.</p>
                </div>
                <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl self-start sm:self-auto">
                  <button
                    onClick={() => setViewMode('current')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      viewMode === 'current'
                        ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    العام الحالي
                  </button>
                  <button
                    onClick={() => setViewMode('archive')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      viewMode === 'archive'
                        ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    الأرشيف السنوي
                  </button>
                </div>
              </div>

      <div className="mb-8 relative">
        <input 
          type="text"
          placeholder="ابحث عن اسم اختبار..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl py-4 pr-12 pl-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm transition-all dark:text-white"
        />
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      </div>

      {loading ? (
        <div className="flex flex-nowrap overflow-x-auto pb-4 gap-4 aesthetic-scrollbar">
          {[1, 2, 3].map(i => (
            <div key={i} className="shrink-0 w-[280px] sm:w-[320px] animate-pulse bg-white dark:bg-zinc-900 h-40 rounded-2xl border border-gray-100 dark:border-zinc-800"></div>
          ))}
        </div>
      ) : filteredDegrees.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm px-4">
          <Trophy className="w-16 h-16 text-emerald-100 dark:text-emerald-900/50 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">لم يتم رصد درجات بعد</h2>
          <p className="text-gray-500 dark:text-zinc-400">ستظهر السعيّات والنتائج هنا بمجرد اعتمادها من الإدارة.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedDegrees).map(([material, matDegrees]) => {
            const materialName = material === 'other' ? 'أخرى' : 
              (CATEGORIES.find(c => c.value === material)?.labelKey 
                ? TRANSLATIONS.ar[CATEGORIES.find(c => c.value === material)!.labelKey as keyof typeof TRANSLATIONS.ar] 
                : material);
                
            return (
              <div key={material}>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
                  {materialName}
                </h2>
                <div className="flex flex-nowrap overflow-x-auto pb-4 gap-4 sm:gap-6 snap-x aesthetic-scrollbar scroll-smooth">
                  {(matDegrees as StudentDegree[]).map(degree => renderDegreeCard(degree))}
                </div>
              </div>
            );
          })}
        </div>
      )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
