import { INestApplication } from '@nestjs/common';
import { bearer, buildWorld, createApp, http, loginAs, PASSWORD, World } from './helpers';

/** Tenant isolation: organization B must never see or touch anything of organization A. */
describe('Tenant & scope isolation', () => {
  let app: INestApplication;
  let w: World;
  const as = (key: string) => bearer(w.tokens[key]);

  beforeAll(async () => {
    app = await createApp();
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  describe('organization B cannot reach organization A (IDOR attempts return 404)', () => {
    it('lists only its own residences/units/calls', async () => {
      const res = await http(app).get('/api/residences').set(as('b.syndic_admin')).expect(200);
      expect(res.body.map((r: { id: string }) => r.id)).toEqual([w.b.residenceId]);
      const units = await http(app).get('/api/units').set(as('b.syndic_admin')).expect(200);
      expect(units.body.every((u: { orgId: string }) => u.orgId === w.b.orgId)).toBe(true);
      const calls = await http(app).get('/api/calls').set(as('b.syndic_admin')).expect(200);
      expect(calls.body.every((c: { orgId: string }) => c.orgId === w.b.orgId)).toBe(true);
      const payments = await http(app).get('/api/payments').set(as('b.accountant')).expect(200);
      expect(payments.body.every((p: { orgId: string }) => p.orgId === w.b.orgId)).toBe(true);
    });

    it('cannot read A\'s records by guessing ids', async () => {
      const t = as('b.syndic_admin');
      await http(app).get(`/api/residences/${w.a.residenceId}`).set(t).expect(404);
      await http(app).get(`/api/residences/${w.a.residenceId}/buildings`).set(t).expect(404);
      await http(app).get(`/api/units/${w.a.unitIds[0]}`).set(t).expect(404);
      await http(app).get(`/api/units/${w.a.unitIds[0]}/statement`).set(t).expect(404);
      await http(app).get(`/api/charges?unitId=${w.a.unitIds[0]}`).set(t).expect(404);
      await http(app).get(`/api/units?residenceId=${w.a.residenceId}`).set(t).expect(404);
    });

    it('cannot write into A', async () => {
      const t = as('b.syndic_admin');
      const unit = {
        buildingId: '00000000-0000-4000-8000-000000000000', number: '999', floor: 1, type: 'apartment', area: 50, tantiemes: 10,
      };
      await http(app).post('/api/units').set(t).send(unit).expect(404);
      await http(app).post('/api/calls').set(t).send({ residenceId: w.a.residenceId, title: 'Hack', period: '2026-T9', dueDate: '2026-09-15', basis: 'tantiemes', totalAmount: 1000 }).expect(404);
      await http(app).post(`/api/calls/${w.a.callIds[0]}/issue`).set(t).expect(404);
      await http(app).post(`/api/calls/${w.a.callIds[0]}/close`).set(t).expect(404);
      await http(app).delete(`/api/calls/${w.a.callIds[0]}`).set(t).expect(404);
      await http(app).post('/api/payments').set(as('b.accountant')).send({ unitId: w.a.unitIds[0], amount: 10, date: '2026-01-01', method: 'cash' }).expect(404);
      await http(app).put(`/api/residences/${w.a.residenceId}`).set(t).send({ name: 'Pwned', city: 'X', address: 'Y' }).expect(404);
      await http(app).delete(`/api/residences/${w.a.residenceId}`).set(t).expect(404);
      await http(app).post('/api/announcements').set(t).send({ residenceId: w.a.residenceId, title: 'Spam', body: 'spam spam', category: 'info', audience: 'all' }).expect(404);
      await http(app).post('/api/expenses').set(as('b.accountant')).send({ residenceId: w.a.residenceId, category: 'other', label: 'Fake', amount: 5, date: '2026-01-01' }).expect(404);
    });

    it('cannot use A\'s providers or users', async () => {
      await http(app).post('/api/expenses').set(as('b.accountant')).send({ residenceId: w.b.residenceId, category: 'other', label: 'Cross-org provider', amount: 5, date: '2026-01-01', providerId: w.a.providerId }).expect(400);
      await http(app).patch(`/api/users/${w.a.users.manager.id}`).set(as('b.syndic_admin')).send({ active: false }).expect(404);
      const users = await http(app).get('/api/users').set(as('b.syndic_admin')).expect(200);
      expect(users.body.every((u: { orgId: string }) => u.orgId === w.b.orgId)).toBe(true);
    });

    it('audit logs are organization scoped', async () => {
      const res = await http(app).get('/api/audit?limit=200').set(as('b.syndic_admin')).expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((e: { orgId: string }) => e.orgId === w.b.orgId)).toBe(true);
    });
  });

  describe('residence scope for managers', () => {
    it('a manager assigned to another residence sees none of the first one', async () => {
      const admin = as('a.syndic_admin');
      const r2 = (await http(app).post('/api/residences').set(admin).send({ name: 'Second', city: 'Rabat', address: '1 rue X' }).expect(201)).body;
      const email = `scoped.${w.a.orgId.slice(0, 6)}@example.com`;
      await http(app).post('/api/users').set(admin).send({ name: 'Scoped Manager', email, password: 'Long-enough-pass-1', role: 'manager', residenceIds: [r2.id] }).expect(201);
      const token = (await loginAs(app, email, 'Long-enough-pass-1')).accessToken;

      const list = await http(app).get('/api/residences').set(bearer(token)).expect(200);
      expect(list.body.map((r: { id: string }) => r.id)).toEqual([r2.id]);
      await http(app).get(`/api/residences/${w.a.residenceId}`).set(bearer(token)).expect(404);
      await http(app).get(`/api/units/${w.a.unitIds[0]}`).set(bearer(token)).expect(404);
      await http(app).get(`/api/units?residenceId=${w.a.residenceId}`).set(bearer(token)).expect(404);
      await http(app).post('/api/announcements').set(bearer(token)).send({ residenceId: w.a.residenceId, title: 'Nope', body: 'not allowed', category: 'info', audience: 'all' }).expect(404);
    });

    it('a manager cannot assign residences of another organization', async () => {
      await http(app).post('/api/users').set(as('a.syndic_admin')).send({ name: 'Xavier', email: `x.${w.a.orgId.slice(0, 6)}@example.com`, password: 'Long-enough-pass-1', role: 'manager', residenceIds: [w.b.residenceId] }).expect(404);
    });
  });

  describe('residents only see their own lots', () => {
    it('owner: own statement yes, neighbour\'s no, unit API closed', async () => {
      const t = as('a.owner');
      await http(app).get(`/api/units/${w.a.unitIds[0]}/statement`).set(t).expect(200);
      await http(app).get(`/api/units/${w.a.unitIds[1]}/statement`).set(t).expect(404);
      await http(app).get('/api/units').set(t).expect(403);
      await http(app).get('/api/users').set(t).expect(403);
      await http(app).get('/api/audit').set(t).expect(403);
      await http(app).get('/api/residents').set(t).expect(403);
    });

    it('owner charges are limited to their lot', async () => {
      const res = await http(app).get('/api/charges').set(as('a.owner')).expect(200);
      expect(res.body.length).toBe(3);
      expect(res.body.every((c: { unitId: string }) => c.unitId === w.a.unitIds[0])).toBe(true);
      await http(app).get(`/api/charges?unitId=${w.a.unitIds[2]}`).set(as('a.owner')).expect(404);
      const pays = await http(app).get('/api/payments').set(as('a.owner')).expect(200);
      expect(pays.body.every((p: { unitId: string }) => p.unitId === w.a.unitIds[0])).toBe(true);
    });

    it('tenant has no financial access at all', async () => {
      for (const path of ['/api/charges', '/api/calls', '/api/payments', '/api/finance/summary', '/api/expenses', `/api/units/${w.a.unitIds[1]}/statement`]) {
        await http(app).get(path).set(as('a.tenant')).expect(403);
      }
    });

    it('residents only see their own complaints; staff see the residence\'s', async () => {
      const mine = await http(app).post('/api/complaints').set(as('a.owner')).send({ unitId: w.a.unitIds[0], title: 'Fuite chez moi', category: 'plumbing', priority: 'high', description: 'Il y a une fuite.' }).expect(201);
      await http(app).post('/api/complaints').set(as('a.owner')).send({ unitId: w.a.unitIds[3], title: 'Pas mon lot', category: 'other', priority: 'low', description: 'Not my unit' }).expect(404);

      const ownerList = await http(app).get('/api/complaints').set(as('a.owner')).expect(200);
      expect(ownerList.body.map((c: { id: string }) => c.id)).toContain(mine.body.id);
      const tenantList = await http(app).get('/api/complaints').set(as('a.tenant')).expect(200);
      expect(tenantList.body.map((c: { id: string }) => c.id)).not.toContain(mine.body.id);
      const staffList = await http(app).get('/api/complaints').set(as('a.manager')).expect(200);
      expect(staffList.body.map((c: { id: string }) => c.id)).toContain(mine.body.id);
      const otherOrg = await http(app).get('/api/complaints').set(as('b.syndic_admin')).expect(200);
      expect(otherOrg.body.map((c: { id: string }) => c.id)).not.toContain(mine.body.id);

      await http(app).post(`/api/complaints/${mine.body.id}/comments`).set(as('a.tenant')).send({ text: 'snooping' }).expect(404);
      await http(app).patch(`/api/complaints/${mine.body.id}/status`).set(as('a.owner')).send({ status: 'closed' }).expect(403);
      await http(app).patch(`/api/complaints/${mine.body.id}/status`).set(as('a.manager')).send({ status: 'in_progress' }).expect(200);
    });

    it('announcements respect audiences', async () => {
      await http(app).post('/api/announcements').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, title: 'Owners only', body: 'AG ordinaire', category: 'meeting', audience: 'owners' }).expect(201);
      await http(app).post('/api/announcements').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, title: 'Staff only', body: 'Internal', category: 'info', audience: 'staff' }).expect(201);
      const titles = async (key: string) => (await http(app).get('/api/announcements').set(as(key)).expect(200)).body.map((a: { title: string }) => a.title);
      expect(await titles('a.owner')).toContain('Owners only');
      expect(await titles('a.owner')).not.toContain('Staff only');
      expect(await titles('a.tenant')).not.toContain('Owners only');
      expect(await titles('a.manager')).toContain('Staff only');
    });
  });

  describe('provider', () => {
    it('is locked out of everything but maintenance', async () => {
      for (const path of ['/api/residences', '/api/units', '/api/charges', '/api/payments', '/api/complaints', '/api/expenses', '/api/announcements', '/api/users']) {
        await http(app).get(path).set(as('a.provider')).expect(403);
      }
    });
  });

  describe('input hardening', () => {
    it('rejects malformed ids and oversized pagination', async () => {
      await http(app).get('/api/residences/not-a-uuid').set(as('a.syndic_admin')).expect(400);
      await http(app).get('/api/units?limit=100000').set(as('a.syndic_admin')).expect(400);
      await http(app).get('/api/units?limit=-1').set(as('a.syndic_admin')).expect(400);
    });

    it('rejects extra fields on write endpoints', async () => {
      await http(app).post('/api/residences').set(as('a.syndic_admin')).send({ name: 'Ok name', city: 'C', address: 'Addr', orgId: w.b.orgId }).expect(400);
    });

    it('is safe against SQL injection through filters and bodies', async () => {
      await http(app).get(`/api/audit?action=${encodeURIComponent("x'; DROP TABLE users; --")}`).set(as('a.syndic_admin')).expect(200);
      await http(app).post('/api/residences').set(as('a.syndic_admin')).send({ name: "Robert'); DROP TABLE residences;--", city: 'C', address: 'Addr' }).expect(201);
      await http(app).get('/api/residences').set(as('a.syndic_admin')).expect(200);
    });
  });

  it('passwords still work for freshly created accounts', async () => {
    await loginAs(app, w.a.users.owner.email, PASSWORD);
  });
});
