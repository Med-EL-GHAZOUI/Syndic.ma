import { detectUpload, sanitizeFileName } from '../../src/community/file-validation';

const bytes = (...b: number[]) => Buffer.from([...b, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00); // "MZ" Windows executable
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

describe('detectUpload (content sniffing, never trusts the client)', () => {
  it('accepts matching content + extension and returns a server-decided MIME', () => {
    expect(detectUpload(PDF, 'Règlement.PDF')).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    expect(detectUpload(PNG, 'plan.png')?.mime).toBe('image/png');
    expect(detectUpload(JPG, 'photo.jpeg')?.mime).toBe('image/jpeg');
    expect(detectUpload(ZIP, 'budget.xlsx')?.mime).toContain('spreadsheetml');
    expect(detectUpload(ZIP, 'pv.docx')?.mime).toContain('wordprocessingml');
  });

  it('rejects an executable renamed to .pdf', () => expect(detectUpload(EXE, 'invoice.pdf')).toBeNull());
  it('rejects content that does not match the extension', () => {
    expect(detectUpload(PNG, 'plan.pdf')).toBeNull();
    expect(detectUpload(PDF, 'plan.png')).toBeNull();
    expect(detectUpload(ZIP, 'archive.zip')).toBeNull();
  });
  it('rejects active content and dangerous extensions even with a harmless name', () => {
    expect(detectUpload(HTML, 'page.html')).toBeNull();
    expect(detectUpload(HTML, 'page.pdf')).toBeNull();
    expect(detectUpload(Buffer.from('<svg onload=alert(1)>'), 'logo.svg')).toBeNull();
    expect(detectUpload(PDF, 'script.js')).toBeNull();
    expect(detectUpload(PDF, 'noextension')).toBeNull();
  });
  it('rejects empty / tiny buffers', () => {
    expect(detectUpload(Buffer.alloc(0), 'a.pdf')).toBeNull();
    expect(detectUpload(Buffer.from([0x25, 0x50]), 'a.pdf')).toBeNull();
  });
  it('is not fooled by a double extension', () => expect(detectUpload(EXE, 'photo.jpg.exe')).toBeNull());
});

describe('sanitizeFileName', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\windows\\system32\\evil.pdf', 'evil.pdf'],
    ['a/b/c.pdf', 'c.pdf'],
    ['.htaccess', 'htaccess'],
    ['', 'document'],
    ['   ', 'document'],
    ['bad<>:"|?*name.pdf', 'badname.pdf'],
    ['null\u0000byte.pdf', 'nullbyte.pdf'],
    ['dots....pdf', 'dots.pdf'],
  ])('%j -> %j', (input, expected) => expect(sanitizeFileName(input)).toBe(expected));

  it('keeps accents and limits the length', () => {
    expect(sanitizeFileName('Procès-verbal été.pdf')).toBe('Procès-verbal été.pdf');
    expect(sanitizeFileName('x'.repeat(500) + '.pdf').length).toBeLessThanOrEqual(100);
  });
});
