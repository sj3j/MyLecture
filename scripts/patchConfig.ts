import fs from 'fs';

let profile = fs.readFileSync('src/components/ProfileScreen.tsx', 'utf-8');
profile = profile.replace(
  "setShowStudentManage?: (val: boolean) => void;",
  "setShowStudentManage?: (val: boolean) => void;\n  setShowStreakManage?: (val: boolean) => void;"
);
fs.writeFileSync('src/components/ProfileScreen.tsx', profile, 'utf-8');


let home = fs.readFileSync('src/components/HomeScreen.tsx', 'utf-8');
if (!home.includes("setShowStreakManage?: (show: boolean) => void;")) {
  home = home.replace(
    "setShowStudentManage?: (show: boolean) => void;",
    "setShowStudentManage?: (show: boolean) => void;\n  setShowStreakManage?: (show: boolean) => void;"
  );
  home = home.replace(
    "setShowStudentManage,",
    "setShowStudentManage,\n  setShowStreakManage,"
  );
  home = home.replace(
    "setShowStudentManage={setShowStudentManage}",
    "setShowStudentManage={setShowStudentManage}\n            setShowStreakManage={setShowStreakManage}"
  );
}
fs.writeFileSync('src/components/HomeScreen.tsx', home, 'utf-8');
