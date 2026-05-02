import fs from 'fs';
const content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');

// The file is huge, let's remove functions using regex or replace.

let newContent = content;

newContent = newContent.replace("import StreakHistoryModal from './StreakHistoryModal';\n", '');

// Remove states
newContent = newContent.replace(/const \[editStreakCount.*?\n/, '');
newContent = newContent.replace(/const \[showHistoryModalFor.*?\n/, '');
newContent = newContent.replace(/const \[freezeAmount.*?\n/, '');
newContent = newContent.replace(/const \[recoveryReason.*?\n/, '');
newContent = newContent.replace(/const \[activeTab, setActiveTab.*?\] = useState<'students' \| 'pending'>\('students'\);\n/, '');
newContent = newContent.replace(/const \[pendingResets, setPendingResets.*?\] = useState<any\[\]>\(\[\]\);\n/, '');

// Remove pending resets fetching logic
newContent = newContent.replace(/const pendingSnapshot = await getDocs\(collection\(db, 'pending_streak_resets'\)\);\s+const pendingData = pendingSnapshot\.docs\.map\(doc => \(\{\s+id: doc\.id,\s+\.\.\.doc\.data\(\)\s+\}\)\);\s+setPendingResets\(pendingData\.sort\(\(a: any, b: any\) => \(\(b\.missedDays \|\| 0\) - \(a\.missedDays \|\| 0\)\)\)\);\s+/, '');

// Remove activeTab resetting
newContent = newContent.replace(/setActiveTab\('students'\);\n/g, '');

const removeFunc = (funcName: string) => {
  const reg = new RegExp(`const ${funcName} = async.*?(?=  const [a-zA-Z]+ =|  const filteredStudents)`, 's');
  newContent = newContent.replace(reg, '');
};

removeFunc('handleGrantFreeze');
removeFunc('handleStreakRecovery');
removeFunc('handleResolvePending');
removeFunc('handleGrantGlobalFreeze');
removeFunc('handleTimeFreeze');

// the "Master admin that are streak-related and located in the students management"
const pendingTabRegex = /<button\s+onClick=\{\(\) => setActiveTab\('pending'\)\}.*?<\/button>/s;
newContent = newContent.replace(pendingTabRegex, '');

// Students List button
const studentsTabRegex = /<button\s+onClick=\{\(\) => setActiveTab\('students'\)\}.*?\{isRtl \? 'قائمة الطلاب' : 'Students List'\}\s+<\/button>/s;
newContent = newContent.replace(studentsTabRegex, '');

// The tabs wrapper
const tabWrapperRegex = /<div className="flex bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-6">\s+<\/div>/;
newContent = newContent.replace(tabWrapperRegex, '');

// pending views
const pendingViewRegex = /\{activeTab === 'pending' \? \(.*?\) : /s;
newContent = newContent.replace(pendingViewRegex, '');
newContent = newContent.replace(/matchedExamCodes\.length > 0 \? \(/, '{matchedExamCodes.length > 0 ? (');

const streakHistoryModalRegex = /\{showHistoryModalFor && \(.*?\}\)}/s;
newContent = newContent.replace(streakHistoryModalRegex, '');

const globalButtonsRegex = /<button\s+onClick=\{handleGrantGlobalFreeze\}.*?<\/button>\s+<button\s+onClick=\{handleTimeFreeze\}.*?<\/button>/s;
newContent = newContent.replace(globalButtonsRegex, '');

const streakManageBlockRegex = /\{editingStudent\.userUid && isMasterAdmin && \(\s+<div className="p-4 bg-orange-50.*?<\/div>\s+\)\}/s;
newContent = newContent.replace(streakManageBlockRegex, '');

fs.writeFileSync('src/components/StudentManagement.tsx', newContent, 'utf-8');
console.log('Done modifying StudentManagement.tsx');
