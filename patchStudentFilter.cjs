const fs = require('fs');
let code = fs.readFileSync('src/components/StudentManagement.tsx', 'utf8');

code = code.replace(
  '  useEffect(() => {\n    if (isOpen) {\n      fetchStudents();\n    }\n  }, [isOpen]);',
  `  useEffect(() => {
    if (isOpen) {
      fetchStudents();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedGroupFilter !== 'All') {
      if (!subgroup.startsWith(selectedGroupFilter)) {
        setSubgroup(\`\${selectedGroupFilter}1\`);
      }
    }
  }, [selectedGroupFilter]);`
);

fs.writeFileSync('src/components/StudentManagement.tsx', code);
