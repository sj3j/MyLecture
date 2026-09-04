import React from 'react';
import { Shield } from 'lucide-react';
import { Language, TRANSLATIONS, UserProfile } from '../types';

/**
 * Native replacement for src/components/SubscriptionScreen.tsx.
 *
 * The real screen sells access: plan cards with prices, a payment-method
 * chooser, and a ZainCash hand-off. Both stores forbid taking real money
 * outside their own billing, and they check by scanning the binary - so the
 * screen is excluded at BUILD time here rather than hidden behind
 * IS_STORE_BUILD, which left every price and provider name in the bundle.
 *
 * What remains is the honest explanation a locked-out student needs. Access
 * itself is unaffected: App.tsx gates content on `user.isSubscribed`, which is
 * read from the users document, so anyone already subscribed keeps everything.
 */
export default function SubscriptionScreen({ user, lang }: { user: UserProfile | null; lang: Language }) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  return (
    <div className="p-4 sm:p-6 max-w-lg mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white dark:bg-zinc-900 border-2 border-slate-100 dark:border-zinc-800 rounded-3xl p-6 text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-slate-400" />
        </div>

        <h2 className="text-lg font-black text-slate-900 dark:text-stone-100 mb-2">
          {t.subscription}
        </h2>

        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
          {user?.isSubscribed ? t.subscriptionActive : t.askRepresentative}
        </p>
      </div>
    </div>
  );
}
