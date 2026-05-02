import fs from 'fs';
let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');
let lines = content.split('\n');

for (let i = 1128; i < lines.length; i++) {
  lines[i] = "";
}

lines[1128] = '                </div>'; // close 777 div
lines[1129] = '              )}';     // close matchedExamCodes ternary
lines[1130] = '            </div>';   // close 643 div
lines[1131] = '          </motion.div>'; // close 625 motion.div
lines[1132] = '        </div>';       // close 616 div
lines[1133] = '      )}';             // close 615 isOpen
lines[1134] = '    </AnimatePresence>';// close 614
lines[1135] = '  );';
lines[1136] = '}';

fs.writeFileSync('src/components/StudentManagement.tsx', lines.join('\n'), 'utf-8');
