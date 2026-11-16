import { INestApplication } from '@nestjs/common';
import { bearer, buildWorld, createApp, http, loginAs, PASSWORD, refreshWith, World } from './helpers';

describe('Metrics endpoint', () => {
  let app: INestApplication;
  let w: World;
  const TOKEN = 'e2e-metrics-token-0123456789';
  const scrape = () => http(app).get('/api/metrics').set('Authorization', `Bearer ${TOKEN}`);

  beforeAll(async () => {
    app = await createApp();
    w = await buildWorld(app);
  });
  afterAll(() => app.close());

  it('requires the scrape token (and is not reachable with a user JWT)', async () => {
    await http(app).get('/api/metrics').expect(401);
    await http(app).get('/api/metrics').set('Authorization', 'Bearer wrong-token').expect(401);
    await http(app).get('/api/metrics').set(bearer(w.tokens['a.syndic_admin'])).expect(401);
    await http(app).get('/api/metrics').set(bearer(w.tokens.super)).expect(401);
    await scrape().expect(200);
  });

  it('exposes request counts and latency histograms labelled by ROUTE TEMPLATE, never by concrete URL', async () => {
    await http(app).get(`/api/residences/${w.a.residenceId}`).set(bearer(w.tokens['a.syndic_admin'])).expect(200);
    await http(app).get(`/api/units/${w.a.unitIds[0]}`).set(bearer(w.tokens['a.owner'])).expect(403);
    const body = (await scrape().expect(200)).text;
    expect(body).toContain('# TYPE syndicma_http_requests_total counter');
    expect(body).toMatch(/syndicma_http_requests_total\{method="GET",route="\/api\/residences\/:id",status="2xx"\} \d+/);
    // 403 comes from a GUARD (before any interceptor): it must still be counted
    expect(body).toMatch(/syndicma_http_requests_total\{method="GET",route="\/api\/units\/:id",status="4xx"\} \d+/);
    expect(body).toContain('# TYPE syndicma_http_request_duration_seconds histogram');
    expect(body).toMatch(/syndicma_http_request_duration_seconds_bucket\{method="GET",route="\/api\/residences\/:id",le="\+Inf"\} \d+/);
    expect(body).toContain('syndicma_process_uptime_seconds');
  });

  it('contains no identifiers, e-mails or tokens (low-cardinality, PII-free)', async () => {
    await http(app).post('/api/auth/login').send({ email: w.a.users.owner.email, password: 'wrong-password-1' }).expect(401);
    const body = (await scrape().expect(200)).text;
    expect(body).not.toContain(w.a.residenceId);
    expect(body).not.toContain(w.a.users.owner.email);
    expect(body).not.toContain(w.a.users.owner.id);
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/); // no UUID anywhere
    expect(body).not.toContain(w.tokens['a.owner']);
  });

  it('counts failed logins and refresh-token REUSE (the alert-worthy security signals)', async () => {
    const count = async (re: RegExp) => Number(re.exec((await scrape().expect(200)).text)?.[1] ?? 0);
    const failuresBefore = await count(/syndicma_login_total\{result="failure"\} (\d+)/);
    await http(app).post('/api/auth/login').send({ email: w.a.users.tenant.email, password: 'nope-nope-nope' }).expect(401);
    expect(await count(/syndicma_login_total\{result="failure"\} (\d+)/)).toBe(failuresBefore + 1);

    const reuseBefore = await count(/syndicma_refresh_reuse_total (\d+)/);
    const s = await loginAs(app, w.a.users.tenant.email, PASSWORD);
    await refreshWith(app, s.cookie).expect(200);
    await refreshWith(app, s.cookie).expect(401); // replay of a used token
    expect(await count(/syndicma_refresh_reuse_total (\d+)/)).toBe(reuseBefore + 1);
  });
});
