import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { MailService } from '../../src/mail/mail.service';
import { buildWorld, createApp, http, loginAs, PASSWORD, refreshWith, World } from './helpers';

describe('Password reset by e-mail', () => {
  let app: INestApplication;
  let ds: DataSource;
  let mail: MailService;
  let w: World;
  const NEW = 'Brand-new-Passw0rd-!1';

  beforeAll(async () => {
    app = await createApp();
    ds = app.get(DataSource);
    mail = app.get(MailService);
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  const forgot = (email: string) => http(app).post('/api/auth/forgot-password').send({ email });
  const settle = () => new Promise((r) => setTimeout(r, 150)); // mail is sent in the background
  const lastMailTo = (email: string) => [...mail.outbox].reverse().find((m) => m.to === email);
  const tokenOf = (m: { text: string }) => /reset-password#token=([A-Za-z0-9_-]+)/.exec(m.text)![1];

  it('answers identically for existing and unknown addresses (no user enumeration)', async () => {
    const known = await forgot(w.a.users.owner.email);
    const unknown = await forgot('nobody.at.all@example.com');
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toMatch(/token|owner/i);
    await settle();
    expect(lastMailTo('nobody.at.all@example.com')).toBeUndefined();
    expect(lastMailTo(w.a.users.owner.email)).toBeDefined();
  });

  it('validates the e-mail format and rejects unknown properties', async () => {
    await forgot('not-an-email').expect(400);
    await http(app).post('/api/auth/forgot-password').send({ email: w.a.users.owner.email, extra: 1 }).expect(400);
  });

  it('the e-mail carries a one-time link in the URL FRAGMENT; only a hash is stored', async () => {
    await forgot(w.a.users.tenant.email).expect(202);
    await settle();
    const m = lastMailTo(w.a.users.tenant.email)!;
    expect(m.subject).toMatch(/Syndic\.ma/);
    expect(m.text).toContain('https://app.example.test/reset-password#token=');
    expect(m.text).not.toMatch(/\?token=/); // never in the query string (server logs / Referer)
    const token = tokenOf(m);
    const rows = await ds.query('SELECT token_hash FROM password_resets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [w.a.users.tenant.id]);
    expect(rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(rows[0].token_hash).not.toContain(token);
  });

  it('resets the password, is single-use, revokes every session and the old password dies', async () => {
    const u = w.a.users.manager;
    const session = await loginAs(app, u.email);
    await forgot(u.email).expect(202);
    await settle();
    const token = tokenOf(lastMailTo(u.email)!);

    await http(app).post('/api/auth/reset-password').send({ token, newPassword: NEW }).expect(204);
    await http(app).post('/api/auth/reset-password').send({ token, newPassword: 'Another-Passw0rd-22!' }).expect(400); // single use
    await refreshWith(app, session.cookie).expect(401); // previous session revoked
    await http(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD }).expect(401);
    await http(app).post('/api/auth/login').send({ email: u.email, password: NEW }).expect(200);
  });

  it('rejects unknown, malformed, weak and expired tokens with one generic error', async () => {
    const generic = (res: { body: { message: string } }) => expect(res.body.message).toBe('Invalid or expired reset link');
    generic(await http(app).post('/api/auth/reset-password').send({ token: 'x'.repeat(43), newPassword: NEW }).expect(400));
    await http(app).post('/api/auth/reset-password').send({ token: 'short', newPassword: NEW }).expect(400);

    await forgot(w.a.users.provider.email).expect(202);
    await settle();
    const token = tokenOf(lastMailTo(w.a.users.provider.email)!);
    await http(app).post('/api/auth/reset-password').send({ token, newPassword: 'short' }).expect(400); // weak password does not burn the token
    await ds.query("UPDATE password_resets SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [w.a.users.provider.id]);
    generic(await http(app).post('/api/auth/reset-password').send({ token, newPassword: NEW }).expect(400));
    await http(app).post('/api/auth/login').send({ email: w.a.users.provider.email, password: PASSWORD }).expect(200); // password unchanged
  });

  it('a new request invalidates the previous link', async () => {
    const email = w.a.users.accountant.email;
    await forgot(email).expect(202);
    await settle();
    const first = tokenOf(lastMailTo(email)!);
    await forgot(email).expect(202);
    await settle();
    const second = tokenOf(lastMailTo(email)!);
    expect(second).not.toBe(first);
    await http(app).post('/api/auth/reset-password').send({ token: first, newPassword: NEW }).expect(400);
    await http(app).post('/api/auth/reset-password').send({ token: second, newPassword: NEW }).expect(204);
  });

  it('only one of two concurrent uses of the same link wins', async () => {
    const email = w.a.users.syndic_admin.email;
    await forgot(email).expect(202);
    await settle();
    const token = tokenOf(lastMailTo(email)!);
    const res = await Promise.all([
      http(app).post('/api/auth/reset-password').send({ token, newPassword: NEW }),
      http(app).post('/api/auth/reset-password').send({ token, newPassword: 'Different-Passw0rd-9!' }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('caps reset e-mails per account (3 per hour) and sends nothing for disabled users or suspended organizations', async () => {
    const email = w.a.users.manager2.email;
    for (let i = 0; i < 6; i++) await forgot(email).expect(202);
    await settle();
    expect(mail.outbox.filter((m) => m.to === email)).toHaveLength(3);

    await ds.query('UPDATE users SET active = false WHERE id = $1', [w.a.users.owner.id]);
    const before = mail.outbox.length;
    await forgot(w.a.users.owner.email).expect(202);
    await ds.query("UPDATE organizations SET status = 'suspended' WHERE id = $1", [w.b.orgId]);
    await forgot(w.b.users.owner.email).expect(202);
    await settle();
    expect(mail.outbox.length).toBe(before);
  });

  it('a failing mail server never changes the response nor leaks', async () => {
    const original = mail.send.bind(mail);
    mail.send = async () => { throw new Error('SMTP down'); };
    try {
      const res = await forgot(w.a.users.tenant.email).expect(202);
      expect(JSON.stringify(res.body)).not.toMatch(/SMTP/);
    } finally {
      mail.send = original;
    }
  });

  it('is recorded in the audit trail', async () => {
    const rows = (await http(app).get('/api/audit?limit=200').set({ Authorization: `Bearer ${w.tokens['a.syndic_admin']}` }).expect(200)).body as { action: string }[];
    expect(rows.some((r) => r.action === 'request_reset')).toBe(true);
  });
});
