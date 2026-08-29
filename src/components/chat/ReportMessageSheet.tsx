import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, Loader2, Check, X, Ban, AlertCircle } from 'lucide-react';
import { Language } from '../../types';
import {
  REPORT_REASONS, ReportReason, reportMessage, blockUser,
} from '../../services/moderationService';

interface ReportMessageSheetProps {
  lang: Language;
  /** The message being reported. Null closes the sheet. */
  target: {
    messageId: string;
    messageText: string;
    senderId?: string | null;
    senderName?: string | null;
    chatPath: string;
  } | null;
  onClose: () => void;
  /** Called after a successful block so the list can hide their messages. */
  onBlocked?: (userId: string) => void;
}

/**
 * Report and block, from the message itself.
 *
 * Apple Guideline 1.2 and Play's UGC policy both require a student-reachable
 * path to flag content and to block a user - the app previously only had the
 * moderator side (delete/mute), which does not satisfy either.
 */
export default function ReportMessageSheet({ lang, target, onClose, onBlocked }: ReportMessageSheetProps) {
  const isRtl = lang === 'ar';
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'reported' | 'blocked' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason(null); setNote(''); setBusy(false); setDone(null); setError(null);
  };

  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!target || !reason) return;
    setBusy(true); setError(null);
    try {
      await reportMessage({
        messageId: target.messageId,
        messageText: target.messageText,
        reportedUserId: target.senderId ?? null,
        reportedUserName: target.senderName ?? null,
        chatPath: target.chatPath,
        reason,
        note,
      });
      setDone('reported');
      setTimeout(close, 1600);
    } catch (err: any) {
      console.error('Report failed:', err);
      setError(isRtl ? 'تعذّر إرسال البلاغ. حاول مرة أخرى.' : 'Could not send the report. Try again.');
      setBusy(false);
    }
  };

  const doBlock = async () => {
    if (!target?.senderId) return;
    setBusy(true); setError(null);
    try {
      await blockUser(target.senderId);
      onBlocked?.(target.senderId);
      setDone('blocked');
      setTimeout(close, 1400);
    } catch (err: any) {
      console.error('Block failed:', err);
      setError(isRtl ? 'تعذّر الحظر. حاول مرة أخرى.' : 'Could not block. Try again.');
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          dir={isRtl ? 'rtl' : 'ltr'}
          onClick={close}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="p-6">
              {done ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {done === 'reported'
                      ? (isRtl ? 'تم إرسال البلاغ للإدارة' : 'Report sent to the moderators')
                      : (isRtl ? 'تم حظر المستخدم' : 'User blocked')}
                  </p>
                  {done === 'reported' && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {isRtl ? 'سنراجعه في أقرب وقت. شكراً لك.' : 'We will review it shortly. Thank you.'}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                        <Flag className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-black text-slate-900 dark:text-white">
                          {isRtl ? 'الإبلاغ عن رسالة' : 'Report a message'}
                        </h3>
                        {target.senderName && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {isRtl ? 'من: ' : 'From: '}{target.senderName}
                          </p>
                        )}
                      </div>
                    </div>
                    <button onClick={close} className="p-2 rounded-full bg-slate-100 dark:bg-zinc-800 shrink-0">
                      <X className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    </button>
                  </div>

                  {target.messageText && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-zinc-800/60 rounded-xl p-3 mb-4 line-clamp-3 border border-slate-200 dark:border-zinc-700">
                      {target.messageText.slice(0, 180)}
                    </p>
                  )}

                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                    {isRtl ? 'سبب البلاغ' : 'Why are you reporting this?'}
                  </p>
                  <div className="space-y-2 mb-4">
                    {REPORT_REASONS.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setReason(r.id)}
                        className={`w-full text-start px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                          reason === r.id
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
                            : 'border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300 hover:border-rose-300'
                        }`}
                      >
                        {isRtl ? r.ar : r.en}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder={isRtl ? 'تفاصيل إضافية (اختياري)' : 'Anything else (optional)'}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
                  />

                  {error && (
                    <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={submit}
                    disabled={!reason || busy}
                    className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    {busy && <Loader2 className="w-5 h-5 animate-spin" />}
                    {isRtl ? 'إرسال البلاغ' : 'Send report'}
                  </button>

                  {target.senderId && (
                    <button
                      onClick={doBlock}
                      disabled={busy}
                      className="w-full mt-2 py-3 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Ban className="w-4 h-4" />
                      {isRtl ? 'حظر هذا المستخدم' : 'Block this user'}
                    </button>
                  )}

                  <p className="mt-3 text-[11px] text-center text-slate-500 dark:text-slate-400 leading-relaxed">
                    {isRtl
                      ? 'الحظر يخفي رسائل هذا المستخدم عنك أنت فقط، ولا يُعلمه بذلك.'
                      : 'Blocking hides their messages from you only, and they are not told.'}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
