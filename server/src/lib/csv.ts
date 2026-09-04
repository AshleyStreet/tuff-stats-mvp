/**
 * Minimal RFC4180 CSV parser: quoted fields, embedded commas/newlines,
 * doubled-quote escaping, and CRLF or LF line endings.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Headers are lowercased and trimmed so spreadsheet authors can use any casing. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, index) => {
        if (key) record[key] = (row[index] ?? "").trim();
      });
      return record;
    });
}
