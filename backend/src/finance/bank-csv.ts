import { createHash } from 'crypto';
import { toCents } from '../common/money';

export interface ParsedBankLine {
  bookingDate: string;
  amountCents: number; // > 0 credit (money in), < 0 debit
  label: string;
  reference: string;
  hash: string;
}

export const MAX_BANK_LINES = 2000;
const HEADER = ['date', 'amount', 'label', 'reference'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^-?\d{1,12}([.,]\d{1,2})?$/;

function validDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejects 2026-02-31
}

/**
 * Strict bank statement CSV: `date;amount;label;reference` (semicolon, ISO dates, amounts with
 * dot or comma decimals and NO thousands separators; negative = debit). Anything ambiguous is an
 * error rather than a guess — a misread amount in a ledger is worse than a rejected file.
 * Cells may be double-quoted ("" escapes a quote). Spreadsheet formulas are neutralised on read.
 */
export function parseBankCsv(csv: string, scope: string): { lines: ParsedBankLine[]; errors: { line: number; error: string }[] } {
  const rows = splitRows(csv.replace(/^﻿/, ''));
  const errors: { line: number; error: string }[] = [];
  const lines: ParsedBankLine[] = [];
  if (!rows.length) return { lines, errors: [{ line: 1, error: 'empty file' }] };

  const header = rows[0].map((c) => c.trim().toLowerCase());
  if (header.length < 3 || HEADER.slice(0, 3).some((h, i) => header[i] !== h)) {
    return { lines, errors: [{ line: 1, error: `header must be: ${HEADER.join(';')}` }] };
  }
  if (rows.length - 1 > MAX_BANK_LINES) return { lines, errors: [{ line: 1, error: `too many lines (max ${MAX_BANK_LINES})` }] };

  rows.slice(1).forEach((cells, i) => {
    const n = i + 2;
    if (cells.every((c) => !c.trim())) return; // blank line
    const [date, amount, label = '', reference = ''] = cells.map((c) => c.trim());
    if (!validDate(date)) return void errors.push({ line: n, error: `invalid date "${date}" (expected YYYY-MM-DD)` });
    if (!AMOUNT.test(amount)) return void errors.push({ line: n, error: `invalid amount "${amount}"` });
    const cents = toCents(amount.replace(',', '.'));
    if (cents === 0) return void errors.push({ line: n, error: 'amount cannot be zero' });
    if (label.length > 200 || reference.length > 100) return void errors.push({ line: n, error: 'label/reference too long' });
    const clean = (v: string) => v.replace(/^[=+\-@\t\r]+/, ''); // never keep a leading formula character
    lines.push({
      bookingDate: date,
      amountCents: cents,
      label: clean(label),
      reference: clean(reference),
      // Stable fingerprint: re-importing the same statement (or an overlapping one) never double-counts.
      hash: createHash('sha256').update([scope, date, cents, label, reference].join('|')).digest('hex'),
    });
  });
  return { lines, errors };
}

function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
