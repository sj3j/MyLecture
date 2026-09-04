import React from 'react';
import { Shield, X } from 'lucide-react';
import { Language, TRANSLATIONS, UserProfile } from '../types';

/**
 * Native replacement for src/components/SubscriptionManagement.tsx.
 *
 * The real panel is the admin side of payments: revenue totals, a breakdown by
 * payment method, and approve/reject for pending ZainCash and SuperKey
 * transactions. None of that can ship in a store binary without naming the
 * providers, so it is excluded at build time and stays available on the web,
 * where the same admin signs in with the same account.
 */
export default function SubscriptionManagement({
  lang, onClose,
}: {
  user?: UserProfile;
  lang: Language;
  onClose: () => void;
}) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 end-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>

        <div className="w-14 h-14 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-slate-400" />
        </div>

        <h3 className="text-base font-black text-center text-slate-900 dark:text-stone-100 mb-2">
          {t.manageSubscriptions}
        </h3>
        <p className="text-sm font-bold text-center text-slate-500 dark:text-slate-400 leading-relaxed">
          {isRtl
            ? 'إدارة الاشتراكات متاحة من نسخة الويب فقط.'
            : 'Subscription management is available on the web version only.'}
        </p>
      </div>
    </div>
  );
}
