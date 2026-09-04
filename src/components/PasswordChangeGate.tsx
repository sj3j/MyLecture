import React, { useState } from 'react';
import { Loader2, KeyRound, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Language } from '../types';
import { changePassword } from '../services/accountService';

/**
 * Blocks the app until a student replaces the password they were issued.
 *
 * Roster imports generate a password and hand it out on a printed sheet, which
 * means until this is done the credential is known to whoever handled the
 * paper. So it is a gate rather than a card - the same shape as the existing
 * group step in App.tsx, and shown before it.
 *
 * The current password is asked for even though they typed it moments ago:
 * without it, an unlocked phone left on a desk is enough to lock its owner out
 * of their own account.
 */
export default function PasswordChangeGate({
  lang, onDone,
}: {
  lang: Language;
  onDone: () => void;
}) {
  const isRtl = lang === 'ar';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError(isRtl ? 'كلمتا المرور غير متطابقتين.' : 'The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      onDone();
    } catch (err: any) {
      setError(err.message || (isRtl ? 'تعذّر تغيير كلمة المرور.' : 'Could not change password.'));
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full bg-slate-50 dark:bg-zinc-950 border-2 border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:border-sky-500 dark:text-stone-100 transition-colors text-sm';
  const label = 'block text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 px-1';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-zinc-950 p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-zinc-800">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>

        <h1 className="text-2xl font-black text-center text-slate-900 dark:text-stone-100 mb-2">
          {isRtl ? 'غيّر كلمة المرور' : 'Change your password'}
        </h1>
        <p className="text-center text-slate-500 dark:text-slate-400 mb-8 text-sm leading-relaxed">
          {isRtl
            ? 'كلمة المرور الحالية صادرة من الإدارة وقد يعرفها غيرك. اختر واحدة خاصة بك للمتابعة.'
            : 'Your current password was issued by the administration and others may know it. Choose your own to continue.'}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={label}>{isRtl ? 'كلمة المرور الحالية' : 'Current password'}</label>
            <input type="password" required autoComplete="current-password" dir="ltr"
              className={field} value={current} onChange={e => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className={label}>{isRtl ? 'كلمة المرور الجديدة' : 'New password'}</label>
            <input type="password" required minLength={6} autoComplete="new-password" dir="ltr"
              className={field} value={next} onChange={e => setNext(e.target.value)} />
          </div>
          <div>
            <label className={label}>{isRtl ? 'تأكيد كلمة المرور' : 'Confirm password'}</label>
            <input type="password" required minLength={6} autoComplete="new-password" dir="ltr"
              className={field} value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !current || !next || !confirm}
            className="w-full py-4 bg-sky-600 text-white rounded-xl font-black hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
            <span>{isRtl ? 'حفظ ومتابعة' : 'Save and continue'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
