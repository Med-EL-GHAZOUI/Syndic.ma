import { Controller, Get, Global, Header, Module, NotFoundException, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Public } from '../common/auth-user';
import { MetricsService } from './metrics.service';

@Controller('metrics')
class MetricsController {
  constructor(private readonly metrics: MetricsService, private readonly config: ConfigService) {}

  /** Scraped by Prometheus with `Authorization: Bearer <METRICS_TOKEN>`. Disabled (404) unless a token is configured. */
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(@Req() req: Request): string {
    const expected = this.config.get<string>('METRICS_TOKEN');
    if (!expected) throw new NotFoundException();
    const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return this.metrics.render();
  }
}

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
