export function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        const next = content[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") continue;
    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function toPlaylistName(fileName: string | undefined, fallbackName: string): string {
  if (!fileName) return fallbackName;
  const trimmed = fileName.trim();
  if (!trimmed) return fallbackName;
  return trimmed.replace(/\.csv$/i, "") || fallbackName;
}

export function collectRows<T>(rows: string[][], startIndex: number, mapRow: (row: string[]) => T | null): T[] {
  const collected: T[] = [];
  for (let i = startIndex; i < rows.length; i += 1) {
    const next = mapRow(rows[i]!);
    if (next !== null) {
      collected.push(next);
    }
  }
  return collected;
}
