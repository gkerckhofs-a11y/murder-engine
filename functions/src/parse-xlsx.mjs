import * as XLSX from 'xlsx';
import { CONTRACT_VERSION, SHEETS } from './contract.mjs';

function normalizeCell(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (trimmed === 'TRUE' || trimmed === 'FALSE') return trimmed;
    return trimmed;
  }
  return value;
}

function sheetRows(sheet) {
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  return data
    .map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [String(k).trim(), normalizeCell(v)])))
    .filter(row => !Object.values(row).every(v => v === null));
}

export function parseWorkbookBuffer(buffer, filename = 'scenario.xlsx') {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellFormula: false });
  const sheets = {};
  for (const name of Object.keys(SHEETS)) {
    if (!workbook.Sheets[name]) continue;
    sheets[name] = sheetRows(workbook.Sheets[name]).filter(row => {
      const idField = SHEETS[name]?.id;
      return !idField || !String(row[idField] ?? '').startsWith('EXAMPLE_');
    });
  }
  const readme = workbook.Sheets.README ? XLSX.utils.sheet_to_json(workbook.Sheets.README, { header: 1, defval: '' }) : [];
  const title = String(readme?.[0]?.[0] ?? '');
  const detectedMatch = title.match(/V(1\.\d+)/i);
  const detected = detectedMatch?.[1] ?? 'unknown';
  return { filename, templateVersion: detected === 'unknown' ? CONTRACT_VERSION : detected, sheets };
}
