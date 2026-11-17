import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationsService } from './notifications.service';

/** Arbitrary constant: only one API instance runs the jobs at a time (pg advisory lock). */
const LOCK_KEY = 7_340_001;
const DAY_MS = 86_400_000;

/** Calendar date in Morocco, YYYY-MM-DD (the "today" users mean, whatever the server's time zone). */
export const moroccoDate = (d = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(d);
const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface JobResult { name: string; ok: boolean; affected?: number; error?: string }
export interface JobsReport { skipped: boolean; results: JobResult[] }

/**
 * Background jobs, run in-process on a timer. Several API instances may run side by side: each tick first takes a
 * Postgres advisory lock, so a job never runs twice at once, and every producer is idempotent (dedupe keys), so a
 * retry after a crash never notifies twice. A failing job is logged and does not stop the others.
 * Disabled in tests (JOBS_ENABLED=false); tests call runOnce() directly.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(JobsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  onApplicationBootstrap(): void {
    const flag = this.config.get<string>('JOBS_ENABLED');
    const enabled = flag ? flag === 'true' : this.config.get('NODE_ENV') !== 'test';
    if (!enabled) return;
    const every = Math.max(60_000, Number(this.config.get('JOBS_INTERVAL_MS') ?? 15 * 60_000));
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref(); // never keeps the process alive
    setTimeout(() => void this.tick(), 30_000).unref();
    this.log.log(`background jobs enabled (every ${Math.round(every / 60_000)} min)`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // previous run still in progress on this instance
    this.running = true;
    try {
      const report = await this.runOnce();
      if (!report.skipped) for (const r of report.results) if (!r.ok) this.log.error(`job ${r.name} failed: ${r.error}`);
    } catch (e) {
      this.log.error(`jobs tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async runOnce(now = new Date()): Promise<JobsReport> {
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    try {
      const [{ locked }] = await runner.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
      if (!locked) return { skipped: true, results: [] };
      try {
        const today = moroccoDate(now);
        const results: JobResult[] = [];
        for (const [name, job] of [
          ['purgeExpiredTokens', () => this.purgeExpiredTokens()],
          ['purgeOldNotifications', () => this.purgeOldNotifications()],
          ['overdueDigest', () => this.overdueDigest(today)],
          ['assemblyReminders', () => this.assemblyReminders(today)],
        ] as const) {
          try {
            results.push({ name, ok: true, affected: await job() });
            this.metrics.inc('syndicma_job_runs_total', { job: name, result: 'ok' });
            this.metrics.setGauge('syndicma_job_last_success_timestamp_seconds', { job: name }, Math.floor(Date.now() / 1000));
          } catch (e) {
            results.push({ name, ok: false, error: (e as Error).message });
            this.metrics.inc('syndicma_job_runs_total', { job: name, result: 'error' }); // alert: any increase
          }
        }
        return { skipped: false, results };
      } finally {
        await runner.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      }
    } finally {
      await runner.release();
    }
  }

  private async count(sql: string, params: unknown[] = []): Promise<number> {
    const [row] = await this.ds.query(`WITH d AS (${sql}) SELECT count(*)::int AS n FROM d`, params);
    return row.n;
  }

  /**
   * Refresh/reset tokens are useless once expired. They are kept 7 days (resp. 1 day) past expiry so that replaying
   * a just-expired token is still recognised as a replay, not as an unknown token.
   */
  private async purgeExpiredTokens(): Promise<number> {
    const a = await this.count(`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days' RETURNING 1`);
    const b = await this.count(`DELETE FROM password_resets WHERE expires_at < now() - interval '1 day' RETURNING 1`);
    return a + b;
  }

  /** Read notifications live 90 days, unread ones a year. (The audit log is separate and never purged.) */
  private purgeOldNotifications(): Promise<number> {
    return this.count(`DELETE FROM notifications WHERE (read_at IS NOT NULL AND created_at < now() - interval '90 days') OR created_at < now() - interval '365 days' RETURNING 1`);
  }

  /** One digest per residence and per day to the finance staff: how many charges are overdue and for how much. */
  private async overdueDigest(today: string): Promise<number> {
    const rows: { orgId: string; residenceId: string; n: number; cents: string }[] = await this.ds.query(
      `SELECT org_id AS "orgId", residence_id AS "residenceId", count(*)::int AS n, sum(rem)::bigint AS cents FROM (
         SELECT c.org_id, c.residence_id,
                (ROUND(c.amount * 100) - COALESCE(SUM(ROUND(a.amount * 100)) FILTER (WHERE p.status = 'recorded'), 0)) AS rem
           FROM charges c
           LEFT JOIN allocations a ON a.charge_id = c.id
           LEFT JOIN payments p ON p.id = a.payment_id
          WHERE c.due_date < $1::date
          GROUP BY c.id
       ) t WHERE rem > 0 GROUP BY org_id, residence_id`,
      [today],
    );
    let sent = 0;
    for (const r of rows) {
      const staff = await this.notifications.staffUserIds(r.orgId, r.residenceId, ['syndic_admin', 'accountant']);
      await this.notifications.notify(r.orgId, staff, {
        type: 'overdueDigest', params: { count: r.n, amount: Number(r.cents) / 100 }, link: '/finance', dedupeKey: `overdue:${r.residenceId}:${today}`,
      });
      sent += staff.length ? 1 : 0;
    }
    return sent;
  }

  /** Owners (the only residents who can open assemblies) are reminded once, in the 3 days before a convened assembly. */
  private async assemblyReminders(today: string): Promise<number> {
    const rows: { id: string; orgId: string; residenceId: string; title: string; date: string }[] = await this.ds.query(
      `SELECT id, org_id AS "orgId", residence_id AS "residenceId", title, to_char(date, 'YYYY-MM-DD') AS date
         FROM assemblies WHERE status = 'convened' AND date BETWEEN $1::date AND $2::date`,
      [today, addDays(today, 3)],
    );
    for (const a of rows) {
      const residents = await this.notifications.residentUserIds(a.orgId, a.residenceId, ['owner']);
      await this.notifications.notify(a.orgId, residents, { type: 'assemblyReminder', params: { title: a.title, date: a.date }, link: '/assemblies', dedupeKey: `assembly-reminder:${a.id}` });
    }
    return rows.length;
  }
}
