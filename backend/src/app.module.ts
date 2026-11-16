import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { Public } from './common/auth-user';
import { CommonModule } from './common/common.module';
import { CommunityModule } from './community/community.module';
import { JwtAuthGuard, PermissionsGuard } from './common/guards';
import { ENTITIES } from './entities';
import { FinanceModule } from './finance/finance.module';
import { OpsModule } from './ops/ops.module';
import { PropertiesModule } from './properties/properties.module';
import { join } from 'path';

@Controller('health')
class HealthController {
  @Public() @Get() ok() { return { status: 'ok' }; }
}

function validateEnv(env: Record<string, unknown>) {
  const secret = String(env.JWT_ACCESS_SECRET ?? '');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (secret.length < 32) throw new Error('JWT_ACCESS_SECRET must be set and at least 32 characters long');
  if (env.NODE_ENV === 'production' && /change-me/i.test(secret)) throw new Error('JWT_ACCESS_SECRET still has its example value');
  return env;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 300) }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: ENTITIES,
        // Schema is managed ONLY by migrations (never synchronize).
        synchronize: false,
        migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
        migrationsRun: config.get('RUN_MIGRATIONS') === 'true',
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: true } : false,
      }),
    }),
    CommonModule,
    AuthModule,
    PropertiesModule,
    FinanceModule,
    OpsModule,
    CommunityModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: throttle -> authenticate -> authorize. Everything is protected unless @Public().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
