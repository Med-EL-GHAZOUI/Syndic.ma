import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { JobsService, moroccoDate } from '../../src/notifications/jobs.service';
import { bearer, buildWorld, createApp, http, World } from './helpers';

interface N { id: string; type: string; params: Record<string, string | number>; link: string | null; readAt: string | null }
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

describe('Notifications & background jobs', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  const as = (key: string) => bearer(w.tokens[key]);
  const mine = async (key: string): Promise<N[]> => (await http(app).get('/api/notifications').set(as(key)).expect(200)).body;
  const types = async (key: string) => (await mine(key)).map((n) => n.type);
  const unread = async (key: string) => (await http(app).get('/api/notifications/unread-count').set(as(key)).expect(200)).body.count as number;

  beforeAll(async () => {
    app = await createApp();
    ds = app.get(DataSource);
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  describe('delivery', () => {
    let assemblyId: string;

    it('convening an assembly notifies the residence owners only, in their own organization', async () => {
      assemblyId = (await http(app).post('/api/assemblies').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, title: 'AG notif', type: 'ordinary', date: iso(10), time: '18:00', location: 'Salle', agenda: ['Comptes'] }).expect(201)).body.id;
      expect(await types('a.owner')).not.toContain('assemblyConvened'); // a draft says nothing yet
      await http(app).post(`/api/assemblies/${assemblyId}/convene`).set(as('a.syndic_admin')).expect(200);

      const n = (await mine('a.owner')).find((x) => x.type === 'assemblyConvened')!;
      expect(n).toMatchObject({ params: { title: 'AG notif' }, link: '/assemblies', readAt: null });
      for (const other of ['a.tenant', 'a.manager', 'a.accountant', 'b.owner', 'b.syndic_admin']) expect(await types(other)).not.toContain('assemblyConvened');
    });

    it('complaints: staff hear about new ones (not the author), the author hears about updates and replies', async () => {
      const c = (await http(app).post('/api/complaints').set(as('a.owner')).send({ unitId: w.a.unitIds[0], title: 'Ascenseur bloqué', category: 'elevator', priority: 'high', description: 'Bloqué au 3e' }).expect(201)).body;
      expect(await types('a.syndic_admin')).toContain('complaintNew');
      expect(await types('a.manager')).toContain('complaintNew');
      expect(await types('a.owner')).not.toContain('complaintNew');
      expect(await types('b.syndic_admin')).not.toContain('complaintNew'); // other organization

      await http(app).patch(`/api/complaints/${c.id}/status`).set(as('a.syndic_admin')).send({ status: 'in_progress' }).expect(200);
      expect(await types('a.owner')).toContain('complaintUpdated');

      await http(app).post(`/api/complaints/${c.id}/comments`).set(as('a.syndic_admin')).send({ text: 'Technicien en route' }).expect(201);
      expect(await types('a.owner')).toContain('complaintReply');
      const before = (await types('a.syndic_admin')).filter((t) => t === 'complaintReply').length;
      await http(app).post(`/api/complaints/${c.id}/comments`).set(as('a.owner')).send({ text: 'Merci' }).expect(201);
      expect((await types('a.syndic_admin')).filter((t) => t === 'complaintReply').length).toBe(before + 1);
      expect((await types('a.owner')).filter((t) => t === 'complaintReply')).toHaveLength(1); // not notified of their own comment
    });

    it('announcements respect their audience', async () => {
      const post = (audience: string, title: string) => http(app).post('/api/announcements').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, title, body: 'Contenu', category: 'info', audience }).expect(201);
      const titlesOf = async (key: string) => (await mine(key)).filter((n) => n.type === 'announcement').map((n) => n.params.title);

      await post('owners', 'Pour propriétaires');
      await post('staff', 'Pour équipe');
      await post('all', 'Pour tous');
      expect(await titlesOf('a.owner')).toEqual(expect.arrayContaining(['Pour propriétaires', 'Pour tous']));
      expect(await titlesOf('a.owner')).not.toContain('Pour équipe');
      expect(await titlesOf('a.tenant')).toEqual(['Pour tous']);
      expect(await titlesOf('a.manager')).toContain('Pour équipe');
      expect(await titlesOf('a.accountant')).not.toContain('Pour propriétaires');
      expect(await titlesOf('b.owner')).toEqual([]);
    });

    it('a work order notifies its provider (only that company) and, once done, the managers', async () => {
      const o = (await http(app).post('/api/maintenance').set(as('a.manager')).send({ residenceId: w.a.residenceId, title: 'Pompe HS', type: 'corrective', providerId: w.a.providerId, scheduledDate: iso(1) }).expect(201)).body;
      expect(await types('a.provider')).toContain('maintenanceAssigned');
      expect(await types('b.provider')).not.toContain('maintenanceAssigned');
      await http(app).post(`/api/maintenance/${o.id}/start`).set(as('a.provider')).expect(200);
      await http(app).post(`/api/maintenance/${o.id}/complete`).set(as('a.provider')).send({ actualCost: 100 }).expect(200);
      expect(await types('a.syndic_admin')).toContain('maintenanceDone');
    });
  });

  describe('reading', () => {
    it('everybody sees only their own notifications; someone else\'s id is a 404', async () => {
      const ownerNotif = (await mine('a.owner'))[0];
      await http(app).post(`/api/notifications/${ownerNotif.id}/read`).set(as('a.tenant')).expect(404);
      await http(app).post(`/api/notifications/${ownerNotif.id}/read`).set(as('b.owner')).expect(404);
      await http(app).post(`/api/notifications/${randomUUID()}/read`).set(as('a.owner')).expect(404);
      await http(app).post('/api/notifications/not-a-uuid/read').set(as('a.owner')).expect(400);
      expect((await mine('b.owner')).map((n) => n.id)).not.toContain(ownerNotif.id);
      await http(app).get('/api/notifications').expect(401);
    });

    it('mark one / mark all read, and the unread filter', async () => {
      const total = await unread('a.owner');
      expect(total).toBeGreaterThan(1);
      const first = (await mine('a.owner'))[0];
      await http(app).post(`/api/notifications/${first.id}/read`).set(as('a.owner')).expect(200);
      await http(app).post(`/api/notifications/${first.id}/read`).set(as('a.owner')).expect(200); // idempotent
      expect(await unread('a.owner')).toBe(total - 1);
      const filtered = (await http(app).get('/api/notifications?unread=true').set(as('a.owner')).expect(200)).body as N[];
      expect(filtered).toHaveLength(total - 1);
      expect(filtered.every((n) => n.readAt === null)).toBe(true);

      expect((await http(app).post('/api/notifications/read-all').set(as('a.owner')).expect(200)).body.updated).toBe(total - 1);
      expect(await unread('a.owner')).toBe(0);
      expect(await unread('a.tenant')).toBeGreaterThan(0); // somebody else's notifications are untouched
    });

    it('the platform super admin (no organization) has an empty, harmless inbox', async () => {
      expect(await mine('super')).toEqual([]);
      expect(await unread('super')).toBe(0);
      await http(app).post('/api/notifications/read-all').set(as('super')).expect(200);
    });
  });

  describe('background jobs', () => {
    let jobs: JobsService;
    beforeAll(() => { jobs = app.get(JobsService); });
    const count = (key: string, type: string) => mine(key).then((l) => l.filter((n) => n.type === type).length);

    it('send the overdue digest to finance staff once per residence and day, however often they run', async () => {
      const first = await jobs.runOnce();
      expect(first.skipped).toBe(false);
      expect(first.results.filter((r) => !r.ok)).toEqual([]);
      const digest = (await mine('a.accountant')).find((n) => n.type === 'overdueDigest')!;
      expect(digest.params.count).toBeGreaterThan(0);
      expect(digest.params.amount).toBeGreaterThan(0);
      expect(digest.link).toBe('/finance');
      expect(await count('a.syndic_admin', 'overdueDigest')).toBe(1);
      expect(await types('a.owner')).not.toContain('overdueDigest'); // residents never get the staff digest
      expect(await types('a.manager')).not.toContain('overdueDigest');

      await jobs.runOnce();
      await jobs.runOnce();
      expect(await count('a.accountant', 'overdueDigest')).toBe(1);
      expect(await count('a.syndic_admin', 'overdueDigest')).toBe(1);
    });

    it('remind owners of an assembly due within 3 days — once — and ignore a far-away one', async () => {
      const make = async (title: string, date: string) => {
        const id = (await http(app).post('/api/assemblies').set(as('a.syndic_admin')).send({ residenceId: w.a.residenceId, title, type: 'ordinary', date, time: '18:00', location: 'Salle', agenda: [] }).expect(201)).body.id;
        await http(app).post(`/api/assemblies/${id}/convene`).set(as('a.syndic_admin')).expect(200);
      };
      await make('AG imminente', iso(2));
      await make('AG lointaine', iso(30));
      await jobs.runOnce();
      await jobs.runOnce();
      const reminders = (await mine('a.owner')).filter((n) => n.type === 'assemblyReminder');
      expect(reminders.map((n) => n.params.title)).toEqual(['AG imminente']);
      expect(await count('a.tenant', 'assemblyReminder')).toBe(0);
      expect(await count('b.owner', 'assemblyReminder')).toBe(0);
    });

    it('purge what is expired and keep what is not', async () => {
      const userId = w.a.users.owner.id;
      const run = randomUUID().slice(0, 8); // unique per run: the test database is shared and never reset
      const h = (name: string) => `${name}-${run}`;
      const old = '2020-01-01T00:00:00Z';
      await ds.query(`INSERT INTO refresh_tokens (user_id, token_hash, family, expires_at) VALUES ($1,$4,$2,$3), ($1,$5,$2, now() + interval '1 day'), ($1,$6,$2, now() - interval '1 hour')`, [userId, randomUUID(), old, h('old'), h('fresh'), h('just-expired')]);
      await ds.query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2,$3), ($1,$4, now() + interval '10 minutes')`, [userId, h('old-reset'), old, h('fresh-reset')]);
      const t = (name: string) => `x_${run}_${name}`;
      await ds.query(`INSERT INTO notifications (org_id, user_id, type, read_at, created_at) VALUES ($1,$2,$3, now(), now() - interval '100 days'), ($1,$2,$4, NULL, now() - interval '100 days'), ($1,$2,$5, NULL, now() - interval '400 days')`, [w.a.orgId, userId, t('old_read'), t('old_unread'), t('ancient_unread')]);

      const report = await jobs.runOnce();
      expect(report.results.find((r) => r.name === 'purgeExpiredTokens')).toMatchObject({ ok: true, affected: expect.any(Number) });

      const tokens = (await ds.query(`SELECT token_hash FROM refresh_tokens WHERE token_hash LIKE $1`, [`%-${run}`])).map((r: { token_hash: string }) => r.token_hash).sort();
      expect(tokens).toEqual([h('fresh'), h('just-expired')]); // expired for over 7 days: gone; just expired: kept (replay detection)
      const resets = (await ds.query(`SELECT token_hash FROM password_resets WHERE token_hash LIKE $1`, [`%-${run}`])).map((r: { token_hash: string }) => r.token_hash);
      expect(resets).toEqual([h('fresh-reset')]);
      const left = (await ds.query(`SELECT type FROM notifications WHERE type LIKE $1`, [`x\_${run}\_%`])).map((r: { type: string }) => r.type);
      expect(left).toEqual([t('old_unread')]); // read > 90 days and anything > 1 year are purged

      await ds.query(`DELETE FROM refresh_tokens WHERE token_hash LIKE $1`, [`%-${run}`]); // leave the shared DB as found
      await ds.query(`DELETE FROM password_resets WHERE token_hash LIKE $1`, [`%-${run}`]);
      await ds.query(`DELETE FROM notifications WHERE type LIKE $1`, [`x\_${run}\_%`]);
    });

    it('never run twice at once: a second instance skips while the lock is held', async () => {
      const holder = ds.createQueryRunner();
      await holder.connect();
      try {
        await holder.query('SELECT pg_advisory_lock($1)', [7_340_001]);
        expect(await jobs.runOnce()).toEqual({ skipped: true, results: [] });
      } finally {
        await holder.query('SELECT pg_advisory_unlock($1)', [7_340_001]);
        await holder.release();
      }
      expect((await jobs.runOnce()).skipped).toBe(false); // and it works again once the lock is free
    });

    it('uses the Moroccan calendar date', () => {
      expect(moroccoDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01'); // already tomorrow in Morocco (UTC+1)
      expect(moroccoDate(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06-15');
    });
  });

  it('a notification failing to store never fails the business action', async () => {
    const svc = app.get(require('../../src/notifications/notifications.service').NotificationsService);
    // unknown organization id violates nothing in the DB, so force a failure with an invalid type payload
    await expect(svc.notify('not-a-uuid', [randomUUID()], { type: 'x' })).resolves.toBeUndefined();
  });
});
