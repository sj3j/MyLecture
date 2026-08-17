const fs = require('fs');
let code = fs.readFileSync('src/components/StudentManagement.tsx', 'utf8');

// First add the selectedSubgroupFilter state
code = code.replace(
  "  const [selectedGroupFilter, setSelectedGroupFilter] = useState('All');",
  "  const [selectedGroupFilter, setSelectedGroupFilter] = useState('All');\n  const [selectedSubgroupFilter, setSelectedSubgroupFilter] = useState('All');"
);

// Update the filter logic
code = code.replace(
  /    if \(selectedGroupFilter !== 'All'\) \{[\s\S]*?    \}/,
  `    if (selectedGroupFilter !== 'All') {
      const studentGroup = (student.subgroup || '').charAt(0).toUpperCase();
      if (studentGroup !== selectedGroupFilter) return false;
      
      if (selectedSubgroupFilter !== 'All') {
         if ((student.subgroup || '').toUpperCase() !== selectedSubgroupFilter) return false;
      }
    }`
);

// Update the useEffect to handle subgroup defaults
code = code.replace(
  /  useEffect\(\(\) => \{\n    if \(selectedGroupFilter !== 'All'\) \{[\s\S]*?  \}, \[selectedGroupFilter\]\);/,
  `  useEffect(() => {
    if (selectedGroupFilter !== 'All') {
      if (selectedSubgroupFilter !== 'All') {
         setSubgroup(selectedSubgroupFilter);
      } else if (!subgroup.startsWith(selectedGroupFilter)) {
         setSubgroup(\`\${selectedGroupFilter}1\`);
      }
    }
  }, [selectedGroupFilter, selectedSubgroupFilter]);`
);

// Update the UI for the tabs
code = code.replace(
  /                <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin px-1 mt-4">[\s\S]*?                <\/div>/,
  `                <div className="flex flex-col gap-2 mb-4 mt-4">
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin px-1">
                    {['All', 'A', 'B', 'C', 'D'].map(group => (
                      <button
                        key={group}
                        onClick={() => {
                          setSelectedGroupFilter(group);
                          setSelectedSubgroupFilter('All');
                        }}
                        className={\`px-5 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all \${
                          selectedGroupFilter === group 
                            ? 'bg-sky-600 text-white shadow-lg shadow-sky-200 dark:shadow-none scale-105' 
                            : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 hover:bg-sky-50 dark:hover:bg-sky-900/20'
                        }\`}
                      >
                        {group === 'All' ? (isRtl ? 'الكل' : 'All') : (isRtl ? \`المجموعة \${group}\` : \`Group \${group}\`)}
                      </button>
                    ))}
                  </div>
                  
                  {selectedGroupFilter !== 'All' && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin px-1">
                      <button
                        onClick={() => setSelectedSubgroupFilter('All')}
                        className={\`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all \${
                          selectedSubgroupFilter === 'All'
                            ? 'bg-sky-500 text-white shadow-md'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                        }\`}
                      >
                        {isRtl ? 'الكل' : 'All'}
                      </button>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                        const sub = \`\${selectedGroupFilter}\${num}\`;
                        return (
                          <button
                            key={sub}
                            onClick={() => setSelectedSubgroupFilter(sub)}
                            className={\`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all \${
                              selectedSubgroupFilter === sub
                                ? 'bg-sky-500 text-white shadow-md'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                            }\`}
                          >
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>`
);

fs.writeFileSync('src/components/StudentManagement.tsx', code);
