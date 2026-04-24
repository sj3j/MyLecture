import React, { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { X, Save } from 'lucide-react';
import { BankQuestion, QuestionScope, QuestionTag, QuestionType, StemFormat, Difficulty, BankChoice } from '../../types/questionBank.types';
import { addBankQuestion } from '../../services/questionBankService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const CATEGORIES = ['pharmacology', 'pharmacognosy', 'organic_chemistry', 'biochemistry', 'cosmetics'];
const ALL_TAGS: QuestionTag[] = ['وزاري', 'سنين_سابقة', 'سؤال_الدكتور', 'مهم', 'متوقع'];

export default function AddBankQuestionModal({ isOpen, onClose, onAdded }: Props) {
  const [scope, setScope] = useState<QuestionScope>('global');
  const [subjectId, setSubjectId] = useState<string>(CATEGORIES[0]);
  const [lectureId, setLectureId] = useState<string>('');
  
  const [tags, setTags] = useState<Set<QuestionTag>>(new Set());
  const [year, setYear] = useState<string>('');

  const [type, setType] = useState<QuestionType>('mcq');
  const [stemFormat, setStemFormat] = useState<StemFormat>('standard');
  const [stem, setStem] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const [choices, setChoices] = useState<BankChoice[]>([
    { label: 'A', text: '' },
    { label: 'B', text: '' },
    { label: 'C', text: '' },
    { label: 'D', text: '' },
    { label: 'E', text: '' }
  ]);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number>(0);
  const [explanation, setExplanation] = useState<string>('');
  
  const [lectures, setLectures] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      getDocs(query(collection(db, 'lectures'))).then(snap => {
        setLectures(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }
  }, [isOpen]);

  const toggleTag = (tag: QuestionTag) => {
    const newTags = new Set(tags);
    if (newTags.has(tag)) newTags.delete(tag);
    else newTags.add(tag);
    setTags(newTags);
  };

  const handleChoiceChange = (index: number, text: string) => {
    const newChoices = [...choices];
    newChoices[index].text = text;
    setChoices(newChoices);
  };

  const handleSubmit = async () => {
    if (!stem.trim()) return alert("يجب إدخال نص السؤال");
    
    let finalChoices = type === 'mcq' ? choices.filter(c => c.text.trim() !== '') : [
        { label: 'A', text: 'True' },
        { label: 'B', text: 'False' }
    ];

    if (type === 'mcq' && finalChoices.length < 2) {
      return alert("يجب إدخال خيارين على الأقل");
    }

    const _tags = Array.from(tags);
    if (_tags.includes('سنين_سابقة') && !year) {
      return alert("يجب إدخال السنة للإجابات من السنين السابقة");
    }

    if (scope === 'lecture' && !lectureId) {
      return alert("يجب اختيار محاضرة");
    }

    setSubmitting(true);
    try {
      const payload: any = {
        scope,
        subjectId: scope === 'global' ? null : subjectId,
        lectureId: scope === 'lecture' ? lectureId : null,
        tags: _tags,
        year: _tags.includes('سنين_سابقة') ? year : null,
        type,
        stemFormat,
        stem,
        choices: finalChoices,
        correctAnswer: finalChoices[type === 'mcq' ? correctAnswerIndex : correctAnswerIndex].text,
        explanation,
        difficulty,
        isActive: true
      };

      await addBankQuestion(payload);
      onAdded();
      onClose();
    } catch (e: any) {
      alert("خطأ: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800 bg-sky-50 dark:bg-sky-900/10">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">إضافة سؤال جديد</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-gray-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Scope */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">النطاق (الظهور)</label>
            <div className="flex gap-2">
              <select 
                value={scope} 
                onChange={e => setScope(e.target.value as QuestionScope)}
                className="flex-1 p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800"
              >
                <option value="global">🌐 عام (يظهر للكل)</option>
                <option value="subject">📚 مادة كاملة</option>
                <option value="lecture">📖 محاضرة محددة</option>
              </select>
            </div>
          </div>

          {scope !== 'global' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">المادة</label>
                <select 
                  value={subjectId} 
                  onChange={e => setSubjectId(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {scope === 'lecture' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">المحاضرة</label>
                  <select 
                    value={lectureId} 
                    onChange={e => setLectureId(e.target.value)}
                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800"
                  >
                    <option value="">-- اختر محاضرة --</option>
                    {lectures.filter(l => l.category === subjectId).map(l => (
                      <option key={l.id} value={l.id}>{l.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">التصنيف (اختياري)</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors border-2 ${
                    tags.has(tag) 
                    ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30' 
                    : 'border-transparent bg-slate-100 text-slate-600 dark:bg-zinc-800'
                  }`}
                >
                  {tag.replace('_', ' ')}
                </button>
              ))}
            </div>
            {tags.has('سنين_سابقة') && (
              <input 
                type="text" 
                placeholder="أدخل السنة (مثال: 2022)"
                value={year}
                onChange={e => setYear(e.target.value)}
                className="mt-3 w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800"
              />
            )}
          </div>

          {/* Type & Diff */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">النوع</label>
              <select 
                value={type} 
                onChange={e => setType(e.target.value as QuestionType)}
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800"
              >
                <option value="mcq">اختيار من متعدد (MCQ)</option>
                <option value="true_false">صح / خطأ</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">الصعوبة</label>
              <select 
                value={difficulty} 
                onChange={e => setDifficulty(e.target.value as Difficulty)}
                className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800"
              >
                <option value="easy">🟩 سهل</option>
                <option value="medium">🟨 متوسط</option>
                <option value="hard">🟥 صعب</option>
              </select>
            </div>
          </div>

          {/* Stem */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">السؤال</label>
            <textarea 
              value={stem} 
              onChange={e => setStem(e.target.value)}
              placeholder="نص السؤال (يفضل باللغة الإنجليزية)"
              dir="ltr"
              className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 min-h-[100px]"
            />
          </div>

          {/* Choices */}
          {type === 'mcq' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">الخيارات & الإجابة الصحيحة</label>
              <div className="space-y-3">
                {choices.map((c, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input 
                      type="radio" 
                      name="correctChoice" 
                      checked={correctAnswerIndex === idx}
                      onChange={() => setCorrectAnswerIndex(idx)}
                      className="w-5 h-5"
                    />
                    <span className="font-bold w-6">{c.label}</span>
                    <input 
                      type="text" 
                      value={c.text} 
                      onChange={e => handleChoiceChange(idx, e.target.value)}
                      placeholder={`خيار ${c.label}`}
                      dir="ltr"
                      className="flex-1 p-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {type === 'true_false' && (
             <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">الإجابة الصحيحة</label>
              <div className="flex gap-4">
                 <button onClick={() => setCorrectAnswerIndex(0)} className={`flex-1 p-3 rounded-xl border-2 font-bold ${correctAnswerIndex === 0 ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-transparent bg-slate-100 text-slate-600'}`}>True</button>
                 <button onClick={() => setCorrectAnswerIndex(1)} className={`flex-1 p-3 rounded-xl border-2 font-bold ${correctAnswerIndex === 1 ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-transparent bg-slate-100 text-slate-600'}`}>False</button>
              </div>
             </div>
          )}

          {/* Explanation */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">التوضيح / الشرح (عربي)</label>
            <textarea 
              value={explanation} 
              onChange={e => setExplanation(e.target.value)}
              placeholder="شرح الإجابة لمساعدة الطالب"
              className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 min-h-[80px]"
            />
          </div>

        </div>

        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900">
           <button 
             onClick={handleSubmit}
             disabled={submitting}
             className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-xl font-bold transition-colors disabled:opacity-50"
           >
             {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
             حفظ السؤال
           </button>
        </div>
      </div>
    </div>
  );
}
