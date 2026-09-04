import React from 'react';
import { Shield, X } from 'lucide-react';
import { Language, TRANSLATIONS } from '../types';

/**
 * Native replacement for src/components/SubscriptionPaywall.tsx.
 *
 * The real paywall ends in a "Subscribe now" button that leads to the payment
 * flow. Here the same sheet explains the lock and stops - no price, no
 * provider, no way to pay. `onSubscribe` is accepted and ignored so App.tsx
 * needs no change.
 */
export default function SubscriptionPaywall({
  lang, onClose,
}: {
  lang: Language;
  onClose: () => void;
  onSubscribe?: () => void;
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
          {t.subscriptionRequired}
        </h3>
        <p className="text-sm font-bold text-center text-slate-500 dark:text-slate-400 leading-relaxed">
          {t.askRepresentative}
        </p>
      </div>
    </div>
  );
}
