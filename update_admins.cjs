const fs = require('fs');

const files = ['server.ts', 'src/App.tsx', 'src/components/StudentManagement.tsx'];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\["almdrydyl335@gmail\.com"\]/g, '["almdrydyl335@gmail.com", "jempe.kn@gmail.com"]');
    content = content.replace(/user\?\.email === 'almdrydyl335@gmail\.com'/g, "['almdrydyl335@gmail.com', 'jempe.kn@gmail.com'].includes(user?.email?.toLowerCase() || '') || user?.role === 'master_admin'");
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
