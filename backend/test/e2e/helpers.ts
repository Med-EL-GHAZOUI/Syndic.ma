// Must be imported BEFORE anything from src/ so env is set when modules load.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgres://syndicma:syndicma_dev@localhost:55432/syndicma_test';
process.env.JWT_ACCESS_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
process.env.NODE_ENV = 'test';
process.env.RUN_MIGRATIONS = 'true';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_LIMIT = '1000000';
process.env.BCRYPT_COST = '4'; // fast hashing in tests only (production enforces >= 10)
process.env.STORAGE_DIR = require('path').join(require('os').tmpdir(), 'syndicma-e2e-storage');

jest.setTimeout(120_000);

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { SeededOrg, seedOrg, seedSuperAdmin } from '../../src/seed-lib';
import { configureApp } from '../../src/setup';

export const PASSWORD = 'Test-Passw0rd-123!';

export async function createApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export const http = (app: INestApplication) => request(app.getHttpServer());

export async function loginAs(app: INestApplication, email: string, password = PASSWORD) {
  const res = await http(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { accessToken: string; refreshToken: string; expiresIn: number };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface World {
  a: SeededOrg;
  b: SeededOrg;
  tokens: Record<string, string>; // key: `${org}.${role}`
  superEmail: string;
}

/** Two fully separate organizations (A and B) with one login per role, used to prove isolation. */
export async function buildWorld(app: INestApplication): Promise<World> {
  const tagA = `a${randomBytes(3).toString('hex')}`;
  const tagB = `b${randomBytes(3).toString('hex')}`;
  const a = await seedOrg(app, PASSWORD, tagA);
  const b = await seedOrg(app, PASSWORD, tagB);
  const superEmail = `super.${tagA}@example.com`;
  await seedSuperAdmin(app, PASSWORD, superEmail);

  const tokens: Record<string, string> = {};
  for (const [label, org] of [['a', a], ['b', b]] as const) {
    for (const [role, u] of Object.entries(org.users)) tokens[`${label}.${role}`] = (await loginAs(app, u.email)).accessToken;
  }
  tokens.super = (await loginAs(app, superEmail)).accessToken;
  return { a, b, tokens, superEmail };
}
