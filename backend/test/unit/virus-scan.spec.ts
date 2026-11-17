import { scanWithClamd } from '../../src/community/virus-scan.service';
import { eicar, FakeClamd, startFakeClamd } from '../helpers/fake-clamd';

describe('clamd INSTREAM client', () => {
  let clamd: FakeClamd | undefined;
  afterEach(async () => { await clamd?.close(); clamd = undefined; });

  it('reports a clean file', async () => {
    clamd = await startFakeClamd();
    expect(await scanWithClamd('127.0.0.1', clamd.port, Buffer.from('%PDF-1.4 hello'))).toEqual({ status: 'clean' });
  });

  it('reports the signature of an infected file', async () => {
    clamd = await startFakeClamd();
    expect(await scanWithClamd('127.0.0.1', clamd.port, eicar())).toEqual({ status: 'infected', signature: 'Eicar-Test-Signature' });
  });

  it('streams a large file in several chunks, without losing a byte', async () => {
    clamd = await startFakeClamd();
    const big = Buffer.alloc(3 * 1024 * 1024 + 123, 7);
    expect(await scanWithClamd('127.0.0.1', clamd.port, big)).toEqual({ status: 'clean' });
    expect(clamd.lastBytes()).toBe(big.length);
  });

  it('finds the marker even when it sits across a chunk boundary', async () => {
    clamd = await startFakeClamd();
    const pad = Buffer.alloc(64 * 1024 - 10, 0x41); // chunk size is 64 KiB: the marker straddles the cut
    expect((await scanWithClamd('127.0.0.1', clamd.port, Buffer.concat([pad, eicar(), pad]))).status).toBe('infected');
  });

  it('an empty file is scanned like any other', async () => {
    clamd = await startFakeClamd();
    expect(await scanWithClamd('127.0.0.1', clamd.port, Buffer.alloc(0))).toEqual({ status: 'clean' });
  });

  it('rejects (never "clean") when the daemon answers nonsense, hangs, or is not there', async () => {
    clamd = await startFakeClamd('garbage');
    await expect(scanWithClamd('127.0.0.1', clamd.port, Buffer.from('x'))).rejects.toThrow(/unexpected clamd answer/);
    await clamd.close();
    clamd = await startFakeClamd('hang');
    await expect(scanWithClamd('127.0.0.1', clamd.port, Buffer.from('x'), 300)).rejects.toThrow(/timed out/);
    const { port } = clamd;
    await clamd.close();
    clamd = undefined;
    await expect(scanWithClamd('127.0.0.1', port, Buffer.from('x'))).rejects.toThrow(); // connection refused
  });
});
