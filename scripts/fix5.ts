import fs from 'fs';
let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');
let lines = content.split('\n');

for (let i = 1125; i < 1129; i++) {
   lines[i] = "";
}

fs.writeFileSync('src/components/StudentManagement.tsx', lines.join('\n'), 'utf-8');
