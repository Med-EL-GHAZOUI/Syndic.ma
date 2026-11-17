import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';

/** Seeds a brand-new organization (one user per role) and records its tag for the tests. */
export default async function globalSetup() {
  const tag = `e2e${randomBytes(3).toString('hex')}`;
  const password = 'E2e-Passw0rd-2026!';
  execSync('npm run seed', {
    cwd: join(__dirname, '..', 'backend'),
    env: { ...process.env, SEED_TAG: tag, SEED_PASSWORD: password },
    stdio: 'pipe',
  });
  writeFileSync(join(__dirname, '.e2e-state.json'), JSON.stringify({ tag, password }));
}
