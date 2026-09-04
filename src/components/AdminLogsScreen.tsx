import React, { useState, useEffect } from 'react';
import { ShieldAlert, Loader2, ArrowLeft, Download, Search, Filter, Calendar, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAdminLogs, AdminLogEntry } from '../services/adminLogService';
import { Language, TRANSLATIONS } from '../types';

interface AdminLogsScreenProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export default function AdminLogsScreen({ isOpen, onClose, lang }: AdminLogsScreenProps) {
  const isRtl = lang === 'ar';
  const t = TRANSLATIONS[lang];
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AdminLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    async function loadLogs() {
      setIsLoading(true);
      try {
        const fetchedLogs = await getAdminLogs(1000);
        setLogs(fetchedLogs);
        setFilteredLogs(fetchedLogs);
      } catch (err) {
        console.error("Failed to load admin logs", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, [isOpen]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredLogs(logs);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredLogs(logs.filter(log => 
        log.adminName.toLowerCase().includes(lower) || 
        log.adminEmail.toLowerCase().includes(lower) || 
        log.action.toLowerCase().includes(lower) || 
        log.details.toLowerCase().includes(lower) ||
        (log.stageId || '').toLowerCase().includes(lower)
      ));
    }
  }, [searchTerm, logs]);

  const handleExportCsv = () => {
    if (logs.length === 0) return;
    
    const headers = ['Date', 'Admin Name', 'Admin Email', 'Stage', 'Action', 'Details', 'Target ID'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => {
        const date = log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : 'N/A';
        return [
          `"${date}"`,
          `"${log.adminName}"`,
          `"${log.adminEmail}"`,
          `"${log.stageId || ''}"`,
          `"${log.action}"`,
          `"${log.details.replace(/"/g, '""')}"`,
          `"${log.targetId || ''}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `admin_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionColor = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes('delete') || a.includes('remove')) return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50';
    if (a.includes('create') || a.includes('add') || a.includes('import')) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50';
    if (a.includes('update') || a.includes('edit') || a.includes('toggle')) return 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800/50';
    return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-zinc-800/80 dark:text-slate-300 dark:border-zinc-700/80';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
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
            className="relative w-full max-w-5xl bg-slate-50 dark:bg-zinc-950 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800"
          >
            <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 shrink-0">
              <div className="flex items-center gap-4">
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-slate-600 dark:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                {isRtl ? 'سجل العمليات الإدارية' : 'Admin Action Logs'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {isRtl ? 'سجل تدقيق أمني يظهر لـ Master Admin فقط' : 'Security audit log visible only to Master Admin'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:min-w-[250px]">
            <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400`} />
            <input
              type="text"
              placeholder={isRtl ? 'بحث في السجلات...' : 'Search logs...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full bg-slate-100 dark:bg-zinc-800/50 border border-transparent focus:border-indigo-500 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors rounded-xl py-2 ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} text-sm text-slate-900 dark:text-white outline-none`}
            />
          </div>
          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0 || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:bg-slate-300 disabled:dark:bg-zinc-700 disabled:cursor-not-allowed text-white dark:text-slate-900 rounded-xl font-medium transition-colors border border-transparent shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{isRtl ? 'تصدير CSV' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 dark:bg-zinc-950/50">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
              <p className="text-slate-500 font-medium">{isRtl ? 'جاري تحميل السجلات...' : 'Loading audit logs...'}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-16 text-center text-slate-500 shadow-sm flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100 dark:border-zinc-700/50">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                {isRtl ? 'لا توجد نتائج' : 'No results found'}
              </h3>
              <p className="max-w-xs mx-auto">
                {searchTerm 
                  ? (isRtl ? 'لم يتم العثور على سجلات تطابق بحثك' : 'No logs match your current search query.')
                  : (isRtl ? 'لا توجد سجلات عمليات حالياً' : 'There are currently no action logs.')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={log.id} 
                  className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 hover:border-slate-300 dark:hover:border-zinc-700 transition-all shadow-sm flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                    <div className="flex items-start sm:items-center gap-3 min-w-[220px]">
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-lg font-bold text-slate-600 dark:text-slate-300 uppercase shrink-0 border border-slate-200/60 dark:border-zinc-700/50">
                        {log.adminName.charAt(0)}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{log.adminName}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{log.adminEmail}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                       <span className={`px-3 py-1 text-xs font-bold rounded-lg border ${getActionColor(log.action)}`}>
                         {log.action.replace(/_/g, ' ')}
                       </span>
                       {/* Which cohort the action landed in. Stored all along,
                           but never shown - so a log line could not answer the
                           one question worth asking of a bulk import. */}
                       {log.stageId && (
                         <span className="px-2 py-1 text-[11px] font-bold rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 font-mono">
                           {log.stageId}
                         </span>
                       )}
                    </div>

                    <div className="text-sm text-slate-700 dark:text-slate-300 mt-2 sm:mt-0 flex-1 break-words line-clamp-2">
                      {log.details}
                      {log.targetId && (
                        <span className="inline-block mt-1 sm:mt-0 sm:ml-2 text-[10px] sm:bg-slate-100 sm:dark:bg-zinc-800 px-2 pl-3 py-0.5 rounded-md text-slate-500 dark:text-slate-400 font-mono">
                          ID: {log.targetId}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-right shrink-0">
                    <Calendar className="w-3.5 h-3.5 sm:hidden" />
                    {log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString([], {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'Just now'}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
