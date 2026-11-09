// Minimal RFC 4180 CSV reader: returns an array of rows, each an array of cell strings.
export function csvRows(text) {
  const rows = []; let row = [], f = '', q = false;
  text = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

// Rows keyed by the header line, skipping blank rows (the NAB transaction export shape).
export function parseCSV(text) {
  const rows = csvRows(text);
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h || ('col' + i), (r[i] ?? '').trim()])));
}
