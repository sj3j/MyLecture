import fs from 'fs';
let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');
let lines = content.split('\n');

for (let i = 642; i < 685; i++) {
  if (lines[i].includes('<div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">')) {
     lines[i] = `
              {matchedExamCodes.length > 0 ? (
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
`;
     break;
  }
}

// Add the missing `</div>` at the end
lines[1128] = '              )}';
lines[1129] = '            </div>';

fs.writeFileSync('src/components/StudentManagement.tsx', lines.join('\n'), 'utf-8');
