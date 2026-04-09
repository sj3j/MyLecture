import React, { useState, useRef } from 'react';
import { X, Upload, AlertCircle, Loader2, FileUp, CheckCircle2 } from 'lucide-react';
import { db, auth, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { CATEGORIES, Category, LectureType, Language, TRANSLATIONS } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminUploadProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export default function AdminUpload({ isOpen, onClose, lang }: AdminUploadProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [title, setTitle] = useState('');
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

  const processFile = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setError(isRtl ? 'يرجى اختيار ملف PDF فقط' : 'Please select a PDF file only');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
      setError(t.maxSize);
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
    setDescription('');
    setFile(null);
    setUploadProgress(null);
    setShowSuccess(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !file) return;

    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);

    try {
      // 1. Upload file to Firebase Storage
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `lectures/${Date.now()}_${safeFileName}`;
      console.log('Starting upload to:', storagePath);
      
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log(`Upload progress: ${progress.toFixed(2)}%`);
            setUploadProgress(progress);
          }, 
          (error) => {
            console.error('Upload error details:', {
              code: error.code,
              message: error.message,
              fileName: file.name,
              fileSize: file.size,
              timestamp: new Date().toISOString()
            });
            reject(error);
          }, 
          async () => {
            try {
              console.log('Upload complete, getting download URL...');
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (err) {
              console.error('Download URL error:', err);
              reject(err);
            }
          }
        );
      });

      // 2. Save metadata to Firestore
      console.log('Saving metadata to Firestore...');
      await addDoc(collection(db, 'lectures'), {
        title,
        category,
        type,
        description,
        pdfUrl: downloadUrl,
        createdAt: serverTimestamp(),
        uploadedBy: auth.currentUser.uid,
      });
      console.log('Metadata saved successfully');

      setShowSuccess(true);
    } catch (err: any) {
      console.error('Submit error details:', err);
      
      let errorMessage = t.errorUnknown;
      
      // Handle Firebase Storage and Firestore error codes
      if (err.code) {
        switch (err.code) {
          case 'storage/unauthorized':
          case 'permission-denied':
            errorMessage = t.errorUnauthorized;
            break;
          case 'storage/retry-limit-exceeded':
            errorMessage = t.errorNetwork;
            break;
          case 'storage/quota-exceeded':
            errorMessage = t.errorQuota;
            break;
          case 'storage/canceled':
            return; // Don't show error if user canceled
          default:
            errorMessage = err.message || t.errorUnknown;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategoryData = CATEGORIES.find(c => c.value === category);

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
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                {t.publishLecture}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              {showSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-12 flex flex-col items-center text-center space-y-6"
                >
                  <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 mb-2">{t.success}</h3>
                    <p className="text-gray-500">{t.lectureTitle}: <span className="font-bold text-gray-700">{title}</span></p>
                  </div>
                  <div className="flex flex-col w-full gap-3 pt-4">
                    <button
                      onClick={resetForm}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      {t.uploadAnother}
                    </button>
                    <button
                      onClick={onClose}
                      className="w-full py-4 bg-gray-50 text-gray-600 rounded-2xl font-bold hover:bg-gray-100 transition-all"
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
                        className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl flex items-start gap-3 text-sm font-medium"
                      >
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p>{error}</p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => setError(null)}
                          className="p-1 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4 text-red-400" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700 ml-1">{t.lectureTitle}</label>
                    <input
                      required
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-gray-700 ml-1">{t.type}</label>
                      <select
                        value={type}
                        onChange={(e) => {
                          const newType = e.target.value as LectureType;
                          setType(newType);
                          const currentCatData = CATEGORIES.find(c => c.value === category);
                          if (currentCatData && !currentCatData.types.includes(newType)) {
                            // Find first category that supports this type
                            const validCat = CATEGORIES.find(c => c.types.includes(newType));
                            if (validCat) setCategory(validCat.value);
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      >
                        <option value="theoretical">{t.theoretical}</option>
                        <option value="practical">{t.practical}</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-gray-700 ml-1">{t.category}</label>
                      <select
                        value={category}
                        onChange={(e) => {
                          const newCat = e.target.value as Category;
                          setCategory(newCat);
                        }}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      >
                        {CATEGORIES.filter(c => c.types.includes(type)).map((c) => (
                          <option key={c.value} value={c.value}>{t[c.labelKey]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700 ml-1">{t.pdfFile}</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                        isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 
                        file ? 'border-green-200 bg-green-50' : 
                        'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50'
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".pdf"
                        className="hidden"
                      />
                      {file ? (
                        <>
                          <CheckCircle2 className="w-8 h-8 text-green-500" />
                          <span className="text-sm font-bold text-green-700 truncate max-w-xs">{file.name}</span>
                          <span className="text-xs text-green-600">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        </>
                      ) : (
                        <>
                          <FileUp className={`w-8 h-8 ${isDragging ? 'text-indigo-500 animate-bounce' : 'text-gray-400'}`} />
                          <span className="text-sm font-bold text-gray-600">{t.clickToUpload}</span>
                          <span className="text-xs text-gray-400">{t.dragDrop}</span>
                          <span className="text-[10px] text-gray-300 uppercase tracking-widest mt-1">{t.maxSize}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700 ml-1">{t.description}</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[80px] resize-none"
                    />
                  </div>

                  {uploadProgress !== null && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold text-gray-500">
                        <span>{isRtl ? 'جاري الرفع...' : 'Uploading...'}</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          className="bg-indigo-600 h-full"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    disabled={isSubmitting || !file}
                    type="submit"
                    className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t.uploading}
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        {t.publishLecture}
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
