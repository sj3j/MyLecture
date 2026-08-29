import React from 'react';

/** The pill switch used as a SettingsRow trailing control. */
export default function SettingsToggle({
  checked,
  onChange,
  isRtl,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  isRtl: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
        checked ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'
      }`}
    >
      <span
        className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
          checked ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')
        }`}
      />
    </button>
  );
}
