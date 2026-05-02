import fs from 'fs';

const fetchStudentsCode = `
  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'students'));
      const usersSnapshot = await getDocs(collection(db, 'users'));
      
      const userMap = new Map();
      usersSnapshot.docs.forEach((doc: any) => {
        const userData = doc.data();
        const userEmail = userData.email || doc.id;
        if (userEmail) {
          userMap.set(userEmail.toLowerCase().trim(), {
            name: userData.name,
            streakCount: userData.streakCount || 0,
            longestStreak: userData.longestStreak || 0,
            freezeTokens: userData.freezeTokens || 0,
            userUid: doc.id
          });
        }
      });
      
      const studentsData = snapshot.docs.map((doc: any) => {
        const data = doc.data();
        const userProfile = userMap.get((data.email || doc.id).toLowerCase().trim());
        return {
          id: doc.id,
          name: data.name,
          email: data.email,
          examCode: data.examCode || '',
          isActive: data.isActive ?? true,
          createdAt: data.createdAt,
          userUid: userProfile?.userUid,
          currentName: userProfile?.name || data.name,
          streakCount: userProfile?.streakCount || 0,
          longestStreak: userProfile?.longestStreak || 0,
          freezeTokens: userProfile?.freezeTokens || 0
        };
      }) as unknown as Student[];
      
      setStudents(studentsData);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setIsLoading(false);
    }
  };
`;

let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');

// Insert fetchStudents after useEffect(() => { if (isOpen) { fetchStudents(); } }, [isOpen]);
// Wait! `useEffect` is at line 201. Let's place it before the `useEffect`.
content = content.replace(
  /  useEffect\(\(\) => \{\n    if \(isOpen\) \{\n      fetchStudents\(\);\n    \}\n  \}, \[isOpen\]\);/,
  fetchStudentsCode + '\n  useEffect(() => {\n    if (isOpen) {\n      fetchStudents();\n    }\n  }, [isOpen]);'
);

content = content.replace(/setEditStreakCount\(student\.streakCount \?\? 0\);/g, '');

fs.writeFileSync('src/components/StudentManagement.tsx', content, 'utf-8');

// Also fix StreakManagement.tsx error `error TS2352: Conversion of type ... to type 'Student[]' may be a mistake`
let strMgmt = fs.readFileSync('src/components/StreakManagement.tsx', 'utf-8');
strMgmt = strMgmt.replace(/as Student\[\]/g, 'as unknown as Student[]');
fs.writeFileSync('src/components/StreakManagement.tsx', strMgmt, 'utf-8');

