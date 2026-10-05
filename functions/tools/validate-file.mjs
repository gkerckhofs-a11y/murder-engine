import fs from 'node:fs/promises';
import path from 'node:path';
import { parseWorkbookBuffer } from '../src/parse-xlsx.mjs';
import { validateWorkbook, summarizeWorkbook } from '../src/diagnostics.mjs';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node tools/validate-file.mjs <scenario.xlsx>');
  process.exit(2);
}
const buffer = await fs.readFile(target);
const workbook = parseWorkbookBuffer(buffer, path.basename(target));
const result = validateWorkbook(workbook);
console.log(JSON.stringify({ summary: summarizeWorkbook(workbook), ...result }, null, 2));
process.exit(result.blocking ? 1 : 0);
