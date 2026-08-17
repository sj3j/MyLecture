const fs = require('fs');
let code = fs.readFileSync('src/components/StudentManagement.tsx', 'utf8');

code = code.replace(
  '              <div className="w-full md:w-2/3 flex flex-col">',
  '              <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">'
);

fs.writeFileSync('src/components/StudentManagement.tsx', code);
