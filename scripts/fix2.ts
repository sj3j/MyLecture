import fs from 'fs';
let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');
const lines = content.split('\n');

const newLines = [];
for (let i = 0; i < lines.length; i++) {
   const n = i + 1;
   if (n >= 52 && n <= 128) continue;
   if (n >= 179 && n <= 200) continue;
   if (n >= 267 && n <= 296) continue;
   // lines around 676
   if (n >= 671 && n <= 725) {
     if (lines[i].includes('border-transparent text-slate-500 hover:text-slate-700')) continue;
   }
   newLines.push(lines[i]);
}

let modified = newLines.join('\n');
fs.writeFileSync('src/components/StudentManagement.tsx', modified, 'utf-8');
