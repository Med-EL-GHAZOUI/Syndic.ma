import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { toCents } from '../../src/common/money';
import { bearer, buildWorld, createApp, http, World } from './helpers';

type Charge = { id: string; unitId: string; callId: string; amount: number; paid: number; due: number; status: string; dueDate: string };

describe('Finance: calls, charges, payments, reversals', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  const as = (key: string) => bearer(w.tokens[key]);
  const year = new Date().getFullYear();

  const statement = async (unitId: string, key = 'a.accountant') => (await http(app).get(`/api/units/${unitId}/statement`).set(as(key)).expect(200)).body as { balance: number; lines: { kind: string; balance: number }[] };
  const balance = async (unitId: string) => (await statement(unitId)).balance;
  const pay = (unitId: string, amount: number, extra: Record<string, unknown> = {}, key = 'a.accountant') =>
    http(app).post('/api/payments').set(as(key)).send({ unitId, amount, date: new Date().toISOString().slice(0, 10), method: 'cash', ...extra });

  beforeAll(async () => {
    app = await createApp();
    ds = app.get(DataSource);
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  describe('calls for funds', () => {
    it('issued calls generated charges that sum exactly to the total (I2)', async () => {
      const charges = (await http(app).get('/api/charges?limit=200').set(as('a.accountant')).expect(200)).body as Charge[];
      for (const callId of w.a.callIds) {
        const lines = charges.filter((c) => c.callId === callId);
        expect(lines).toHaveLength(8);
        expect(lines.reduce((a, c) => a + toCents(c.amount), 0)).toBe(1_200_000);
      }
    });

    it('issuing twice is rejected and creates no duplicate charges', async () => {
      await http(app).post(`/api/calls/${w.a.callIds[0]}/issue`).set(as('a.syndic_admin')).expect(409);
      const [{ n }] = await ds.query('SELECT count(*)::int AS n FROM charges WHERE call_id = $1', [w.a.callIds[0]]);
      expect(n).toBe(8);
    });

    it('concurrent issue of one draft yields exactly one set of charges', async () => {
      const admin = as('a.syndic_admin');
      const call = (await http(app).post('/api/calls').set(admin).send({ residenceId: w.a.residenceId, title: 'Race', period: `${year}-R`, dueDate: `${year}-11-15`, basis: 'tantiemes', totalAmount: 777.77 }).expect(201)).body;
      const res = await Promise.all([http(app).post(`/api/calls/${call.id}/issue`).set(admin), http(app).post(`/api/calls/${call.id}/issue`).set(admin)]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
      const [{ n, total }] = await ds.query('SELECT count(*)::int AS n, sum(round(amount*100))::bigint AS total FROM charges WHERE call_id = $1', [call.id]);
      expect(n).toBe(8);
      expect(Number(total)).toBe(77777);
    });

    it('fixed-amount calls and draft deletion', async () => {
      const admin = as('a.syndic_admin');
      const draft = (await http(app).post('/api/calls').set(admin).send({ residenceId: w.a.residenceId, title: 'Fixe', period: 'F1', dueDate: `${year}-12-01`, basis: 'fixed', amountPerUnit: 150 }).expect(201)).body;
      await http(app).delete(`/api/calls/${draft.id}`).set(admin).expect(204);
      await http(app).delete(`/api/calls/${w.a.callIds[0]}`).set(admin).expect(409); // issued calls are never deleted
    });

    it('validates call payloads', async () => {
      const admin = as('a.syndic_admin');
      await http(app).post('/api/calls').set(admin).send({ residenceId: w.a.residenceId, title: 'Bad', period: 'X1', dueDate: 'not-a-date', basis: 'tantiemes', totalAmount: 10 }).expect(400);
      await http(app).post('/api/calls').set(admin).send({ residenceId: w.a.residenceId, title: 'Bad', period: 'X1', dueDate: `${year}-01-01`, basis: 'tantiemes', totalAmount: -5 }).expect(400);
      await http(app).post('/api/calls').set(admin).send({ residenceId: w.a.residenceId, title: 'Bad', period: 'X1', dueDate: `${year}-01-01`, basis: 'tantiemes', totalAmount: 10.123 }).expect(400);
      await http(app).post('/api/calls').set(admin).send({ residenceId: w.a.residenceId, title: 'Bad', period: 'X1', dueDate: `${year}-01-01`, basis: 'tantiemes' }).expect(400);
    });

    it('permissions: only finance editors create/issue calls', async () => {
      const body = { residenceId: w.a.residenceId, title: 'Nope', period: 'N1', dueDate: `${year}-05-01`, basis: 'tantiemes', totalAmount: 10 };
      for (const key of ['a.manager', 'a.owner', 'a.tenant', 'a.provider']) await http(app).post('/api/calls').set(as(key)).send(body).expect(403);
      await http(app).post(`/api/calls/${w.a.callIds[0]}/issue`).set(as('a.manager')).expect(403);
    });
  });

  describe('recording payments', () => {
    const unit = () => w.a.unitIds[2];

    it('allocates FIFO on the oldest charge, partially, and issues receipt #1', async () => {
      const before = await balance(unit());
      const res = await pay(unit(), 100.5, { reference: 'CASH-1' }).expect(201);
      expect(res.body.receiptNo).toBe(`REC-${new Date().getFullYear()}-0001`);
      expect(res.body.status).toBe('recorded');
      expect(res.body.verified).toBe(false); // recorded != verified by a bank/provider
      expect(res.body.allocations).toHaveLength(1);
      expect(toCents(await balance(unit()))).toBe(toCents(before) - 10050);

      const charges = (await http(app).get(`/api/charges?unitId=${unit()}`).set(as('a.accountant')).expect(200)).body as Charge[];
      const oldest = [...charges].sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0];
      expect(oldest.paid).toBe(100.5);
      expect(oldest.status).toBe('partial');
    });

    it('rejects overpayment, nothing-due, future dates, zero/negative/3-decimal amounts', async () => {
      const bal = await balance(unit());
      await pay(unit(), bal + 0.01).expect(409);
      await pay(unit(), 0).expect(400);
      await pay(unit(), -5).expect(400);
      await pay(unit(), 10.005).expect(400);
      await pay(unit(), 10, { date: '2999-01-01' }).expect(400);
      expect(await balance(unit())).toBe(bal);
    });

    it('a payment of exactly the balance settles everything; further payments are refused', async () => {
      const u = w.a.unitIds[3];
      const bal = await balance(u);
      await pay(u, bal).expect(201);
      expect(await balance(u)).toBe(0);
      await pay(u, 1).expect(409);
      const charges = (await http(app).get(`/api/charges?unitId=${u}`).set(as('a.accountant')).expect(200)).body as Charge[];
      expect(charges.every((c) => c.status === 'paid' && c.due === 0)).toBe(true);
    });

    it('statement balance = total charged - total recorded payments', async () => {
      const s = await statement(unit());
      const [{ charged }] = await ds.query('SELECT COALESCE(sum(round(amount*100)),0)::bigint AS charged FROM charges WHERE unit_id = $1', [unit()]);
      const [{ paid }] = await ds.query("SELECT COALESCE(sum(round(amount*100)),0)::bigint AS paid FROM payments WHERE unit_id = $1 AND status = 'recorded'", [unit()]);
      expect(toCents(s.balance)).toBe(Number(charged) - Number(paid));
      expect(s.lines.at(-1)!.balance).toBe(s.balance);
    });

    it('staff vs resident roles: owners cannot record; managers cannot validate', async () => {
      await pay(w.a.unitIds[0], 5, {}, 'a.owner').expect(403);
      await pay(w.a.unitIds[0], 5, {}, 'a.tenant').expect(403);
      await pay(w.a.unitIds[0], 5, {}, 'a.provider').expect(403);
      await pay(w.a.unitIds[4], 5, {}, 'a.manager').expect(201); // managers may record (payments: vc)
    });
  });

  describe('declared payments (resident -> staff validation)', () => {
    let pendingId: string;
    const unit = () => w.a.unitIds[0];

    it('a declaration is pending and has NO effect on the balance', async () => {
      const before = await balance(unit());
      const res = await http(app).post('/api/payments/declare').set(as('a.owner')).send({ unitId: unit(), amount: 80, date: new Date().toISOString().slice(0, 10), method: 'transfer', reference: 'VIR 123456' }).expect(201);
      pendingId = res.body.id;
      expect(res.body.status).toBe('pending');
      expect(res.body.receiptNo).toBeNull();
      expect(await balance(unit())).toBe(before);
    });

    it('requires a reference, only for the resident\'s own lot, never above the balance, and only from residents', async () => {
      const base = { amount: 10, date: new Date().toISOString().slice(0, 10), method: 'transfer' };
      await http(app).post('/api/payments/declare').set(as('a.owner')).send({ ...base, unitId: unit() }).expect(400);
      await http(app).post('/api/payments/declare').set(as('a.owner')).send({ ...base, unitId: w.a.unitIds[5], reference: 'R' }).expect(404);
      await http(app).post('/api/payments/declare').set(as('a.owner')).send({ ...base, unitId: unit(), amount: 9_999_999, reference: 'R' }).expect(409);
      await http(app).post('/api/payments/declare').set(as('a.accountant')).send({ ...base, unitId: unit(), reference: 'R' }).expect(403);
    });

    it('residents and managers cannot confirm, reject or reverse', async () => {
      for (const key of ['a.owner', 'a.manager', 'a.tenant']) {
        await http(app).post(`/api/payments/${pendingId}/confirm`).set(as(key)).expect(403);
        await http(app).post(`/api/payments/${pendingId}/reject`).set(as(key)).send({ reason: 'nope nope' }).expect(403);
      }
    });

    it('the accountant confirms: allocation + receipt; confirming again is rejected (concurrently too)', async () => {
      const before = await balance(unit());
      const results = await Promise.all([
        http(app).post(`/api/payments/${pendingId}/confirm`).set(as('a.accountant')),
        http(app).post(`/api/payments/${pendingId}/confirm`).set(as('a.syndic_admin')),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(toCents(await balance(unit()))).toBe(toCents(before) - 8000);
      const [{ n }] = await ds.query('SELECT count(*)::int AS n FROM allocations WHERE payment_id = $1', [pendingId]);
      expect(n).toBeGreaterThanOrEqual(1);
      const [{ s }] = await ds.query('SELECT sum(round(amount*100))::bigint AS s FROM allocations WHERE payment_id = $1', [pendingId]);
      expect(Number(s)).toBe(8000); // allocated == payment amount (I4)
    });

    it('rejection requires a reason and never touches balances', async () => {
      const d = (await http(app).post('/api/payments/declare').set(as('a.owner')).send({ unitId: unit(), amount: 20, date: new Date().toISOString().slice(0, 10), method: 'cheque', reference: 'CHQ 1' }).expect(201)).body;
      await http(app).post(`/api/payments/${d.id}/reject`).set(as('a.accountant')).send({}).expect(400);
      const before = await balance(unit());
      await http(app).post(`/api/payments/${d.id}/reject`).set(as('a.accountant')).send({ reason: 'Chèque introuvable' }).expect(200);
      expect(await balance(unit())).toBe(before);
      await http(app).post(`/api/payments/${d.id}/confirm`).set(as('a.accountant')).expect(409);
    });
  });

  describe('reversals (I3)', () => {
    it('reverses with a reason: balance restored, receipt and history kept, not repeatable', async () => {
      const u = w.a.unitIds[5];
      const before = await balance(u);
      const p = (await pay(u, 300).expect(201)).body;
      expect(toCents(await balance(u))).toBe(toCents(before) - 30000);

      await http(app).post(`/api/payments/${p.id}/reverse`).set(as('a.accountant')).send({}).expect(400);
      await http(app).post(`/api/payments/${p.id}/reverse`).set(as('a.manager')).send({ reason: 'not allowed' }).expect(403);
      await http(app).post(`/api/payments/${p.id}/reverse`).set(as('a.accountant')).send({ reason: 'Chèque rejeté' }).expect(200);
      expect(await balance(u)).toBe(before);
      await http(app).post(`/api/payments/${p.id}/reverse`).set(as('a.accountant')).send({ reason: 'again' }).expect(409);

      const list = (await http(app).get(`/api/payments?unitId=${u}`).set(as('a.accountant')).expect(200)).body as { id: string; status: string; receiptNo: string; reason: string }[];
      const kept = list.find((x) => x.id === p.id)!;
      expect(kept.status).toBe('reversed');
      expect(kept.receiptNo).toBe(p.receiptNo);
      expect(kept.reason).toBe('Chèque rejeté');
    });

    it('a reversed amount can be paid again and gets a NEW receipt number', async () => {
      const u = w.a.unitIds[6];
      const first = (await pay(u, 50).expect(201)).body;
      await http(app).post(`/api/payments/${first.id}/reverse`).set(as('a.accountant')).send({ reason: 'erreur de saisie' }).expect(200);
      const second = (await pay(u, 50).expect(201)).body;
      expect(second.receiptNo).not.toBe(first.receiptNo);
    });
  });

  describe('concurrency (I4, I5)', () => {
    it('two simultaneous payments of the full balance: exactly one succeeds, no over-allocation', async () => {
      const u = w.a.unitIds[7];
      const bal = await balance(u);
      const res = await Promise.all([pay(u, bal), pay(u, bal), pay(u, bal)]);
      expect(res.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      expect(await balance(u)).toBe(0);
    });

    it('parallel payments on different units get distinct, gap-free receipt numbers', async () => {
      const targets = [w.a.unitIds[1], w.a.unitIds[4], w.a.unitIds[5], w.a.unitIds[6]];
      const res = await Promise.all(targets.map((u) => pay(u, 1)));
      expect(res.every((r) => r.status === 201)).toBe(true);
      const nos = res.map((r) => r.body.receiptNo as string);
      expect(new Set(nos).size).toBe(nos.length);
    });

    it('receipt numbers of the organization are unique and contiguous', async () => {
      const rows = await ds.query("SELECT receipt_no FROM payments WHERE org_id = $1 AND receipt_no IS NOT NULL", [w.a.orgId]);
      const nums = rows.map((r: { receipt_no: string }) => Number(r.receipt_no.split('-')[2])).sort((a: number, b: number) => a - b);
      expect(new Set(nums).size).toBe(nums.length);
      expect(nums).toEqual(nums.map((_: number, i: number) => i + 1));
    });

    it('receipt numbering is independent per organization', async () => {
      const first = (await http(app).post('/api/payments').set(as('b.accountant')).send({ unitId: w.b.unitIds[0], amount: 10, date: new Date().toISOString().slice(0, 10), method: 'cash' })).body;
      // B was suspended in another suite? No: suites have separate worlds. B starts at 0001.
      expect(first.receiptNo).toBe(`REC-${new Date().getFullYear()}-0001`);
    });
  });

  describe('database-level guarantees (hold even if the application is bypassed)', () => {
    it('audit log rows cannot be updated, deleted or truncated', async () => {
      const [row] = await ds.query('SELECT id FROM audit_logs WHERE org_id = $1 LIMIT 1', [w.a.orgId]);
      await expect(ds.query("UPDATE audit_logs SET summary = 'tampered' WHERE id = $1", [row.id])).rejects.toThrow(/append-only/);
      await expect(ds.query('DELETE FROM audit_logs WHERE id = $1', [row.id])).rejects.toThrow(/append-only/);
      await expect(ds.query('TRUNCATE audit_logs')).rejects.toThrow(/append-only/);
    });

    it('confirmed payments cannot be deleted', async () => {
      const [row] = await ds.query("SELECT id FROM payments WHERE org_id = $1 AND status IN ('recorded','reversed') LIMIT 1", [w.a.orgId]);
      await expect(ds.query('DELETE FROM payments WHERE id = $1', [row.id])).rejects.toThrow(/cannot be deleted/);
    });

    it('rejects non-positive amounts and receipt/status mismatches', async () => {
      await expect(ds.query("UPDATE charges SET amount = -1 WHERE org_id = $1", [w.a.orgId])).rejects.toThrow(/chk_charges_amount/);
      const [row] = await ds.query("SELECT id FROM payments WHERE org_id = $1 AND status = 'recorded' LIMIT 1", [w.a.orgId]);
      await expect(ds.query("UPDATE payments SET receipt_no = NULL WHERE id = $1", [row.id])).rejects.toThrow(/chk_payments_receipt/);
    });
  });

  describe('expenses workflow & summary', () => {
    it('pending -> approved -> paid with guarded transitions and roles', async () => {
      const e = (await http(app).post('/api/expenses').set(as('a.manager')).send({ residenceId: w.a.residenceId, category: 'repairs', label: 'Pompe', amount: 1500.5, date: new Date().toISOString().slice(0, 10), providerId: w.a.providerId }).expect(201)).body;
      expect(e.status).toBe('pending');
      await http(app).post(`/api/expenses/${e.id}/approve`).set(as('a.manager')).expect(403);
      await http(app).post(`/api/expenses/${e.id}/pay`).set(as('a.accountant')).expect(409); // cannot skip approval
      await http(app).post(`/api/expenses/${e.id}/approve`).set(as('a.accountant')).expect(200);
      await http(app).post(`/api/expenses/${e.id}/approve`).set(as('a.accountant')).expect(409);
      await http(app).put(`/api/expenses/${e.id}`).set(as('a.manager')).send({ residenceId: w.a.residenceId, category: 'repairs', label: 'Changed', amount: 1, date: '2026-01-01' }).expect(409);
      await http(app).post(`/api/expenses/${e.id}/pay`).set(as('a.accountant')).expect(200);
      await http(app).post(`/api/expenses/${e.id}/cancel`).set(as('a.accountant')).send({}).expect(400);
      const summary = (await http(app).get('/api/finance/summary').set(as('a.accountant')).expect(200)).body;
      expect(summary.expensesPaid).toBe(1500.5);
    });

    it('summary figures are consistent with the ledger', async () => {
      const s = (await http(app).get(`/api/finance/summary?residenceId=${w.a.residenceId}`).set(as('a.syndic_admin')).expect(200)).body;
      const [{ charged }] = await ds.query('SELECT sum(round(amount*100))::bigint AS charged FROM charges WHERE org_id = $1', [w.a.orgId]);
      const [{ paid }] = await ds.query("SELECT sum(round(a.amount*100))::bigint AS paid FROM allocations a JOIN payments p ON p.id = a.payment_id WHERE p.org_id = $1 AND p.status = 'recorded'", [w.a.orgId]);
      expect(toCents(s.charged)).toBe(Number(charged));
      expect(toCents(s.collected)).toBe(Number(paid));
      expect(toCents(s.outstanding)).toBe(Number(charged) - Number(paid));
      await http(app).get('/api/finance/summary').set(as('a.owner')).expect(403);
    });
  });

  describe('global ledger invariants after all of the above', () => {
    it('no charge is over-allocated and every recorded payment is fully allocated', async () => {
      const over = await ds.query(
        `SELECT c.id FROM charges c JOIN allocations a ON a.charge_id = c.id JOIN payments p ON p.id = a.payment_id
          WHERE c.org_id = $1 AND p.status = 'recorded' GROUP BY c.id, c.amount HAVING sum(a.amount) > c.amount`, [w.a.orgId]);
      expect(over).toHaveLength(0);
      const unbalanced = await ds.query(
        `SELECT p.id FROM payments p LEFT JOIN allocations a ON a.payment_id = p.id
          WHERE p.org_id = $1 AND p.status IN ('recorded','reversed') GROUP BY p.id, p.amount HAVING COALESCE(sum(round(a.amount*100)),0) <> round(p.amount*100)`, [w.a.orgId]);
      expect(unbalanced).toHaveLength(0);
      const pending = await ds.query("SELECT 1 FROM allocations a JOIN payments p ON p.id = a.payment_id WHERE p.org_id = $1 AND p.status IN ('pending','rejected')", [w.a.orgId]);
      expect(pending).toHaveLength(0);
    });

    it('every financial change is in the audit trail', async () => {
      const rows = (await http(app).get('/api/audit?limit=200').set(as('a.syndic_admin')).expect(200)).body as { action: string; entity: string }[];
      const has = (action: string, entity: string) => rows.some((r) => r.action === action && r.entity === entity);
      expect(has('issue', 'calls')).toBe(true);
      expect(has('create', 'payments')).toBe(true);
      expect(has('confirm', 'payments')).toBe(true);
      expect(has('reverse', 'payments')).toBe(true);
      expect(has('reject', 'payments')).toBe(true);
      expect(has('declare', 'payments')).toBe(true);
    });

    it('audit timestamps are real instants: recent entries are within a few seconds of now (no UTC-offset shift)', async () => {
      const rows = (await http(app).get('/api/audit?limit=5').set(as('a.syndic_admin')).expect(200)).body as { createdAt: string }[];
      for (const r of rows) expect(Math.abs(Date.now() - new Date(r.createdAt).getTime())).toBeLessThan(120_000);
    });
  });
});
