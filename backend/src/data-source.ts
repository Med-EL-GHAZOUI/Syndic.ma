// TypeORM CLI data source (migration:generate / migration:run). Not used at runtime by Nest.
import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ENTITIES,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
