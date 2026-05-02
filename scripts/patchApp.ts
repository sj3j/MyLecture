import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Insert import
if(!content.includes("import StreakManagement")) {
  content = content.replace(
    "import StudentManagement from './components/StudentManagement';",
    "import StudentManagement from './components/StudentManagement';\nimport StreakManagement from './components/StreakManagement';"
  );
}

// Insert state
if(!content.includes("showStreakManage")) {
  content = content.replace(
    "const [showStudentManage, setShowStudentManage] = useState(false);",
    "const [showStudentManage, setShowStudentManage] = useState(false);\n  const [showStreakManage, setShowStreakManage] = useState(false);"
  );
}

// Pass state to ProfileScreen
content = content.replace(
  "setShowStudentManage={setShowStudentManage}",
  "setShowStudentManage={setShowStudentManage}\n            setShowStreakManage={setShowStreakManage}"
);

// Add StreakManagement component
if(!content.includes("<StreakManagement")) {
  content = content.replace(
    "<StudentManagement",
    "<StreakManagement isOpen={showStreakManage} onClose={() => setShowStreakManage(false)} lang={lang} user={user} />\n      <StudentManagement"
  );
}

fs.writeFileSync('src/App.tsx', content, 'utf-8');


// Now ProfileScreen.tsx
let profile = fs.readFileSync('src/components/ProfileScreen.tsx', 'utf-8');
if(!profile.includes("setShowStreakManage?: (show: boolean) => void;")) {
  profile = profile.replace(
    "setShowStudentManage?: (show: boolean) => void;",
    "setShowStudentManage?: (show: boolean) => void;\n  setShowStreakManage?: (show: boolean) => void;"
  );
}

if(!profile.includes("setShowStreakManage={setShowStreakManage}")) {
  profile = profile.replace(
    "setShowStudentManage,",
    "setShowStudentManage,\n  setShowStreakManage,"
  );
}

if(!profile.includes("Streak Management")) {
  profile = profile.replace(
    /(\{\(\(user\?\.role === 'admin' \|\| user\?\.role === 'moderator'\) && user\?\.permissions\?\.manageStudents !== false\) && setShowStudentManage && \(.*?\n\s+<\/button>\n\s+\}\))/s,
    `$1

          {((user?.role === 'admin' || user?.role === 'moderator') && user?.permissions?.manageStudents !== false) && setShowStreakManage && (
             <button
               onClick={() => setShowStreakManage(true)}
               className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl font-bold hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors mt-4"
             >
               <Flame className="w-5 h-5" />
               {isRtl ? 'إدارة الستريك' : 'Streak Management'}
             </button>
           )}`
  );
}

fs.writeFileSync('src/components/ProfileScreen.tsx', profile, 'utf-8');
