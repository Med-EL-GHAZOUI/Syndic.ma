import { Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { connect } from 'net';
import { MetricsService } from '../metrics/metrics.service';

export type ScanResult = { status: 'clean' } | { status: 'infected'; signature: string };

const CHUNK = 64 * 1024;
const TIMEOUT_MS = 20_000;

/** Speaks the clamd INSTREAM protocol: "zINSTREAM\0", then [4-byte big-endian length][data]..., then a zero length. */
export function scanWithClamd(host: string, port: number, data: Buffer, timeoutMs = TIMEOUT_MS): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };
    socket.setTimeout(timeoutMs, () => done(() => reject(new Error('clamd timed out'))));
    socket.on('error', (e) => done(() => reject(e)));
    socket.on('data', (c) => chunks.push(c));
    socket.on('end', () => {
      const answer = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim(); // e.g. "stream: OK" / "stream: Eicar FOUND"
      if (/\bOK$/.test(answer)) return done(() => resolve({ status: 'clean' }));
      const found = /^stream:\s*(.+)\s+FOUND$/.exec(answer);
      if (found) return done(() => resolve({ status: 'infected', signature: found[1] }));
      done(() => reject(new Error(`unexpected clamd answer: ${answer.slice(0, 120) || '(empty)'}`)));
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < data.length; i += CHUNK) {
        const part = data.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4)); // end of stream
    });
  });
}

/**
 * Antivirus gate for uploads. Enabled when CLAMAV_HOST is set (ClamAV daemon, e.g. the `antivirus` compose profile).
 *  - infected  -> 422, the file is never stored;
 *  - scanner unreachable -> 503 and the file is REFUSED (fail closed), unless CLAMAV_FAIL_OPEN=true is set on purpose.
 * Not configured -> uploads are accepted as before (content-type sniffing and size limits still apply) and a warning is logged once.
 */
@Injectable()
export class VirusScanService {
  private readonly log = new Logger(VirusScanService.name);
  private warned = false;

  constructor(private readonly metrics: MetricsService) {}

  enabled(): boolean {
    return !!process.env.CLAMAV_HOST;
  }

  /** Throws when the file must not be accepted. Returns normally when it is clean (or scanning is not configured). */
  async assertClean(data: Buffer): Promise<void> {
    if (!this.enabled()) {
      if (!this.warned) { this.warned = true; this.log.warn('CLAMAV_HOST is not set: uploaded files are NOT scanned for malware'); }
      this.metrics.inc('syndicma_upload_scan_total', { result: 'disabled' });
      return;
    }
    try {
      const r = await scanWithClamd(process.env.CLAMAV_HOST!, Number(process.env.CLAMAV_PORT ?? 3310), data);
      if (r.status === 'infected') {
        this.metrics.inc('syndicma_upload_scan_total', { result: 'infected' });
        this.log.warn(`upload rejected: ${r.signature}`);
        throw new UnprocessableEntityException('File rejected: malware detected');
      }
      this.metrics.inc('syndicma_upload_scan_total', { result: 'clean' });
    } catch (e) {
      if (e instanceof UnprocessableEntityException) throw e;
      this.metrics.inc('syndicma_upload_scan_total', { result: 'error' });
      this.log.error(`antivirus scan failed: ${(e as Error).message}`);
      if (process.env.CLAMAV_FAIL_OPEN === 'true') return; // explicit operator choice
      throw new ServiceUnavailableException('The file could not be scanned; please try again later');
    }
  }
}
