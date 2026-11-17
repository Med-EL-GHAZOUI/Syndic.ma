// `npm run seed` — creates a demo organization. Never run against production.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'crypto';
import { AppModule } from './app.module';
import { seedOrg, seedSuperAdmin } from './seed-lib';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  // Password comes from SEED_PASSWORD or is generated and printed once (never hard-coded).
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString('base64url');
  // SEED_TAG lets the browser e2e suite create a fresh, uniquely named organization on every run.
  const tag = (process.env.SEED_TAG || 'demo').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'demo';
  const org = await seedOrg(app, password, tag);
  const sa = await seedSuperAdmin(app, password, 'super@example.com');
  console.log('Seeded organization', org.orgId);
  console.log('Password for ALL seeded accounts:', password);
  console.log([...Object.values(org.users).map((u) => u.email), sa.email].join('\n'));
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
