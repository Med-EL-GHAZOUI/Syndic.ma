import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { MetricsService } from './metrics/metrics.service';

/** Shared by main.ts and the e2e tests so both run with identical pipes/headers. */
export function configureApp(app: INestApplication, opts: { swagger?: boolean; cors?: string } = {}) {
  app.use(helmet());
  app.use(app.get(MetricsService).middleware());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,              // strip unknown properties (mass-assignment protection)
    forbidNonWhitelisted: true,   // ...and reject them
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  if (opts.cors) app.enableCors({ origin: opts.cors.split(','), credentials: false });
  if (opts.swagger) {
    const doc = new DocumentBuilder().setTitle('Syndic.ma API').setDescription('Multi-tenant condominium management API').setVersion('0.1').addBearerAuth().build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }
}
