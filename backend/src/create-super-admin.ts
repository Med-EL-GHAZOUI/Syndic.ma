// Bootstraps the first platform administrator (works in production, unlike `seed`).
//   SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... node dist/create-super-admin.js
// The password is read from the environment only (never from argv / shell history logs) and must be >= 12 chars.
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { seedSuperAdmin } from './seed-lib';

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('SUPERADMIN_EMAIL is missing or invalid');
  if (password.length < 12) throw new Error('SUPERADMIN_PASSWORD must be at least 12 characters');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const admin = await seedSuperAdmin(app, password, email);
  console.log(`Platform admin ready: ${admin.email}`);
  await app.close();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
