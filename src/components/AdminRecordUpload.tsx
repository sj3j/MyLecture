import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, AlertCircle, Loader2, FileUp, CheckCircle2 } from 'lucide-react';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { CATEGORIES, Category, LectureType, Language, TRANSLATIONS, RecordItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminRecordUploadProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  recordToEdit?: RecordItem | null;
}

export default function AdminRecordUpload({ isOpen, onClose, lang, recordToEdit }: AdminRecordUploadProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [title, setTitle] = useState('');
  const [recordNumber, setRecordNumber] = useState('');
  const [category, setCategory] = useState<Category>('pharmacology');
  const [type, setType] = useState<LectureType>('theoretical');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (recordToEdit) {
      setTitle(recordToEdit.title);
      setRecordNumber(recordToEdit.number ? String(recordToEdit.number) : '');
      setCategory(recordToEdit.category);
      setType(recordToEdit.type);
      setDescription(recordToEdit.description || '');
      setFile(null); // Optional to upload a new file
    } else {
      resetForm();
    }
  }, [recordToEdit, isOpen]);

  const processFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('audio/')) {
      setError(isRtl ? 'يرجى اختيار ملف صوتي فقط' : 'Please select an audio file only');
      return;
    }
    if (selectedFile.size > 500 * 1024 * 1024) { // 500MB limit for audio
      setError(isRtl ? 'الحد الأقصى 500 ميجابايت' : 'Max 500MB');
      return;
    }
    
    setFile(selectedFile);
    setError(null);

    // Smart title extraction if title is empty
    if (!title) {
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
      const cleanTitle = nameWithoutExt
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      setTitle(cleanTitle);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const resetForm = () => {
    setTitle('');
    setRecordNumber('');
    setDescription('');
    setFile(null);
    setUploadProgress(null);
    setShowSuccess(false);
    setError(null);
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };
      audio.onerror = () => {
        resolve(0); // Fallback if duration cannot be determined
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!recordToEdit && !file) return;

    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);

    try {
      let downloadUrl = recordToEdit?.audioUrl;
      let duration = recordToEdit?.duration || 0;
      let size = recordToEdit?.size || 0;

      if (file) {
        // Get duration and size
        duration = await getAudioDuration(file);
        size = parseFloat((file.size / (1024 * 1024)).toFixed(2)); // Size in MB

        // 1. Get presigned URL from our backend
        const response = await fetch(`/api/get-upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`);
        
        if (!response.ok) {
          let errorMessage = 'Failed to get upload URL. Please check Cloudflare R2 configuration.';
          try {
            const errorData = await response.json();
            if (errorData.error) errorMessage = errorData.error;
          } catch (e) {
            // If response is not JSON (e.g. Vercel 500 HTML page), log the raw text
            const text = await response.text().catch(() => 'No response text');
            console.error('Non-JSON error response from /api/get-upload-url:', text);
            errorMessage = `Server error (${response.status}). Check Vercel Function Logs.`;
          }
          throw new Error(errorMessage);
        }
        
        const { uploadUrl, publicUrl } = await response.json();

        // 2. Upload file directly to Cloudflare R2 using XMLHttpRequest for progress tracking
        downloadUrl = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = (event.loaded / event.total) * 100;
              setUploadProgress(progress);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(publicUrl);
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error occurred during upload.'));
          };

          xhr.open('PUT', uploadUrl, true);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });
      }

      // 3. Save metadata to Firestore
      const recordData: any = {
        title,
        category,
        type,
        description,
        audioUrl: downloadUrl,
        duration,
        size,
        uploadedBy: auth.currentUser.uid,
      };
      
      if (recordNumber) {
        recordData.number = parseInt(recordNumber, 10);
      } else {
        recordData.number = null; 
      }

      if (recordToEdit) {
        await updateDoc(doc(db, 'records', recordToEdit.id), recordData);
      } else {
        recordData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'records'), recordData);
      }

      setShowSuccess(true);
    } catch (err: any) {
      console.error('Submit error details:', err);
      setError(err.message || t.errorUnknown);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 max-h-[90vh] flex flex-col"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-sky-50/50 dark:bg-sky-900/10 shrink-0">
              <h2 className="text-xl font-bold text-slate-900 dark:text-stone-100 flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                {recordToEdit ? (isRtl ? 'تعديل التسجيل' : 'Edit Record') : (isRtl ? 'رفع تسجيل' : 'Upload Record')}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {showSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-12 flex flex-col items-center text-center space-y-6"
                >
                  <div className="w-20 h-20 bg-sky-50 dark:bg-sky-900/30 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-sky-500 dark:text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-stone-100 mb-2">
                      {recordToEdit ? t.editSuccess : t.success}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">{isRtl ? 'عنوان التسجيل' : 'Record Title'}: <span className="font-bold text-slate-700 dark:text-slate-300">{title}</span></p>
                  </div>
                  <div className="flex flex-col w-full gap-3 pt-4">
                    {!recordToEdit && (
                      <button
                        onClick={resetForm}
                        className="w-full py-4 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 rounded-2xl font-bold hover:bg-sky-700 dark:hover:bg-sky-600 transition-all shadow-lg shadow-sky-100 dark:shadow-none"
                      >
                        {isRtl ? 'رفع تسجيل آخر' : 'Upload another record'}
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="w-full py-4 bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:bg-slate-100 dark:hover:bg-zinc-700 transition-all"
                    >
                      {t.close}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <AnimatePresence>
                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-2xl flex items-start gap-3 text-sm font-medium"
                      >
                        <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p>{error}</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setError(null)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4 text-red-400" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{isRtl ? 'عنوان التسجيل' : 'Record Title'}</label>
                      <input
                        required
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 focus:border-transparent transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{isRtl ? 'رقم التسجيل (اختياري)' : 'Record Number (Optional)'}</label>
                      <input
                        type="number"
                        min="1"
                        value={recordNumber}
                        onChange={(e) => setRecordNumber(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 focus:border-transparent transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t.type}</label>
                      <select
                        value={type}
                        onChange={(e) => {
                          const newType = e.target.value as LectureType;
                          setType(newType);
                          const currentCatData = CATEGORIES.find(c => c.value === category);
                          if (currentCatData && !currentCatData.types.includes(newType)) {
                            const validCat = CATEGORIES.find(c => c.types.includes(newType));
                            if (validCat) setCategory(validCat.value);
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none transition-all"
                      >
                        <option value="theoretical">{t.theoretical}</option>
                        <option value="practical">{t.practical}</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t.category}</label>
                      <select
                        value={category}
                        onChange={(e) => {
                          const newCat = e.target.value as Category;
                          setCategory(newCat);
                        }}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none transition-all"
                      >
                        {CATEGORIES.filter(c => c.types.includes(type)).map((c) => (
                          <option key={c.value} value={c.value}>{t[c.labelKey]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{isRtl ? 'الملف الصوتي' : 'Audio File'}</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                        isDragging ? 'border-sky-500 dark:border-sky-500 bg-sky-50 dark:bg-sky-900/30 scale-[1.02]' : 
                        file ? 'border-sky-200 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/30' : 
                        'border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:border-sky-300 dark:hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/10'
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="audio/*"
                        className="hidden"
                      />
                      {file ? (
                        <>
                          <CheckCircle2 className="w-8 h-8 text-sky-500 dark:text-sky-400" />
                          <span className="text-sm font-bold text-sky-700 dark:text-sky-300 truncate max-w-xs">{file.name}</span>
                          <span className="text-xs text-sky-600 dark:text-sky-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        </>
                      ) : (
                        <>
                          <FileUp className={`w-8 h-8 ${isDragging ? 'text-sky-500 dark:text-sky-400 animate-bounce' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{isRtl ? 'اضغط لرفع ملف صوتي' : 'Click to upload audio file'}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{t.dragDrop}</span>
                          <span className="text-[10px] text-slate-300 dark:text-slate-600 uppercase tracking-widest mt-1">{isRtl ? 'الحد الأقصى 500 ميجابايت' : 'Max 500MB'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t.description}</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-stone-100 rounded-xl focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 outline-none transition-all min-h-[80px] resize-none"
                    />
                  </div>

                  {uploadProgress !== null && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span>{isRtl ? 'جاري الرفع...' : 'Uploading...'}</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          className="bg-sky-600 dark:bg-sky-500 h-full"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    disabled={isSubmitting || (!recordToEdit && !file)}
                    type="submit"
                    className="w-full py-3.5 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 rounded-xl font-bold hover:bg-sky-700 dark:hover:bg-sky-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-sky-200 dark:shadow-none"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t.uploading}
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        {recordToEdit ? t.saveChanges : (isRtl ? 'رفع التسجيل' : 'Publish Record')}
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
