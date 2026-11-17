import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { eicar, FakeClamd, startFakeClamd } from '../helpers/fake-clamd';
import { bearer, buildWorld, createApp, http, World } from './helpers';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('plain harmless body\n%%EOF')]);
// a file that passes type sniffing (it IS a PDF by content and extension) but carries the test signature
const INFECTED_PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), eicar(), Buffer.from('\n%%EOF')]);

describe('Antivirus gate on document uploads', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  let clamd: FakeClamd;
  const as = (key: string) => bearer(w.tokens[key]);
  const upload = (file: Buffer, name = 'doc.pdf') =>
    http(app).post('/api/documents').set(as('a.syndic_admin'))
      .field('residenceId', w.a.residenceId).field('name', 'Document de test').field('category', 'other').field('visibility', 'staff')
      .attach('file', file, { filename: name, contentType: 'application/pdf' });
  const docCount = async () => Number((await ds.query('SELECT count(*) FROM documents WHERE org_id = $1', [w.a.orgId]))[0].count);

  beforeAll(async () => {
    app = await createApp();
    ds = app.get(DataSource);
    w = await buildWorld(app);
    clamd = await startFakeClamd();
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(clamd.port);
  });
  afterAll(async () => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    delete process.env.CLAMAV_FAIL_OPEN;
    await clamd.close();
    await app.close();
  });

  it('a clean file is scanned, then stored', async () => {
    const before = clamd.scans();
    await upload(PDF).expect(201);
    expect(clamd.scans()).toBe(before + 1);
    expect(clamd.lastBytes()).toBe(PDF.length); // the scanner saw the whole file
  });

  it('an infected file is refused with 422, is not stored, and the refusal is audited', async () => {
    const before = await docCount();
    const res = await upload(INFECTED_PDF, 'facture.pdf').expect(422);
    expect(res.body.message).toContain('malware');
    expect(await docCount()).toBe(before);
    const audit = (await http(app).get('/api/audit?limit=20').set(as('a.syndic_admin')).expect(200)).body as { action: string; summary: string }[];
    expect(audit.find((a) => a.action === 'reject')?.summary).toContain('facture.pdf');
  });

  it('the type check still runs first: a non-PDF is refused without bothering the scanner', async () => {
    const before = clamd.scans();
    await upload(Buffer.from('MZ\x90\x00 executable'), 'virus.pdf').expect(415);
    expect(clamd.scans()).toBe(before);
  });

  it('FAILS CLOSED: when the scanner is down the upload is refused (503), nothing is stored', async () => {
    const before = await docCount();
    const port = process.env.CLAMAV_PORT;
    await clamd.close();
    await upload(PDF).expect(503);
    expect(await docCount()).toBe(before);

    // ... unless the operator explicitly chose fail-open
    process.env.CLAMAV_FAIL_OPEN = 'true';
    await upload(PDF).expect(201);
    delete process.env.CLAMAV_FAIL_OPEN;

    // the daemon comes back: scanning resumes
    clamd = await startFakeClamd();
    process.env.CLAMAV_PORT = String(clamd.port);
    await upload(INFECTED_PDF).expect(422);
    expect(port).toBeDefined();
  });

  it('when no scanner is configured uploads work as before (and the gate says so in the metrics)', async () => {
    delete process.env.CLAMAV_HOST;
    await upload(PDF).expect(201);
    const text = (await http(app).get('/api/metrics').set('Authorization', 'Bearer e2e-metrics-token-0123456789').expect(200)).text;
    expect(text).toMatch(/syndicma_upload_scan_total\{result="clean"\} [1-9]/);
    expect(text).toMatch(/syndicma_upload_scan_total\{result="infected"\} [1-9]/);
    expect(text).toMatch(/syndicma_upload_scan_total\{result="error"\} [1-9]/);
    expect(text).toMatch(/syndicma_upload_scan_total\{result="disabled"\} [1-9]/);
    process.env.CLAMAV_HOST = '127.0.0.1';
  });
});
