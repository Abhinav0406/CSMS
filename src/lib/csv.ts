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
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}


