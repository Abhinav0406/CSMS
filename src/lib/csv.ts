export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === ',') { result.push(current); current = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

export function escapeCsv(v: any): string {
  if (v == null || v === '') return '';
  
  // If it's a number, export as number (no quotes) to prevent Excel text formatting errors
  if (typeof v === 'number') {
    return String(v);
  }
  
  // Convert to string for string values
  const s = String(v);
  
  // Only quote if it contains special characters that need escaping
  if (/[",\n]/.test(s)) return '"' + s.replaceAll('"', '""') + '"';
  
  // For numeric strings (like "123"), export without quotes so Excel treats them as numbers
  // Check if it's a valid number string (integer or decimal, including negative)
  const numMatch = /^-?\d+(\.\d+)?$/.test(s.trim());
  if (numMatch) {
    return s.trim(); // Return without quotes so Excel recognizes it as a number
  }
  
  return s;
}


