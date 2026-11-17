import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * TOTP secrets must be recoverable (we need them to verify codes), so they cannot be hashed: they are encrypted
 * at rest with AES-256-GCM. The ciphertext is bound to the user id (AAD), so a database write cannot move one
 * user's secret to another account. A database dump alone does not reveal the secrets: the key lives in the environment.
 */
const key = (material: string): Buffer => createHash('sha256').update(`syndicma-mfa-v1:${material}`).digest();

export function encryptSecret(plain: string, material: string, userId: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(material), iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(stored: string, material: string, userId: string): string {
  const [v, iv, tag, ct] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('unsupported secret format');
  const d = createDecipheriv('aes-256-gcm', key(material), Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
