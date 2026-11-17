import { createServer, Server, Socket } from 'net';

/** The harmless industry-standard antivirus test string, assembled at run time so this source file itself is never quarantined. */
export const EICAR_MARKER = ['EICAR', 'STANDARD', 'ANTIVIRUS', 'TEST', 'FILE'].join('-');
export const eicar = () => Buffer.from(`X5O!P%@AP[4\\PZX54(P^)7CC)7}$${EICAR_MARKER}!$H+H*`);

export interface FakeClamd {
  port: number;
  /** Number of complete INSTREAM scans received. */
  scans: () => number;
  /** Total payload bytes of the last scan (proves the whole file was streamed). */
  lastBytes: () => number;
  close: () => Promise<void>;
}

/**
 * A minimal clamd that speaks the real INSTREAM wire protocol, to test our client without a 1 GB ClamAV image.
 * It flags any stream containing the EICAR marker. `mode` simulates a broken daemon.
 */
export function startFakeClamd(mode: 'normal' | 'garbage' | 'hang' = 'normal'): Promise<FakeClamd> {
  let scans = 0;
  let lastBytes = 0;
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    if (mode === 'hang') return; // accept and never answer
    let buf = Buffer.alloc(0);
    let started = false;
    const body: Buffer[] = [];
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!started) {
        const header = Buffer.from('zINSTREAM\0');
        if (buf.length < header.length) return;
        if (!buf.subarray(0, header.length).equals(header)) { socket.end('UNKNOWN COMMAND\0'); return; }
        buf = buf.subarray(header.length);
        started = true;
      }
      for (;;) {
        if (buf.length < 4) return;
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          const data = Buffer.concat(body);
          scans++;
          lastBytes = data.length;
          if (mode === 'garbage') socket.end('this is not a clamd answer\0');
          else socket.end(data.includes(EICAR_MARKER) ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
          return;
        }
        if (buf.length < 4 + len) return;
        body.push(buf.subarray(4, 4 + len));
        buf = buf.subarray(4 + len);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as { port: number }).port,
        scans: () => scans,
        lastBytes: () => lastBytes,
        close: () => new Promise<void>((r) => { sockets.forEach((s) => s.destroy()); server.close(() => r()); }),
      });
    });
  });
}
