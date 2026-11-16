import { INestApplication } from '@nestjs/common';
import { bearer, buildWorld, cookieFrom, createApp, http, loginAs, PASSWORD, refreshWith, World } from './helpers';

describe('Authentication & sessions', () => {
  let app: INestApplication;
  let w: World;

  beforeAll(async () => {
    app = await createApp();
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  it('serves a public health check', async () => {
    await http(app).get('/api/health').expect(200, { status: 'ok' });
  });

  it('rejects unauthenticated access to protected routes', async () => {
    for (const path of ['/api/residences', '/api/units', '/api/calls', '/api/payments', '/api/users', '/api/audit', '/api/auth/me']) {
      await http(app).get(path).expect(401);
    }
  });

  it('rejects garbage / tampered tokens', async () => {
    await http(app).get('/api/auth/me').set(bearer('not.a.jwt')).expect(401);
    const t = w.tokens['a.owner'];
    const tampered = t.slice(0, -4) + (t.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    await http(app).get('/api/auth/me').set(bearer(tampered)).expect(401);
  });

  it('logs in and returns the current identity (no password hash leaked)', async () => {
    const res = await http(app).get('/api/auth/me').set(bearer(w.tokens['a.accountant'])).expect(200);
    expect(res.body.role).toBe('accountant');
    expect(res.body.orgId).toBe(w.a.orgId);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('gives the same error for unknown user and wrong password', async () => {
    const unknown = await http(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever-1234' });
    const wrong = await http(app).post('/api/auth/login').send({ email: w.a.users.owner.email, password: 'wrong-password-1' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('validates input and rejects unknown properties (mass assignment)', async () => {
    await http(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
    await http(app).post('/api/auth/login').send({ email: w.a.users.owner.email, password: PASSWORD, role: 'super_admin' }).expect(400);
  });

  it('the refresh token is only ever an HttpOnly, SameSite=Strict cookie scoped to /api/auth — never in a body', async () => {
    const res = await http(app).post('/api/auth/login').send({ email: w.a.users.owner.email, password: PASSWORD }).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresIn']);
    expect(JSON.stringify(res.body)).not.toMatch(/refresh/i);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('syndicma_rt='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
    expect(cookie).toMatch(/Max-Age=\d+/i);
  });

  it('a refresh token sent in a request body is ignored (cookie only)', async () => {
    await http(app).post('/api/auth/refresh').set('X-Requested-With', 'syndicma').send({ refreshToken: 'x'.repeat(64) }).expect(401);
  });

  it('rotates refresh tokens: each works once and reuse revokes the whole family', async () => {
    const first = await loginAs(app, w.a.users.owner.email);
    const res2 = await refreshWith(app, first.cookie).expect(200);
    const cookie2 = cookieFrom(res2);
    expect(cookie2).not.toBe(first.cookie);
    expect(res2.body.accessToken).toBeTruthy();
    expect(res2.body.refreshToken).toBeUndefined();

    // Replaying the first token = theft signal -> 401, cookie cleared, and the family (incl. cookie2) is revoked.
    const replay = await refreshWith(app, first.cookie).expect(401);
    expect((replay.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/syndicma_rt=;/);
    await refreshWith(app, cookie2).expect(401);
  });

  it('only one of two concurrent refreshes with the same cookie wins', async () => {
    const s = await loginAs(app, w.a.users.tenant.email);
    const results = await Promise.all([refreshWith(app, s.cookie), refreshWith(app, s.cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('CSRF: refresh and logout need the custom header even when the cookie is valid', async () => {
    const s = await loginAs(app, w.a.users.manager.email);
    await http(app).post('/api/auth/refresh').set('Cookie', s.cookie).expect(403);
    await http(app).post('/api/auth/refresh').set('Cookie', s.cookie).set('X-Requested-With', 'something-else').expect(403);
    await http(app).post('/api/auth/logout').set('Cookie', s.cookie).expect(403);
    await refreshWith(app, s.cookie).expect(200); // the session itself was not harmed by the blocked attempts
  });

  it('refresh without a cookie is rejected', async () => {
    await http(app).post('/api/auth/refresh').set('X-Requested-With', 'syndicma').expect(401);
  });

  it('logout revokes the session on the server and clears the cookie', async () => {
    const s = await loginAs(app, w.a.users.manager.email);
    const res = await http(app).post('/api/auth/logout').set('X-Requested-With', 'syndicma').set('Cookie', s.cookie).expect(204);
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/syndicma_rt=;/);
    await refreshWith(app, s.cookie).expect(401);
  });

  it('does not accept an unknown or malformed refresh cookie', async () => {
    await refreshWith(app, 'syndicma_rt=' + 'x'.repeat(64)).expect(401);
    await refreshWith(app, 'syndicma_rt=%E0%A4%A').expect(401); // malformed percent-encoding must not crash
  });

  it('disabling a user takes effect immediately, even for an unexpired access token', async () => {
    const victim = w.a.users.provider;
    const token = (await loginAs(app, victim.email)).accessToken;
    await http(app).get('/api/auth/me').set(bearer(token)).expect(200);
    await http(app).patch(`/api/users/${victim.id}`).set(bearer(w.tokens['a.syndic_admin'])).send({ active: false }).expect(200);
    await http(app).get('/api/auth/me').set(bearer(token)).expect(401);
    await http(app).post('/api/auth/login').send({ email: victim.email, password: PASSWORD }).expect(401);
  });

  it('an admin cannot disable or demote themselves', async () => {
    const me = w.a.users.syndic_admin;
    await http(app).patch(`/api/users/${me.id}`).set(bearer(w.tokens['a.syndic_admin'])).send({ active: false }).expect(403);
    await http(app).patch(`/api/users/${me.id}`).set(bearer(w.tokens['a.syndic_admin'])).send({ role: 'tenant' }).expect(403);
  });

  it('cannot create super_admins or weak-password users through the API', async () => {
    const admin = bearer(w.tokens['a.syndic_admin']);
    await http(app).post('/api/users').set(admin).send({ name: 'Evil', email: 'evil@example.com', password: 'Long-enough-pass-1', role: 'super_admin' }).expect(400);
    await http(app).post('/api/users').set(admin).send({ name: 'Weak', email: 'weak@example.com', password: 'short', role: 'manager' }).expect(400);
    const ok = await http(app).post('/api/users').set(admin).send({ name: 'New Manager', email: `nm.${w.a.orgId.slice(0, 6)}@example.com`, password: 'Long-enough-pass-1', role: 'manager' }).expect(201);
    expect(ok.body.passwordHash).toBeUndefined();
  });

  it('suspending an organization locks out its users at once', async () => {
    const token = w.tokens['b.accountant'];
    await http(app).get('/api/auth/me').set(bearer(token)).expect(200);
    await http(app).put(`/api/platform/organizations/${w.b.orgId}`).set(bearer(w.tokens.super)).send({ name: 'Suspended Org', plan: 'pro', status: 'suspended' }).expect(200);
    await http(app).get('/api/auth/me').set(bearer(token)).expect(401);
    await http(app).post('/api/auth/login').send({ email: w.b.users.accountant.email, password: PASSWORD }).expect(401);
  });

  it('keeps org users out of the platform API and platform admins out of org data', async () => {
    await http(app).get('/api/platform/organizations').set(bearer(w.tokens['a.syndic_admin'])).expect(403);
    await http(app).get('/api/residences').set(bearer(w.tokens.super)).expect(403);
    await http(app).get('/api/platform/organizations').set(bearer(w.tokens.super)).expect(200);
  });
});
