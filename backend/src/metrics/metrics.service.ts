import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const key = (name: string, labels: Record<string, string>) => {
  const l = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}="${esc(v)}"`).join(',');
  return l ? `${name}{${l}}` : name; // no empty "{}" for label-less series
};

/**
 * Minimal Prometheus text exposition (no dependency). LABELS ARE LOW-CARDINALITY AND PII-FREE BY
 * CONSTRUCTION: callers pass route templates ("/api/payments/:id/confirm"), methods, status classes
 * and fixed event names — never ids, e-mails, tokens or free text.
 */
@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly hist = new Map<string, { buckets: number[]; sum: number; count: number }>();
  private readonly started = Date.now();

  inc(name: string, labels: Record<string, string> = {}, by = 1) {
    const k = key(name, labels);
    this.counters.set(k, (this.counters.get(k) ?? 0) + by);
  }

  observe(name: string, labels: Record<string, string>, seconds: number) {
    const k = key(name, labels);
    const h = this.hist.get(k) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((b, i) => { if (seconds <= b) h.buckets[i]++; });
    h.sum += seconds;
    h.count++;
    this.hist.set(k, h);
  }

  /**
   * Express middleware recording one sample per response on 'finish'. It runs at the HTTP layer, so it
   * also sees what Nest guards reject BEFORE any interceptor could (401 / 403 / 429 / 404) — exactly
   * the responses a security dashboard cares about. Labels use the route TEMPLATE (never the URL).
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const route = (req.route?.path as string | undefined) ?? 'unmatched';
        this.inc('syndicma_http_requests_total', { method: req.method, route, status: `${Math.floor(res.statusCode / 100)}xx` });
        this.observe('syndicma_http_request_duration_seconds', { method: req.method, route }, Number(process.hrtime.bigint() - start) / 1e9);
      });
      next();
    };
  }

  render(): string {
    const out: string[] = [
      '# HELP syndicma_process_uptime_seconds Process uptime.',
      '# TYPE syndicma_process_uptime_seconds gauge',
      `syndicma_process_uptime_seconds ${((Date.now() - this.started) / 1000).toFixed(0)}`,
      '# HELP syndicma_process_resident_memory_bytes Resident memory.',
      '# TYPE syndicma_process_resident_memory_bytes gauge',
      `syndicma_process_resident_memory_bytes ${process.memoryUsage().rss}`,
    ];
    const seen = new Set<string>();
    for (const [k, v] of [...this.counters].sort(([a], [b]) => a.localeCompare(b))) {
      const brace = k.indexOf('{');
      const name = brace < 0 ? k : k.slice(0, brace);
      if (!seen.has(name)) { out.push(`# TYPE ${name} counter`); seen.add(name); }
      out.push(`${k} ${v}`);
    }
    for (const [k, h] of [...this.hist].sort(([a], [b]) => a.localeCompare(b))) {
      const i = k.indexOf('{');
      const name = k.slice(0, i);
      const labels = k.slice(i + 1, -1);
      if (!seen.has(name)) { out.push(`# TYPE ${name} histogram`); seen.add(name); }
      const lab = (extra: string) => `{${labels}${labels ? ',' : ''}${extra}}`;
      BUCKETS.forEach((b, j) => out.push(`${name}_bucket${lab(`le="${b}"`)} ${h.buckets[j]}`));
      out.push(`${name}_bucket${lab('le="+Inf"')} ${h.count}`, `${name}_sum{${labels}} ${h.sum.toFixed(6)}`, `${name}_count{${labels}} ${h.count}`);
    }
    return out.join('\n') + '\n';
  }
}
