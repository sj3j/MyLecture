const fs = require('fs');
let code = fs.readFileSync('src/components/StudentManagement.tsx', 'utf8');

// Change the modal backdrop and container
code = code.replace(
  '        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" dir={isRtl ? \'rtl\' : \'ltr\'}>',
  '        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-50 dark:bg-zinc-950" dir={isRtl ? \'rtl\' : \'ltr\'}>'
);

code = code.replace(
  '            className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800"',
  '            className="relative w-full h-full bg-white dark:bg-zinc-900 overflow-hidden flex flex-col"'
);

// Tweak the flex container for side-by-side to make better use of full screen width
code = code.replace(
  '            <div className="p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-8">',
  '            <div className="p-6 overflow-hidden flex-1 flex flex-col lg:flex-row gap-8">'
);

code = code.replace(
  '              <div className="w-full md:w-1/3 space-y-6">',
  '              <div className="w-full lg:w-80 flex-shrink-0 overflow-y-auto pr-2 space-y-6">'
);

code = code.replace(
  '              <div className="w-full md:w-2/3 flex flex-col min-h-[500px]">',
  '              <div className="flex-1 flex flex-col min-w-0 min-h-0">'
);
// In case the above replace fails due to mismatch, let's just do a generic replace.

fs.writeFileSync('src/components/StudentManagement.tsx', code);
