import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { base32Decode, hotp, stepAt } from '../../src/auth/totp';
import { bearer, buildWorld, createApp, http, PASSWORD, World } from './helpers';

/** Code an authenticator app would show `offset` steps from now (offset +1 is accepted: clock drift window). */
const codeFor = (secret: string, offset = 0) => hotp(base32Decode(secret), stepAt(Date.now()) + offset);

describe('Two-factor authentication (TOTP)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  const as = (key: string) => bearer(w.tokens[key]);
  const email = () => w.a.users.accountant.email;
  const userId = () => w.a.users.accountant.id;

  let secret: string;
  let backupCodes: string[];

  beforeAll(async () => {
    app = await createApp();
    ds = app.get(DataSource);
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  const login = () => http(app).post('/api/auth/login').send({ email: email(), password: PASSWORD });
  const verify = (mfaToken: string, code: string) => http(app).post('/api/auth/mfa/verify').send({ mfaToken, code });
  const challenge = async () => (await login().expect(200)).body.mfaToken as string;
  /** The window only reaches one step ahead: reset the replay guard so a test can log in again within the same step. */
  const forgetLastStep = () => ds.query('UPDATE users SET mfa_last_step = NULL, mfa_failures = 0, mfa_locked_until = NULL WHERE id = $1', [userId()]);

  describe('enrolment', () => {
    it('is off by default and nobody else can switch it on for you', async () => {
      expect((await http(app).get('/api/auth/mfa/status').set(as('a.accountant')).expect(200)).body).toEqual({ enabled: false, backupCodesLeft: 0 });
      await http(app).get('/api/auth/mfa/status').expect(401);
      await http(app).post('/api/auth/mfa/setup').expect(401);
    });

    it('setup returns the secret once, as an otpauth URL, and stores it encrypted', async () => {
      const res = (await http(app).post('/api/auth/mfa/setup').set(as('a.accountant')).expect(200)).body;
      secret = res.secret;
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(res.otpauthUrl).toContain(`secret=${secret}`);
      expect(res.otpauthUrl).toContain('issuer=Syndic.ma');
      const [row] = await ds.query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [userId()]);
      expect(row.mfa_enabled).toBe(false); // not active until a code proves the app works
      expect(row.mfa_secret).toMatch(/^v1\./);
      expect(row.mfa_secret).not.toContain(secret);
      await login().expect(200).expect((r) => expect(r.body.accessToken).toBeDefined()); // still a one-step login
    });

    it('enabling needs a valid code, then returns ten recovery codes exactly once', async () => {
      await http(app).post('/api/auth/mfa/enable').set(as('a.accountant')).send({ code: '000000' }).expect(400);
      await http(app).post('/api/auth/mfa/enable').set(as('a.accountant')).send({ code: 'abcdef' }).expect(400);
      const res = (await http(app).post('/api/auth/mfa/enable').set(as('a.accountant')).send({ code: codeFor(secret) }).expect(200)).body;
      backupCodes = res.backupCodes;
      expect(backupCodes).toHaveLength(10);
      expect(new Set(backupCodes).size).toBe(10);
      for (const c of backupCodes) expect(c).toMatch(/^[0-9a-f]{6}-[0-9a-f]{6}$/);
      expect((await http(app).get('/api/auth/mfa/status').set(as('a.accountant')).expect(200)).body).toEqual({ enabled: true, backupCodesLeft: 10 });
      await http(app).post('/api/auth/mfa/setup').set(as('a.accountant')).expect(409); // cannot silently replace an active secret
      await http(app).post('/api/auth/mfa/enable').set(as('a.accountant')).send({ code: codeFor(secret, 1) }).expect(409);
      const [row] = await ds.query('SELECT mfa_backup_codes FROM users WHERE id = $1', [userId()]);
      expect(JSON.stringify(row.mfa_backup_codes)).not.toContain(backupCodes[0].slice(0, 6)); // only hashes are stored
    });

    it('no endpoint ever returns the secret, its ciphertext or the recovery hashes', async () => {
      const list = JSON.stringify((await http(app).get('/api/users').set(as('a.syndic_admin')).expect(200)).body);
      for (const leak of ['mfaSecret', 'mfa_secret', 'mfaBackupCodes', 'passwordHash', secret]) expect(list).not.toContain(leak);
      expect(JSON.stringify((await http(app).get('/api/auth/me').set(as('a.accountant')).expect(200)).body)).not.toContain(secret);
    });
  });

  describe('login with a second factor', () => {
    it('the password alone yields a challenge, not a session', async () => {
      const res = await login().expect(200);
      expect(res.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
      expect(res.headers['set-cookie']).toBeUndefined();
      // a challenge is not an access token
      await http(app).get('/api/auth/me').set(bearer(res.body.mfaToken)).expect(401);
      await http(app).get('/api/finance/summary').set(bearer(res.body.mfaToken)).expect(401);
    });

    it('a wrong password still gets the generic error, never a challenge', async () => {
      await http(app).post('/api/auth/login').send({ email: email(), password: 'wrong-password-1' }).expect(401);
    });

    it('an access token is not a valid challenge, and garbage is refused', async () => {
      await verify(w.tokens['a.accountant'], codeFor(secret, 1)).expect(401);
      await verify('x'.repeat(40), codeFor(secret, 1)).expect(401);
    });

    it('a wrong code fails, the right one opens the session', async () => {
      const t = await challenge();
      await verify(t, '000000').expect(401);
      // the code used to enable is spent (replay protection), so the next step's code is used here
      const res = await verify(t, codeFor(secret, 1)).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect((res.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('syndicma_rt=') && c.includes('HttpOnly'))).toBe(true);
      await http(app).get('/api/auth/me').set(bearer(res.body.accessToken)).expect(200);
    });

    it('a code can never be used twice', async () => {
      const code = codeFor(secret, 1); // already consumed by the previous test
      await verify(await challenge(), code).expect(401);
    });

    it('recovery codes work once each, whatever the case or dashes', async () => {
      const [first, second] = backupCodes;
      await verify(await challenge(), first.toUpperCase()).expect(200);
      await verify(await challenge(), first).expect(401); // already used
      await verify(await challenge(), second.replace('-', ' ')).expect(200);
      expect((await http(app).get('/api/auth/mfa/status').set(as('a.accountant')).expect(200)).body.backupCodesLeft).toBe(8);
      await verify(await challenge(), 'ffffff-ffffff').expect(401);
    });

    it('five wrong codes lock the second step for a while, even for the right code', async () => {
      await forgetLastStep();
      const t = await challenge();
      for (let i = 0; i < 5; i++) await verify(t, '111111').expect(401);
      await verify(t, codeFor(secret)).expect(429);
      await verify(await challenge(), codeFor(secret)).expect(429); // a fresh challenge does not help
      const [row] = await ds.query('SELECT mfa_locked_until FROM users WHERE id = $1', [userId()]);
      expect(new Date(row.mfa_locked_until).getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);
      await forgetLastStep(); // the lock expires
      await verify(await challenge(), codeFor(secret)).expect(200);
    });

    it('a disabled account or a suspended organization cannot finish the login', async () => {
      await forgetLastStep();
      const t = await challenge();
      await ds.query('UPDATE users SET active = false WHERE id = $1', [userId()]);
      await verify(t, codeFor(secret)).expect(401);
      await ds.query('UPDATE users SET active = true WHERE id = $1', [userId()]);
      await ds.query("UPDATE organizations SET status = 'suspended' WHERE id = $1", [w.a.orgId]);
      await verify(t, codeFor(secret)).expect(401);
      await ds.query("UPDATE organizations SET status = 'active' WHERE id = $1", [w.a.orgId]);
    });

    it('an expired challenge is refused', async () => {
      await forgetLastStep();
      const stale = (await app.get(require('../../src/auth/mfa.service').MfaService).challengeFor({ id: userId() })) as string;
      // forge an old one with the same key: sign with exp in the past through the service's own JwtService
      const jwt = app.get(require('@nestjs/jwt').JwtService);
      const secretKey = require('crypto').createHash('sha256').update(`syndicma-mfa-challenge:${process.env.JWT_ACCESS_SECRET}`).digest('hex');
      const expired = jwt.sign({ sub: userId(), purpose: 'mfa', exp: Math.floor(Date.now() / 1000) - 10 }, { secret: secretKey, algorithm: 'HS256' });
      expect(stale).toBeDefined();
      await verify(expired, codeFor(secret)).expect(401);
      // same key and fresh expiry but the wrong purpose (an access-style token) is refused too
      const wrongPurpose = jwt.sign({ sub: userId(), purpose: 'access' }, { secret: secretKey, algorithm: 'HS256', expiresIn: 60 });
      await verify(wrongPurpose, codeFor(secret)).expect(401);
    });
  });

  describe('administration', () => {
    it('an administrator of the organization can reset a colleague\'s second factor (and their sessions); nobody else can', async () => {
      await http(app).post(`/api/users/${userId()}/mfa-reset`).set(as('a.manager')).expect(403);
      await http(app).post(`/api/users/${userId()}/mfa-reset`).set(as('b.syndic_admin')).expect(404); // other organization
      await http(app).post(`/api/users/${w.a.users.syndic_admin.id}/mfa-reset`).set(as('a.syndic_admin')).expect(403); // not for yourself

      await forgetLastStep();
      const session = (await verify(await challenge(), codeFor(secret)).expect(200)).body.accessToken as string;
      const refresh = ((await verify(await challenge(), backupCodes[2]).expect(200)).headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('syndicma_rt='))!.split(';')[0];

      await http(app).post(`/api/users/${userId()}/mfa-reset`).set(as('a.syndic_admin')).expect(204);
      const [row] = await ds.query('SELECT mfa_enabled, mfa_secret, mfa_backup_codes FROM users WHERE id = $1', [userId()]);
      expect(row).toEqual({ mfa_enabled: false, mfa_secret: null, mfa_backup_codes: [] });
      await http(app).post('/api/auth/refresh').set('X-Requested-With', 'syndicma').set('Cookie', refresh).expect(401); // sessions revoked
      expect(session).toBeDefined();
      expect((await login().expect(200)).body.accessToken).toBeDefined(); // back to a single step
      const audit = (await http(app).get('/api/audit?limit=50').set(as('a.syndic_admin')).expect(200)).body as { action: string }[];
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['mfa_enable', 'mfa_reset', 'mfa_backup_used']));
    });

    it('a user can switch it off themselves only with the password AND a valid code', async () => {
      const t0 = (await http(app).post('/api/auth/mfa/setup').set(as('a.accountant')).expect(200)).body.secret as string;
      await http(app).post('/api/auth/mfa/enable').set(as('a.accountant')).send({ code: codeFor(t0) }).expect(200);
      await http(app).post('/api/auth/mfa/disable').set(as('a.accountant')).send({ password: 'wrong-password-1', code: codeFor(t0, 1) }).expect(403);
      await http(app).post('/api/auth/mfa/disable').set(as('a.accountant')).send({ password: PASSWORD, code: '000000' }).expect(403);
      await http(app).post('/api/auth/mfa/disable').set(as('a.accountant')).send({ password: PASSWORD, code: codeFor(t0, 1) }).expect(204);
      expect((await http(app).get('/api/auth/mfa/status').set(as('a.accountant')).expect(200)).body.enabled).toBe(false);
      await http(app).post('/api/auth/mfa/disable').set(as('a.accountant')).send({ password: PASSWORD, code: codeFor(t0, 1) }).expect(409);
      expect((await login().expect(200)).body.accessToken).toBeDefined();
    });
  });
});
