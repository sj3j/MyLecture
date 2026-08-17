const fs = require('fs');
let code = fs.readFileSync('src/components/StudentManagement.tsx', 'utf8');

// The `items-center justify-center` was left behind on the outer wrapper. Let's fix that.
code = code.replace(
  `        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-50 dark:bg-zinc-950" dir={isRtl ? 'rtl' : 'ltr'}>`,
  `        <div className="fixed inset-0 z-[110] flex bg-slate-50 dark:bg-zinc-950" dir={isRtl ? 'rtl' : 'ltr'}>`
);

fs.writeFileSync('src/components/StudentManagement.tsx', code);
