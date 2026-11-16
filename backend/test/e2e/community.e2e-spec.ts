import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { bearer, buildWorld, createApp, http, loginAs, PASSWORD, refreshWith, World } from './helpers';

const today = () => new Date().toISOString().slice(0, 10);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('fake pdf body for tests\n%%EOF')]);

describe('Maintenance, assemblies, documents', () => {
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

  // =============================== maintenance ===============================
  describe('maintenance work orders', () => {
    let orderId: string;
    const body = () => ({ residenceId: w.a.residenceId, title: 'Réparer la pompe', type: 'corrective', providerId: w.a.providerId, scheduledDate: today(), estimatedCost: 1200 });

    it('staff create; providers and residents cannot', async () => {
      orderId = (await http(app).post('/api/maintenance').set(as('a.manager')).send(body()).expect(201)).body.id;
      for (const key of ['a.provider', 'a.owner', 'a.tenant', 'a.accountant']) await http(app).post('/api/maintenance').set(as(key)).send(body()).expect(403);
    });

    it('cannot assign a provider of another organization', async () => {
      await http(app).post('/api/maintenance').set(as('b.syndic_admin')).send({ ...body(), residenceId: w.b.residenceId, providerId: w.a.providerId }).expect(400);
    });

    it('a provider only sees work assigned to their own company', async () => {
      const mine = (await http(app).get('/api/maintenance').set(as('a.provider')).expect(200)).body as { id: string }[];
      expect(mine.map((o) => o.id)).toContain(orderId);
      const theirs = (await http(app).get('/api/maintenance').set(as('b.provider')).expect(200)).body as { id: string }[];
      expect(theirs.map((o) => o.id)).not.toContain(orderId);
      await http(app).post(`/api/maintenance/${orderId}/start`).set(as('b.provider')).expect(404);
      await http(app).post(`/api/maintenance/${orderId}/start`).set(as('b.syndic_admin')).expect(404);
    });

    it('guarded lifecycle planned -> in_progress -> done', async () => {
      await http(app).post(`/api/maintenance/${orderId}/complete`).set(as('a.provider')).send({ actualCost: 10 }).expect(409); // not started
      await http(app).post(`/api/maintenance/${orderId}/start`).set(as('a.provider')).expect(200);
      await http(app).post(`/api/maintenance/${orderId}/start`).set(as('a.provider')).expect(409);
      await http(app).post(`/api/maintenance/${orderId}/cancel`).set(as('a.provider')).expect(404); // providers cannot cancel
      await http(app).post(`/api/maintenance/${orderId}/notes`).set(as('a.provider')).send({ text: 'Pièce commandée' }).expect(201);
      await http(app).post(`/api/maintenance/${orderId}/complete`).set(as('a.provider')).send({ actualCost: 1350.5, note: 'Terminé', createExpense: true }).expect(400); // providers cannot create expenses
      await http(app).post(`/api/maintenance/${orderId}/complete`).set(as('a.provider')).send({ actualCost: 1350.5, note: 'Terminé' }).expect(200);
      await http(app).post(`/api/maintenance/${orderId}/complete`).set(as('a.provider')).send({ actualCost: 1 }).expect(409);
      await http(app).post(`/api/maintenance/${orderId}/notes`).set(as('a.provider')).send({ text: 'trop tard' }).expect(409);
    });

    it('linking a complaint moves it to in_progress and completion resolves it; staff can create the expense', async () => {
      const complaint = (await http(app).post('/api/complaints').set(as('a.owner')).send({ unitId: w.a.unitIds[0], title: 'Fuite au plafond', category: 'plumbing', priority: 'high', description: 'Fuite importante' }).expect(201)).body;
      const order = (await http(app).post('/api/maintenance').set(as('a.syndic_admin')).send({ ...body(), complaintId: complaint.id, title: 'Recherche de fuite' }).expect(201)).body;
      const [c1] = await ds.query('SELECT status FROM complaints WHERE id = $1', [complaint.id]);
      expect(c1.status).toBe('in_progress');
      await http(app).post(`/api/maintenance/${order.id}/start`).set(as('a.syndic_admin')).expect(200);
      await http(app).post(`/api/maintenance/${order.id}/complete`).set(as('a.syndic_admin')).send({ actualCost: 800, createExpense: true }).expect(200);
      const [c2] = await ds.query('SELECT status FROM complaints WHERE id = $1', [complaint.id]);
      expect(c2.status).toBe('resolved');
      const [{ n }] = await ds.query("SELECT count(*)::int AS n FROM expenses WHERE org_id = $1 AND label = 'Recherche de fuite' AND status = 'pending'", [w.a.orgId]);
      expect(n).toBe(1);
    });

    it('rejects a complaint from another residence/organization', async () => {
      const other = (await http(app).post('/api/complaints').set(as('b.owner')).send({ unitId: w.b.unitIds[0], title: 'Autre org', category: 'other', priority: 'low', description: 'Autre org' }).expect(201)).body;
      await http(app).post('/api/maintenance').set(as('a.syndic_admin')).send({ ...body(), complaintId: other.id }).expect(400);
    });
  });

  // =============================== assemblies ===============================
  describe('general assemblies', () => {
    let id: string;
    const draft = () => ({ residenceId: w.a.residenceId, title: 'AG ordinaire', type: 'ordinary', date: today(), time: '18:30', location: 'Salle polyvalente', agenda: ['Approbation des comptes', 'Budget'] });

    it('residents cannot create/edit; draft assemblies are invisible to them', async () => {
      id = (await http(app).post('/api/assemblies').set(as('a.syndic_admin')).send(draft()).expect(201)).body.id;
      await http(app).post('/api/assemblies').set(as('a.owner')).send(draft()).expect(403);
      await http(app).post(`/api/assemblies/${id}/convene`).set(as('a.owner')).expect(403);
      const ownerList = (await http(app).get('/api/assemblies').set(as('a.owner')).expect(200)).body as { id: string }[];
      expect(ownerList.map((x) => x.id)).not.toContain(id);
      await http(app).get(`/api/assemblies/${id}`).set(as('a.owner')).expect(404);
      await http(app).get('/api/assemblies').set(as('a.tenant')).expect(403);
    });

    it('validates the payload', async () => {
      await http(app).post('/api/assemblies').set(as('a.syndic_admin')).send({ ...draft(), time: '25:99' }).expect(400);
      await http(app).post('/api/assemblies').set(as('a.syndic_admin')).send({ ...draft(), agenda: 'not-an-array' }).expect(400);
    });

    it('attendance/resolutions are locked until the assembly is convened', async () => {
      await http(app).put(`/api/assemblies/${id}/attendance`).set(as('a.syndic_admin')).send({ unitId: w.a.unitIds[0], status: 'present' }).expect(409);
      await http(app).post(`/api/assemblies/${id}/resolutions`).set(as('a.syndic_admin')).send({ title: 'Approbation', votesFor: 0, votesAgainst: 0, abstain: 0 }).expect(409);
    });

    it('convened: residents see it; tantième-weighted quorum and vote bounds are enforced', async () => {
      await http(app).post(`/api/assemblies/${id}/convene`).set(as('a.syndic_admin')).expect(200);
      await http(app).post(`/api/assemblies/${id}/convene`).set(as('a.syndic_admin')).expect(409);
      await http(app).get(`/api/assemblies/${id}`).set(as('a.owner')).expect(200);

      await http(app).put(`/api/assemblies/${id}/attendance`).set(as('a.manager')).send({ unitId: w.a.unitIds[0], status: 'proxy' }).expect(400); // proxyTo required
      await http(app).put(`/api/assemblies/${id}/attendance`).set(as('a.manager')).send({ unitId: '00000000-0000-4000-8000-000000000000', status: 'present' }).expect(404);
      for (const u of w.a.unitIds.slice(0, 4)) await http(app).put(`/api/assemblies/${id}/attendance`).set(as('a.manager')).send({ unitId: u, status: 'present' }).expect(200);
      await http(app).put(`/api/assemblies/${id}/attendance`).set(as('a.manager')).send({ unitId: w.a.unitIds[4], status: 'proxy', proxyTo: 'Karim Tazi' }).expect(200);

      const view = (await http(app).get(`/api/assemblies/${id}`).set(as('a.syndic_admin')).expect(200)).body;
      const [{ s }] = await ds.query('SELECT sum(tantiemes)::int AS s FROM units WHERE id = ANY($1)', [w.a.unitIds.slice(0, 5)]);
      expect(view.quorum.represented).toBe(s);
      expect(view.quorum.total).toBe(1000);

      // votes cannot exceed the represented tantièmes
      await http(app).post(`/api/assemblies/${id}/resolutions`).set(as('a.syndic_admin')).send({ title: 'Trop de voix', votesFor: s + 1, votesAgainst: 0, abstain: 0 }).expect(400);
      await http(app).post(`/api/assemblies/${id}/resolutions`).set(as('a.syndic_admin')).send({ title: 'Négatif', votesFor: -1, votesAgainst: 0, abstain: 0 }).expect(400);
      const ok = (await http(app).post(`/api/assemblies/${id}/resolutions`).set(as('a.syndic_admin')).send({ title: 'Approbation des comptes', votesFor: s - 50, votesAgainst: 30, abstain: 20 }).expect(201)).body;
      expect(ok.resolutions).toHaveLength(1);
      const after = (await http(app).get(`/api/assemblies/${id}`).set(as('a.syndic_admin'))).body;
      expect(after.resolutions[0].result).toBe('adopted');
      expect(after.legalNote).toMatch(/verified/i);
    });

    it('lowering attendance below already-cast votes is refused', async () => {
      await http(app).put(`/api/assemblies/${id}/attendance`).set(as('a.manager')).send({ unitId: w.a.unitIds[0], status: 'absent' }).expect(409);
    });

    it('is isolated per organization', async () => {
      await http(app).get(`/api/assemblies/${id}`).set(as('b.syndic_admin')).expect(404);
      await http(app).post(`/api/assemblies/${id}/hold`).set(as('b.syndic_admin')).expect(404);
    });

    it('a held assembly is frozen and undeletable (API and database)', async () => {
      await http(app).patch(`/api/assemblies/${id}/minutes`).set(as('a.syndic_admin')).send({ minutes: 'Séance ouverte à 18h40.' }).expect(200);
      await http(app).post(`/api/assemblies/${id}/hold`).set(as('a.syndic_admin')).expect(200);
      await http(app).post(`/api/assemblies/${id}/hold`).set(as('a.syndic_admin')).expect(409);
      await http(app).post(`/api/assemblies/${id}/resolutions`).set(as('a.syndic_admin')).send({ title: 'Tardive', votesFor: 1, votesAgainst: 0, abstain: 0 }).expect(409);
      await http(app).put(`/api/assemblies/${id}/attendance`).set(as('a.syndic_admin')).send({ unitId: w.a.unitIds[0], status: 'absent' }).expect(409);
      await http(app).post(`/api/assemblies/${id}/cancel`).set(as('a.syndic_admin')).expect(409);
      await http(app).delete(`/api/assemblies/${id}`).set(as('a.syndic_admin')).expect(409);
      await expect(ds.query('DELETE FROM assemblies WHERE id = $1', [id])).rejects.toThrow(/cannot be deleted/);
    });
  });

  // =============================== documents ===============================
  describe('documents & secure uploads', () => {
    const fields = (visibility = 'owners') => ({ residenceId: w.a.residenceId, name: 'Règlement', category: 'regulation', visibility });
    const upload = (key: string, file: Buffer | null, filename: string, f: Record<string, string> = fields()) => {
      const req = http(app).post('/api/documents').set(as(key));
      for (const [k, v] of Object.entries(f)) req.field(k, v);
      if (file) req.attach('file', file, { filename, contentType: 'application/pdf' });
      return req;
    };
    let ownersDoc: { id: string };
    let staffDoc: { id: string };

    it('accepts a valid PDF, stores it privately and never exposes the storage key', async () => {
      const res = await upload('a.syndic_admin', PDF, 'Règlement copropriété.pdf').expect(201);
      ownersDoc = res.body;
      expect(res.body.storageKey).toBeUndefined();
      expect(res.body.mime).toBe('application/pdf');
      expect(res.body.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
      expect(res.body.size).toBe(PDF.length);
      const [row] = await ds.query('SELECT storage_key FROM documents WHERE id = $1', [res.body.id]);
      expect(row.storage_key).toMatch(new RegExp(`^${w.a.orgId}/[0-9a-f-]{36}$`)); // random key, not the file name
    });

    it('rejects disguised / dangerous / empty / oversized uploads', async () => {
      await upload('a.syndic_admin', Buffer.from('MZ\x90\x00\x03\x00\x00\x00 executable'), 'invoice.pdf').expect(415);
      await upload('a.syndic_admin', Buffer.from('<svg onload=alert(1)>'), 'logo.svg').expect(415);
      await upload('a.syndic_admin', Buffer.from('<html><script>alert(1)</script></html>'), 'page.pdf').expect(415);
      await upload('a.syndic_admin', null, '').expect(400);
      await upload('a.syndic_admin', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024 + 1)]), 'big.pdf').expect(413);
    });

    it('validates metadata and residence scope', async () => {
      await upload('a.syndic_admin', PDF, 'a.pdf', { ...fields(), visibility: 'everyone' }).expect(400);
      await upload('a.syndic_admin', PDF, 'a.pdf', { ...fields(), name: 'x' }).expect(400);
      await upload('b.syndic_admin', PDF, 'a.pdf', fields()).expect(404); // A's residence
      await upload('a.syndic_admin', PDF, 'a.pdf', { ...fields(), extra: 'nope' }).expect(400);
    });

    it('permissions: residents/providers cannot upload; accountants can', async () => {
      for (const key of ['a.owner', 'a.tenant', 'a.provider']) await upload(key, PDF, 'a.pdf').expect(403);
      await upload('a.accountant', PDF, 'compta.pdf', fields('staff')).expect(201);
    });

    it('sanitizes path-traversal file names (display only) and keeps the storage safe', async () => {
      const res = await upload('a.manager', PDF, '../../../etc/passwd.pdf', fields('staff')).expect(201);
      staffDoc = res.body;
      expect(res.body.fileName).toBe('passwd.pdf');
    });

    it('visibility: owners see owners+all, tenants only all, staff everything', async () => {
      const ids = async (key: string) => ((await http(app).get('/api/documents').set(as(key)).expect(200)).body as { id: string }[]).map((d) => d.id);
      expect(await ids('a.owner')).toContain(ownersDoc.id);
      expect(await ids('a.owner')).not.toContain(staffDoc.id);
      expect(await ids('a.tenant')).not.toContain(ownersDoc.id);
      expect(await ids('a.manager')).toEqual(expect.arrayContaining([ownersDoc.id, staffDoc.id]));
      expect(await ids('b.syndic_admin')).not.toContain(ownersDoc.id);
      await http(app).get('/api/documents').set(as('a.provider')).expect(403);
    });

    it('download is always an attachment with the server-detected type, and is access-controlled', async () => {
      const ok = await http(app).get(`/api/documents/${ownersDoc.id}/download`).set(as('a.owner')).expect(200);
      expect(ok.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''/);
      expect(ok.headers['content-type']).toMatch(/application\/pdf/);
      expect(ok.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(ok.body).equals(PDF)).toBe(true);

      await http(app).get(`/api/documents/${ownersDoc.id}/download`).set(as('a.tenant')).expect(404); // not visible to tenants
      await http(app).get(`/api/documents/${staffDoc.id}/download`).set(as('a.owner')).expect(404);
      await http(app).get(`/api/documents/${ownersDoc.id}/download`).set(as('b.syndic_admin')).expect(404); // other org
      await http(app).get(`/api/documents/${ownersDoc.id}/download`).set(as('a.provider')).expect(403);
      await http(app).get(`/api/documents/${ownersDoc.id}/download`).expect(401);
    });

    it('downloads and deletions are audited; deletion removes the document', async () => {
      await http(app).delete(`/api/documents/${staffDoc.id}`).set(as('a.owner')).expect(403);
      await http(app).delete(`/api/documents/${staffDoc.id}`).set(as('a.manager')).expect(204);
      await http(app).get(`/api/documents/${staffDoc.id}/download`).set(as('a.manager')).expect(404);
      const audit = (await http(app).get('/api/audit?limit=200').set(as('a.syndic_admin')).expect(200)).body as { action: string; entity: string }[];
      expect(audit.some((e) => e.action === 'download' && e.entity === 'documents')).toBe(true);
      expect(audit.some((e) => e.action === 'delete' && e.entity === 'documents')).toBe(true);
    });
  });

  // =============================== password change ===============================
  describe('password change', () => {
    it('requires the current password, enforces strength and revokes all sessions', async () => {
      const u = w.a.users.manager2;
      const session = await loginAs(app, u.email);
      const t = bearer(session.accessToken);
      await http(app).post('/api/auth/change-password').set(t).send({ currentPassword: 'wrong-password-1', newPassword: 'Brand-new-passw0rd!' }).expect(403); // authenticated, but re-confirmation failed (not a 401: the session is fine)
      await http(app).post('/api/auth/change-password').set(t).send({ currentPassword: PASSWORD, newPassword: 'short' }).expect(400);
      await http(app).post('/api/auth/change-password').set(t).send({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);
      await http(app).post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'Brand-new-passw0rd!' }).expect(401);
      await http(app).post('/api/auth/change-password').set(t).send({ currentPassword: PASSWORD, newPassword: 'Brand-new-passw0rd!' }).expect(204);

      await refreshWith(app, session.cookie).expect(401); // old sessions revoked
      await http(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD }).expect(401);
      await http(app).post('/api/auth/login').send({ email: u.email, password: 'Brand-new-passw0rd!' }).expect(200);
    });
  });
});
