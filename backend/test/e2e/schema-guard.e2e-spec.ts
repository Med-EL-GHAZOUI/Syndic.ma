import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CHECKS, TRIGGERS } from '../../src/migrations/integrity';
import { createApp } from './helpers';

/** Regression guard: generated migrations once silently dropped the financial CHECK constraints. */
describe('Schema guard (database-level integrity)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createApp();
    ds = app.get(DataSource);
  });
  afterAll(() => app.close());

  it.each(CHECKS.map((c) => [c.name, c.table] as const))('CHECK %s exists on %s', async (name, table) => {
    const rows = await ds.query(`SELECT 1 FROM pg_constraint WHERE contype = 'c' AND conname = $1 AND conrelid = $2::regclass`, [name, table]);
    expect(rows).toHaveLength(1);
  });

  it.each(TRIGGERS)('trigger %s exists', async (name) => {
    const rows = await ds.query('SELECT 1 FROM pg_trigger WHERE tgname = $1 AND NOT tgisinternal', [name]);
    expect(rows).toHaveLength(1);
  });

  it('no timestamp column is time-zone-less (it shifted every date by the server offset)', async () => {
    const rows = await ds.query(`SELECT table_name || '.' || column_name AS col FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone' AND table_name <> 'migrations'`);
    expect(rows).toEqual([]);
  });

  it('every table with an org_id column is indexed on it (tenant filter performance)', async () => {
    const rows = await ds.query(`
      SELECT c.table_name FROM information_schema.columns c
       WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND c.table_name NOT IN ('counters', 'migrations')
         AND NOT EXISTS (SELECT 1 FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = c.table_name AND i.indexdef LIKE '%(org_id)%')`);
    expect(rows).toEqual([]);
  });
});
