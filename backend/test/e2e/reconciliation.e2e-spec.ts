import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { bearer, buildWorld, createApp, http, World } from './helpers';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const HEADER = 'date;amount;label;reference';

describe('Bank reconciliation & period closing', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  const as = (key: string) => bearer(w.tokens[key]);

  beforeAll(async () => {
    app = await createApp();
    ds = app.get(DataSource);
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  const pay = (unitIdx: number, amount: number, extra: Record<string, unknown> = {}) =>
    http(app).post('/api/payments').set(as('a.accountant')).send({ unitId: w.a.unitIds[unitIdx], amount, date: today(), method: 'transfer', ...extra });
  const importCsv = (key: string, rows: string[], residenceId = w.a.residenceId) =>
    http(app).post('/api/reconciliation/import').set(as(key)).send({ residenceId, csv: [HEADER, ...rows].join('\n') });
  const lines = async (q = '') => (await http(app).get(`/api/reconciliation/lines?limit=200${q}`).set(as('a.accountant')).expect(200)).body as { id: string; status: string; amount: number; label: string; suggestions: { paymentId: string; score: number }[] }[];

  describe('permissions & scope', () => {
    it('only admins and accountants may reconcile', async () => {
      for (const key of ['a.manager', 'a.owner', 'a.tenant', 'a.provider']) {
        await http(app).get('/api/reconciliation/lines').set(as(key)).expect(403);
        await importCsv(key, [`${today()};100;x;y`]).expect(403);
      }
      await http(app).get('/api/reconciliation/lines').set(as('a.syndic_admin')).expect(200);
    });

    it('is isolated per organization', async () => {
      await importCsv('b.accountant', [`${today()};100;x;y`], w.a.residenceId).expect(404);
      await http(app).get(`/api/reconciliation/lines?residenceId=${w.a.residenceId}`).set(as('b.accountant')).expect(404);
    });
  });

  describe('import', () => {
    it('is all-or-nothing and reports line numbers', async () => {
      const before = (await lines()).length;
      const res = await importCsv('a.accountant', [`${today()};100;ok;r1`, `${today()};abc;bad;r2`]).expect(400);
      expect(res.body.errors).toEqual([{ line: 3, error: 'invalid amount "abc"' }]);
      expect((await lines()).length).toBe(before); // the valid line was NOT imported
      await http(app).post('/api/reconciliation/import').set(as('a.accountant')).send({ residenceId: w.a.residenceId, csv: 'bad header\n1;2' }).expect(400);
    });

    it('is idempotent: re-importing an overlapping statement never double-counts', async () => {
      const rows = [`${today()};111.11;VIR IMPORT TEST;REF-IMP-1`, `${daysAgo(1)};222.22;VIR IMPORT TEST 2;REF-IMP-2`];
      const first = (await importCsv('a.accountant', rows).expect(201)).body;
      expect(first).toMatchObject({ imported: 2, duplicates: 0 });
      const again = (await importCsv('a.accountant', [...rows, `${today()};333.33;NEW LINE;REF-IMP-3`]).expect(201)).body;
      expect(again).toMatchObject({ imported: 1, duplicates: 2 });
    });
  });

  describe('matching', () => {
    it('suggests candidates by exact amount (+ reference / date) and never suggests cash', async () => {
      const p = (await pay(0, 150, { reference: 'VIR 7001' }).expect(201)).body;
      await pay(1, 150, { method: 'cash', reference: 'ESP' }).expect(201); // same amount, but cash
      await importCsv('a.accountant', [`${today()};150;VIREMENT RECU VIR 7001 ALAOUI;`]).expect(201);
      const l = (await lines()).find((x) => x.label.includes('VIR 7001'))!;
      expect(l.suggestions.map((s) => s.paymentId)).toEqual([p.id]);
      expect(l.suggestions[0].score).toBe(3); // reference + date
    });

    it('a manual match verifies the payment; rules are enforced (exact amount, once, credits, cash)', async () => {
      const p = (await pay(2, 410.4, { reference: 'CHQ 9911' }).expect(201)).body;
      expect(p.verified).toBe(false);
      await importCsv('a.accountant', [`${today()};410.40;REMISE CHEQUE 9911;`, `${today()};410.41;OFF BY A CENTIME;`, `${today()};-410.40;DEBIT SAME AMOUNT;`]).expect(201);
      const all = await lines();
      const good = all.find((x) => x.label.includes('9911'))!;
      const off = all.find((x) => x.label.includes('CENTIME'))!;
      const debit = all.find((x) => x.label.includes('DEBIT SAME'))!;

      await http(app).post(`/api/reconciliation/lines/${off.id}/match`).set(as('a.accountant')).send({ paymentId: p.id }).expect(409); // amounts differ
      await http(app).post(`/api/reconciliation/lines/${debit.id}/match`).set(as('a.accountant')).send({ paymentId: p.id }).expect(409); // debit
      await http(app).post(`/api/reconciliation/lines/${good.id}/match`).set(as('a.manager')).send({ paymentId: p.id }).expect(403);
      await http(app).post(`/api/reconciliation/lines/${good.id}/match`).set(as('a.accountant')).send({ paymentId: p.id }).expect(200);
      expect((await ds.query('SELECT verified FROM payments WHERE id = $1', [p.id]))[0].verified).toBe(true);
      await http(app).post(`/api/reconciliation/lines/${good.id}/match`).set(as('a.accountant')).send({ paymentId: p.id }).expect(409); // already matched

      // the same payment cannot be matched by a second line with the same amount
      await importCsv('a.accountant', [`${daysAgo(2)};410.40;SECOND LINE SAME AMOUNT;`]).expect(201);
      const second = (await lines()).find((x) => x.label.includes('SECOND LINE'))!;
      await http(app).post(`/api/reconciliation/lines/${second.id}/match`).set(as('a.accountant')).send({ paymentId: p.id }).expect(409);

      const cash = (await pay(3, 77, { method: 'cash', reference: 'ESP' }).expect(201)).body;
      await importCsv('a.accountant', [`${today()};77;CASH DEPOSIT;`]).expect(201);
      const dep = (await lines()).find((x) => x.label.includes('CASH DEPOSIT'))!;
      await http(app).post(`/api/reconciliation/lines/${dep.id}/match`).set(as('a.accountant')).send({ paymentId: cash.id }).expect(409);
    });

    it('cannot match across organizations or non-recorded payments', async () => {
      const foreign = (await http(app).post('/api/payments').set(as('b.accountant')).send({ unitId: w.b.unitIds[0], amount: 99, date: today(), method: 'transfer', reference: 'B1' }).expect(201)).body;
      await importCsv('a.accountant', [`${today()};99;CROSS ORG TRY;`]).expect(201);
      const l = (await lines()).find((x) => x.label.includes('CROSS ORG'))!;
      await http(app).post(`/api/reconciliation/lines/${l.id}/match`).set(as('a.accountant')).send({ paymentId: foreign.id }).expect(404);
      await http(app).post(`/api/reconciliation/lines/${l.id}/match`).set(as('b.accountant')).send({ paymentId: foreign.id }).expect(404);
    });

    it('a bank-verified payment cannot be reversed until it is un-matched (with a reason)', async () => {
      const p = (await pay(4, 520, { reference: 'VIR 5555' }).expect(201)).body;
      await importCsv('a.accountant', [`${today()};520;VIR 5555 RECU;`]).expect(201);
      const l = (await lines()).find((x) => x.label.includes('VIR 5555'))!;
      await http(app).post(`/api/reconciliation/lines/${l.id}/match`).set(as('a.accountant')).send({ paymentId: p.id }).expect(200);

      await http(app).post(`/api/payments/${p.id}/reverse`).set(as('a.accountant')).send({ reason: 'erreur de saisie' }).expect(409);
      await http(app).post(`/api/reconciliation/lines/${l.id}/unmatch`).set(as('a.accountant')).send({}).expect(400); // reason required
      await http(app).post(`/api/reconciliation/lines/${l.id}/unmatch`).set(as('a.accountant')).send({ reason: 'mauvais rapprochement' }).expect(200);
      expect((await ds.query('SELECT verified FROM payments WHERE id = $1', [p.id]))[0].verified).toBe(false);
      await http(app).post(`/api/payments/${p.id}/reverse`).set(as('a.accountant')).send({ reason: 'erreur de saisie' }).expect(200);
    });

    it('ignoring a line needs a reason and is final unless it is unmatched', async () => {
      await importCsv('a.accountant', [`${today()};5;FRAIS BANCAIRES;`]).expect(201);
      const l = (await lines()).find((x) => x.label.includes('FRAIS BANCAIRES'))!;
      await http(app).post(`/api/reconciliation/lines/${l.id}/ignore`).set(as('a.accountant')).send({}).expect(400);
      await http(app).post(`/api/reconciliation/lines/${l.id}/ignore`).set(as('a.accountant')).send({ reason: 'frais de tenue de compte' }).expect(200);
      await http(app).post(`/api/reconciliation/lines/${l.id}/ignore`).set(as('a.accountant')).send({ reason: 'again again' }).expect(409);
    });
  });

  describe('auto-match is conservative', () => {
    it('matches only unambiguous pairs, leaves ambiguous ones for a human', async () => {
      // unambiguous: one payment, one line, same reference
      const clear = (await pay(5, 631.31, { reference: 'VIR 8001' }).expect(201)).body;
      await importCsv('a.accountant', [`${today()};631.31;VIR 8001;`]).expect(201);
      // ambiguous: two payments with the same amount for one line
      const a1 = (await pay(6, 842.42, { reference: 'AMB-A' }).expect(201)).body;
      const a2 = (await pay(7, 842.42, { reference: 'AMB-B' }).expect(201)).body;
      await importCsv('a.accountant', [`${today()};842.42;VIREMENT SANS REFERENCE;`]).expect(201);

      const res = (await http(app).post('/api/reconciliation/auto').set(as('a.accountant')).send({ residenceId: w.a.residenceId }).expect(200)).body;
      expect(res.matched).toBeGreaterThanOrEqual(1);
      expect((await ds.query('SELECT verified FROM payments WHERE id = $1', [clear.id]))[0].verified).toBe(true);
      expect((await ds.query('SELECT verified FROM payments WHERE id = ANY($1) ORDER BY id', [[a1.id, a2.id]])).every((r: { verified: boolean }) => r.verified === false)).toBe(true);
      expect(res.details.some((d: { reason: string }) => /ambiguous/.test(d.reason))).toBe(true);
    });

    it('refuses an auto-match when the amount fits but neither reference nor date supports it', async () => {
      const old = (await pay(0, 953.53, { date: daysAgo(40), reference: 'OLD-REF' }).expect(201)).body;
      await importCsv('a.accountant', [`${today()};953.53;VIREMENT INCONNU;`]).expect(201);
      const res = (await http(app).post('/api/reconciliation/auto').set(as('a.accountant')).send({ residenceId: w.a.residenceId }).expect(200)).body;
      expect(res.details.some((d: { reason: string }) => /do not support/.test(d.reason))).toBe(true);
      expect((await ds.query('SELECT verified FROM payments WHERE id = $1', [old.id]))[0].verified).toBe(false);
    });
  });

  describe('summary', () => {
    it('reports unmatched statement lines and unverified bank payments (cash excluded)', async () => {
      const s = (await http(app).get('/api/reconciliation/summary').set(as('a.accountant')).expect(200)).body;
      expect(s.unmatchedLines).toBeGreaterThan(0);
      expect(s.unverifiedPayments).toBeGreaterThan(0);
      expect(s.verifiedPayments).toBeGreaterThan(0);
    });
  });

  describe('period closing', () => {
    it('only forward, never in the future, and not while declared payments are undecided', async () => {
      await http(app).post('/api/finance/closures').set(as('a.manager')).send({ residenceId: w.a.residenceId, closedThrough: daysAgo(60) }).expect(403);
      await http(app).post('/api/finance/closures').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, closedThrough: '2999-01-01' }).expect(400);

      // an undecided declaration inside the period blocks closing
      const declared = (await http(app).post('/api/payments/declare').set(as('a.owner')).send({ unitId: w.a.unitIds[0], amount: 10, date: daysAgo(50), method: 'transfer', reference: 'DECL-1' }).expect(201)).body;
      await http(app).post('/api/finance/closures').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, closedThrough: daysAgo(45) }).expect(409);
      await http(app).post(`/api/payments/${declared.id}/reject`).set(as('a.accountant')).send({ reason: 'introuvable' }).expect(200);

      await http(app).post('/api/finance/closures').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, closedThrough: daysAgo(45) }).expect(201);
      await http(app).post('/api/finance/closures').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, closedThrough: daysAgo(45) }).expect(409); // same date
      await http(app).post('/api/finance/closures').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, closedThrough: daysAgo(46) }).expect(409); // backwards
      const list = (await http(app).get('/api/finance/closures').set(as('a.accountant')).expect(200)).body;
      expect(list[0].closedThrough).toBe(daysAgo(45));
    });

    it('a closed period freezes payments, expenses and reversals dated inside it', async () => {
      // recording / declaring inside the closed period
      await pay(1, 20, { date: daysAgo(46) }).expect(409);
      await http(app).post('/api/payments/declare').set(as('a.owner')).send({ unitId: w.a.unitIds[0], amount: 10, date: daysAgo(46), method: 'transfer', reference: 'X' }).expect(409);
      // a payment dated AFTER the closing date is fine
      const ok = (await pay(1, 20, { date: daysAgo(10) }).expect(201)).body;
      expect(ok.status).toBe('recorded');

      // expenses
      await http(app).post('/api/expenses').set(as('a.accountant')).send({ residenceId: w.a.residenceId, category: 'repairs', label: 'Facture ancienne', amount: 100, date: daysAgo(50) }).expect(409);
      const exp = (await http(app).post('/api/expenses').set(as('a.accountant')).send({ residenceId: w.a.residenceId, category: 'repairs', label: 'Facture récente', amount: 100, date: daysAgo(5) }).expect(201)).body;
      await http(app).post(`/api/expenses/${exp.id}/approve`).set(as('a.accountant')).expect(200);

      // reversal of a payment that sits inside the closed period
      const [{ id: oldPaymentId }] = await ds.query(
        `INSERT INTO payments (org_id, residence_id, unit_id, payer_name, amount, date, method, status, verified, receipt_no, created_by)
         VALUES ($1,$2,$3,'Legacy',10,$4,'cash','recorded',false,'REC-LEGACY-9999',$5) RETURNING id`,
        [w.a.orgId, w.a.residenceId, w.a.unitIds[0], daysAgo(50), w.a.users.accountant.id],
      );
      await http(app).post(`/api/payments/${oldPaymentId}/reverse`).set(as('a.accountant')).send({ reason: 'tentative tardive' }).expect(409);
    });

    it('closures are append-only at the database level and isolated per organization', async () => {
      await expect(ds.query('DELETE FROM period_closures WHERE org_id = $1', [w.a.orgId])).rejects.toThrow(/append-only/);
      await expect(ds.query("UPDATE period_closures SET closed_through = '2000-01-01' WHERE org_id = $1", [w.a.orgId])).rejects.toThrow(/append-only/);
      expect((await http(app).get('/api/finance/closures').set(as('b.accountant')).expect(200)).body).toEqual([]);
      // org B is unaffected by A's closure
      await http(app).post('/api/payments').set(as('b.accountant')).send({ unitId: w.b.unitIds[0], amount: 5, date: daysAgo(46), method: 'cash' }).expect(201);
    });
  });

  describe('database guarantees', () => {
    it('verified payments must be recorded; matched lines must reference a payment', async () => {
      // a reversed payment can never carry the bank-verified flag
      await expect(ds.query("UPDATE payments SET verified = true WHERE org_id = $1 AND status = 'reversed'", [w.a.orgId])).rejects.toThrow(/chk_payments_verified/);
      const [pending] = await ds.query(
        `INSERT INTO payments (org_id, residence_id, unit_id, payer_name, amount, date, method, status, created_by) VALUES ($1,$2,$3,'P',1,$4,'transfer','pending',$5) RETURNING id`,
        [w.a.orgId, w.a.residenceId, w.a.unitIds[0], today(), w.a.users.accountant.id],
      );
      await expect(ds.query('UPDATE payments SET verified = true WHERE id = $1', [pending.id])).rejects.toThrow(/chk_payments_verified/);
      await expect(ds.query("UPDATE bank_lines SET status = 'matched', payment_id = NULL WHERE org_id = $1 AND status = 'unmatched'", [w.a.orgId])).rejects.toThrow(/chk_bank_match/);
    });
  });
});
