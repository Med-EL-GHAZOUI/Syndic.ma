import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Swagger is exposed outside production only.
  configureApp(app, { swagger: process.env.NODE_ENV !== 'production', cors: process.env.CORS_ORIGIN });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000));
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
