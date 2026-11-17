import { createHmac } from 'crypto';

// Same algorithm as an authenticator app (RFC 6238, SHA-1, 30 s, 6 digits) - deliberately re-implemented here,
// independently of the API code, so the browser test also proves the two agree.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/\s/g, '').toUpperCase()) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Code shown `offsetSteps` steps from now (+1 is accepted by the API: clock-drift window, and not yet used). */
export function totp(secretBase32: string, offsetSteps = 0, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 1000 / 30) + offsetSteps;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret(secretBase32))).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

const secret = (s: string) => s.replace(/\s/g, '');
