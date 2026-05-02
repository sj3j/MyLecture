import fs from 'fs';
let content = fs.readFileSync('src/components/StudentManagement.tsx', 'utf-8');
let lines = content.split('\n');

// clear lines 52 to 200
for (let i = 51; i < 200; i++) {
  lines[i] = "";
}

// clear lines 266 to 295
for (let i = 266; i < 296; i++) {
  lines[i] = "";
}

// fix line 678
for (let i = 672; i < 680; i++) {
  if (lines[i].includes(") : {matchedExamCodes.length > 0 ? (")) {
     lines[i] = "              {matchedExamCodes.length > 0 ? (";
  }
}

// And there is an unclosed motion div somewhere around 625.. because I deleted the matching </div>?
// wait, line 1129,11: `')' expected.` let's not guess, let's just write this and then TS check again.

fs.writeFileSync('src/components/StudentManagement.tsx', lines.join('\n'), 'utf-8');
