import React from 'react';
import { Sun, Moon, Smartphone, Circle, Check } from 'lucide-react';
import { Language } from '../../types';
import { ThemeChoice } from '../../hooks/useTheme';

const OPTIONS: { id: ThemeChoice; ar: string; en: string; sub: { ar: string; en: string }; Icon: any }[] = [
  { id: 'system', ar: 'حسب النظام', en: 'Match system',
    sub: { ar: 'يتبع إعداد الهاتف تلقائياً', en: 'Follows your phone automatically' }, Icon: Smartphone },
  { id: 'light',  ar: 'فاتح', en: 'Light',
    sub: { ar: 'خلفية بيضاء', en: 'White background' }, Icon: Sun },
  { id: 'dark',   ar: 'داكن', en: 'Dark',
    sub: { ar: 'رمادي داكن مريح للعين', en: 'Soft dark grey' }, Icon: Moon },
  { id: 'black',  ar: 'أسود كامل', en: 'True black',
    sub: { ar: 'موفّر للبطارية على شاشات OLED', en: 'Saves battery on OLED screens' }, Icon: Circle },
];

/** Theme picker. Rendered inside the Appearance settings page. */
export default function AppearanceSettings({
  lang, theme, setTheme,
}: {
  lang: Language;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
}) {
  const isRtl = lang === 'ar';

  return (
    <div className="space-y-2">
      {OPTIONS.map(opt => {
        const active = theme === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setTheme(opt.id)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-start ${
              active
                ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                : 'border-slate-200 dark:border-zinc-800 hover:border-sky-300'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              active ? 'bg-sky-100 dark:bg-sky-900/40' : 'bg-slate-100 dark:bg-zinc-800'
            }`}>
              <opt.Icon className={`w-5 h-5 ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px] text-slate-800 dark:text-slate-100">
                {isRtl ? opt.ar : opt.en}
              </div>
              <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                {isRtl ? opt.sub.ar : opt.sub.en}
              </div>
            </div>
            {active && <Check className="w-5 h-5 text-sky-500 shrink-0" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
