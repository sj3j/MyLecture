import fs from 'fs';

let home = fs.readFileSync('src/components/HomeScreen.tsx', 'utf-8');
home = home.replace(
  "setShowStudentManage: (val: boolean) => void;",
  "setShowStudentManage: (val: boolean) => void;\n  setShowStreakManage: (val: boolean) => void;"
);
fs.writeFileSync('src/components/HomeScreen.tsx', home, 'utf-8');
