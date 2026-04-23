import Fuse from 'fuse.js';
import { UserProfile } from '../types';
import { ParsedRow } from './gradeFileParser';
import { MatchedResult } from '../types/grades.types';

export function matchGradesToStudents(parsedRows: ParsedRow[], students: UserProfile[]): MatchedResult[] {
  // Setup Fuse.js for student names
  const fuseOptions = {
    keys: [
      { name: 'originalName', weight: 0.7 },
      { name: 'name', weight: 0.3 }
    ],
    includeScore: true,
    threshold: 0.4, // Less than 0.4 is a good match usually. 0 is perfect.
    ignoreLocation: true,
  };

  const fuse = new Fuse(students, fuseOptions);

  return parsedRows.map((row, index) => {
    // Search for the name
    const results = fuse.search(row.name);
    
    let matchedUserId = null;
    let matchedUserName = null;
    let matchedUserOriginalName = null;
    let matchScore = 0; // Custom score: 1 is perfect, 0 is no match

    if (results.length > 0) {
      const bestMatch = results[0];
      // fuse score: 0 is exact match, 1 is mismatch.
      // Let's invert it for our UI (1 is exact match)
      const rawScore = bestMatch.score !== undefined ? bestMatch.score : 1;
      matchScore = Math.max(0, 1 - rawScore);

      // Only accept if score is reasonably good
      if (matchScore > 0.6) {
        matchedUserId = bestMatch.item.uid;
        matchedUserName = bestMatch.item.name;
        matchedUserOriginalName = (bestMatch.item as any).originalName || bestMatch.item.name;
      }
    }

    return {
      rowId: `row_${index}_${Date.now()}`,
      excelName: row.name,
      matchedUserId,
      matchedUserName,
      matchedUserOriginalName,
      matchScore,
      degree: row.degree,
      originalRow: row.originalData
    };
  });
}
