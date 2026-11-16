import { MAX_BANK_LINES, parseBankCsv } from '../../src/finance/bank-csv';

const csv = (...rows: string[]) => ['date;amount;label;reference', ...rows].join('\n');

describe('parseBankCsv', () => {
  it('parses credits, debits, comma and dot decimals, quoted cells and BOM/CRLF', () => {
    const r = parseBankCsv('﻿date;amount;label;reference\r\n2026-03-05;1200,50;"VIR M. ALAOUI; T1";VIR 4471\r\n2026-03-06;-80.5;Frais bancaires;\r\n', 'org|res');
    expect(r.errors).toEqual([]);
    expect(r.lines.map((l) => [l.bookingDate, l.amountCents, l.label, l.reference])).toEqual([
      ['2026-03-05', 120050, 'VIR M. ALAOUI; T1', 'VIR 4471'],
      ['2026-03-06', -8050, 'Frais bancaires', ''],
    ]);
  });

  it('is strict: bad header, impossible dates, ambiguous amounts, zero, thousands separators', () => {
    expect(parseBankCsv('montant;date\n1;2', 's').errors[0].error).toMatch(/header/);
    const bad = parseBankCsv(csv('2026-02-31;10;a;b', '05/03/2026;10;a;b', '2026-03-05;1 200,00;a;b', '2026-03-05;1,200.00;a;b', '2026-03-05;0;a;b', '2026-03-05;abc;a;b', '2026-03-05;10.999;a;b'), 's');
    expect(bad.lines).toEqual([]);
    expect(bad.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('reports the right line number and keeps valid lines apart from errors', () => {
    const r = parseBankCsv(csv('2026-03-05;100;ok;r1', '2026-03-06;oops;bad;r2'), 's');
    expect(r.lines).toHaveLength(1);
    expect(r.errors).toEqual([{ line: 3, error: 'invalid amount "oops"' }]);
  });

  it('neutralises spreadsheet formula injection in labels and references', () => {
    const r = parseBankCsv(csv('2026-03-05;100;=HYPERLINK("http://evil");+cmd|calc'), 's');
    // the formula-looking label contains an unquoted ';' so it splits; the point is no cell may start with = + - @
    for (const l of r.lines) {
      expect(l.label).not.toMatch(/^[=+\-@]/);
      expect(l.reference).not.toMatch(/^[=+\-@]/);
    }
    const quoted = parseBankCsv(csv('2026-03-05;100;"=1+1";"@SUM(A1)"'), 's');
    expect(quoted.lines[0].label).toBe('1+1');
    expect(quoted.lines[0].reference).toBe('SUM(A1)');
  });

  it('fingerprints are stable per scope and differ across residences / content', () => {
    const a = parseBankCsv(csv('2026-03-05;100;x;y'), 'orgA|res1').lines[0].hash;
    expect(parseBankCsv(csv('2026-03-05;100;x;y'), 'orgA|res1').lines[0].hash).toBe(a);
    expect(parseBankCsv(csv('2026-03-05;100;x;y'), 'orgA|res2').lines[0].hash).not.toBe(a);
    expect(parseBankCsv(csv('2026-03-05;100.01;x;y'), 'orgA|res1').lines[0].hash).not.toBe(a);
  });

  it('rejects empty files and oversize statements', () => {
    expect(parseBankCsv('', 's').errors[0].error).toMatch(/empty/);
    const many = csv(...Array.from({ length: MAX_BANK_LINES + 1 }, (_, i) => `2026-03-05;${i + 1};l;r`));
    expect(parseBankCsv(many, 's').errors[0].error).toMatch(/too many/);
  });

  it('skips blank lines', () => {
    expect(parseBankCsv(csv('', '2026-03-05;10;a;b', ';;;'), 's').lines).toHaveLength(1);
  });
});
