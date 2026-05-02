import fs from 'fs';
let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');
let lines = content.split('\n');

for (let i = 1125; i < 1144; i++) {
  lines[i] = "";
}

// Re-add the proper closings
lines.push('            </motion.div>');
lines.push('          </div>');
lines.push('        )}');
lines.push('      </AnimatePresence>');
lines.push('    );');
lines.push('}');
lines.push('');

fs.writeFileSync('src/components/StudentManagement.tsx', lines.join('\n'), 'utf-8');
