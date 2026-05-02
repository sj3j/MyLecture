import fs from 'fs';
let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');
const lines = content.split('\n');

// Drop the broken remnants of handle functions
content = lines.filter((line, i) => {
  const n = i + 1;
  if ((n >= 52 && n <= 128) || (n >= 170 && n <= 200) || (n >= 265 && n <= 300)) {
     // Wait, I should not blindly delete.
     return true;
  }
  return true;
}).join('\n');

fs.writeFileSync('src/components/StudentManagement.tsx', content, 'utf-8');
