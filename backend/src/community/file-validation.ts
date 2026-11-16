// Upload hardening. The client-supplied MIME type and file name are NEVER trusted:
//  - the content type is decided from the file's magic bytes;
//  - the extension must be one of the allowed extensions for that detected type;
//  - the stored name is a random key; the original name is only a sanitized display label.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface Kind { mime: string; exts: string[]; magic: number[] }

const KINDS: Kind[] = [
  { mime: 'application/pdf', exts: ['pdf'], magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: 'image/png', exts: ['png'], magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', exts: ['jpg', 'jpeg'], magic: [0xff, 0xd8, 0xff] },
  // OOXML (docx/xlsx) are ZIP containers.
  { mime: 'application/vnd.openxmlformats-officedocument', exts: ['docx', 'xlsx'], magic: [0x50, 0x4b, 0x03, 0x04] },
  // Legacy OLE2 (doc/xls).
  { mime: 'application/vnd.ms-office', exts: ['doc', 'xls'], magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', xls: 'application/vnd.ms-excel',
};

export const extensionOf = (name: string): string => (name.split('.').length > 1 ? name.split('.').pop()!.toLowerCase() : '');

/** Returns the trusted MIME type, or null if the content/extension combination is not allowed. */
export function detectUpload(buffer: Buffer, originalName: string): { mime: string; ext: string } | null {
  if (!buffer || buffer.length < 8) return null;
  const ext = extensionOf(originalName);
  const kind = KINDS.find((k) => k.magic.every((b, i) => buffer[i] === b));
  if (!kind || !kind.exts.includes(ext)) return null;
  return { mime: MIME_BY_EXT[ext], ext };
}

/** Display-only file name: no path parts, no control characters, bounded length. */
export function sanitizeFileName(name: string): string {
  const base = (name || '').split(/[\\/]/).pop() || '';
  const cleaned = base
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 100);
  return cleaned || 'document';
}
