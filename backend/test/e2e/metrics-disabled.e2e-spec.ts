// Must run with NO metrics token configured: the flag is set before the helpers (and the app) load.
process.env.E2E_NO_METRICS = '1';
delete process.env.METRICS_TOKEN;

import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp, http } = require('./helpers') as typeof import('./helpers');

describe('Metrics endpoint without a configured token', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createApp(); });
  afterAll(() => app.close());

  it('does not exist (404), whatever credentials are sent', async () => {
    await http(app).get('/api/metrics').expect(404);
    await http(app).get('/api/metrics').set('Authorization', 'Bearer anything').expect(404);
  });
});
