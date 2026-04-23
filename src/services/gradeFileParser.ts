import * as XLSX from 'xlsx';

export interface ParsedRow {
  name: string;
  degree: string | number;
  originalData: any;
}

export async function parseGradeFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Parse sheet to JSON array of objects
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet);

        const parsedRows: ParsedRow[] = [];

        rawJson.forEach((row, index) => {
          // Attempt to find name and degree. 
          // Check common column names in Arabic and English
          const nameKeys = ['name', 'اسم', 'الاسم', 'اسم الطالب', 'student name'];
          const degreeKeys = ['degree', 'score', 'الدرجة', 'درجة', 'السعي', 'النتيجة'];

          let nameStr = '';
          let degreeVal: string | number = '';

          for (const key of Object.keys(row)) {
            const lowerKey = key.toLowerCase().trim();
            if (nameKeys.some(nk => lowerKey.includes(nk))) {
              if (!nameStr) nameStr = String(row[key]);
            }
            if (degreeKeys.some(dk => lowerKey.includes(dk))) {
              if (!degreeVal) degreeVal = row[key];
            }
          }

          // Fallback: If no headers match perfectly, assume first string column is name, first number column is degree
          if (!nameStr && !degreeVal) {
             const values = Object.values(row);
             if (values.length >= 2) {
                 nameStr = String(values[0]);
                 degreeVal = values[1] as string | number;
             }
          }

          if (nameStr) {
            parsedRows.push({
              name: nameStr.trim(),
              degree: degreeVal,
              originalData: row
            });
          }
        });

        resolve(parsedRows);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);

    reader.readAsBinaryString(file);
  });
}
