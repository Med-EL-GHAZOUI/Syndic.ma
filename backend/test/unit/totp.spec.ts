import { decryptSecret, encryptSecret } from '../../src/auth/mfa-crypto';
import { base32Decode, base32Encode, hotp, otpauthUrl, stepAt, verifyTotp } from '../../src/auth/totp';

const RFC_SECRET = Buffer.from('12345678901234567890'); // the shared test key of RFC 4226 / 6238

describe('HOTP / TOTP against the published test vectors', () => {
  it('RFC 4226 appendix D (counters 0..9)', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });

  it('RFC 6238 appendix B (SHA-1, last 6 of the 8-digit codes)', () => {
    const vectors: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
    for (const [seconds, code] of vectors) expect(hotp(RFC_SECRET, stepAt(seconds * 1000))).toBe(code);
  });
});

describe('verifyTotp', () => {
  const now = 1_700_000_000_000;
  const at = (offsetSteps: number) => hotp(RFC_SECRET, stepAt(now) + offsetSteps);

  it('accepts the current code and one step of clock drift either way, nothing further', () => {
    expect(verifyTotp(RFC_SECRET, at(0), now)).toBe(stepAt(now));
    expect(verifyTotp(RFC_SECRET, at(-1), now)).toBe(stepAt(now) - 1);
    expect(verifyTotp(RFC_SECRET, at(1), now)).toBe(stepAt(now) + 1);
    expect(verifyTotp(RFC_SECRET, at(-2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(2), now)).toBeNull();
  });

  it('a code can only be used once: steps up to the last accepted one are refused', () => {
    const step = verifyTotp(RFC_SECRET, at(0), now)!;
    expect(verifyTotp(RFC_SECRET, at(0), now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(-1), now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, at(1), now, step)).toBe(step + 1);
  });

  it('rejects anything that is not exactly six digits', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 345', ' 123456']) expect(verifyTotp(RFC_SECRET, bad, now)).toBeNull();
  });
});

describe('base32 / otpauth', () => {
  it('round-trips and matches RFC 4648 vectors', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    const random = Buffer.from(Array.from({ length: 20 }, (_, i) => (i * 37 + 11) % 256));
    expect(base32Decode(base32Encode(random)).equals(random)).toBe(true);
    expect(() => base32Decode('not*base32')).toThrow();
  });

  it('builds a URL authenticator apps understand', () => {
    const url = otpauthUrl('Syndic.ma', 'a.b+c@example.com', 'ABCDEFGH');
    expect(url).toBe('otpauth://totp/Syndic.ma:a.b%2Bc%40example.com?secret=ABCDEFGH&issuer=Syndic.ma&algorithm=SHA1&digits=6&period=30');
  });
});

describe('secret encryption at rest', () => {
  const key = 'a-long-enough-key-material-for-tests-0123456789';

  it('round-trips and never stores the plaintext', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', key, 'user-1');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(decryptSecret(stored, key, 'user-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(encryptSecret('JBSWY3DPEHPK3PXP', key, 'user-1')).not.toBe(stored); // fresh IV every time
  });

  it('is bound to the user and to the key, and detects tampering', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', key, 'user-1');
    expect(() => decryptSecret(stored, key, 'user-2')).toThrow(); // moved to another account
    expect(() => decryptSecret(stored, `${key}x`, 'user-1')).toThrow(); // wrong key
    const parts = stored.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key, 'user-1')).toThrow();
    expect(() => decryptSecret('garbage', key, 'user-1')).toThrow();
  });
});
