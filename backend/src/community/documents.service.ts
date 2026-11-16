import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../common/audit.service';
import { page, PageQuery } from '../common/pagination';
import { ScopeService } from '../common/scope.service';
import { DocumentFile } from '../entities';
import { DocumentUploadDto } from './community.dto';
import { detectUpload, MAX_UPLOAD_BYTES, sanitizeFileName } from './file-validation';
import { StorageService } from './storage.service';

const audiencesFor = (role: AuthUser['role']) => (role === 'owner' ? ['all', 'owners'] : role === 'tenant' ? ['all'] : ['all', 'owners', 'staff']);

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentFile) private readonly docs: Repository<DocumentFile>,
    private readonly storage: StorageService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery) {
    const ids = await this.scope.residenceIds(user);
    if (!ids.length) return [];
    const rows = await this.docs.find({ where: { orgId: this.scope.requireOrg(user), residenceId: In(ids), visibility: In(audiencesFor(user.role)) }, order: { createdAt: 'DESC' }, ...page(q) });
    return rows.map(({ storageKey, ...rest }) => rest); // storage keys are internal
  }

  async upload(user: AuthUser, dto: DocumentUploadDto, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('A file is required (field "file")');
    if (file.size > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException('File exceeds 10 MB');
    await this.scope.assertResidence(user, dto.residenceId);
    const detected = detectUpload(file.buffer, file.originalname);
    if (!detected) throw new UnsupportedMediaTypeException('File type not allowed or content does not match its extension');

    const orgId = this.scope.requireOrg(user);
    const storageKey = `${orgId}/${randomUUID()}`;
    await this.storage.put(storageKey, file.buffer);
    try {
      const row = await this.docs.save(this.docs.create({
        orgId, residenceId: dto.residenceId, name: dto.name, category: dto.category, visibility: dto.visibility,
        fileName: sanitizeFileName(file.originalname), storageKey, size: file.size, mime: detected.mime,
        sha256: createHash('sha256').update(file.buffer).digest('hex'), uploadedBy: user.id,
      }));
      await this.audit.log(user, 'create', 'documents', row.id, `${row.name} (${row.fileName})`);
      const { storageKey: _k, ...out } = row;
      return out;
    } catch (err) {
      await this.storage.remove(storageKey); // no orphan files if the DB write fails
      throw err;
    }
  }

  private async visible(user: AuthUser, id: string) {
    const row = await this.docs.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row || !audiencesFor(user.role).includes(row.visibility)) throw new NotFoundException('Document not found');
    await this.scope.assertResidence(user, row.residenceId);
    return row;
  }

  async download(user: AuthUser, id: string) {
    const row = await this.visible(user, id);
    await this.audit.log(user, 'download', 'documents', id, row.name);
    return { row, stream: this.storage.stream(row.storageKey) };
  }

  async remove(user: AuthUser, id: string) {
    const row = await this.visible(user, id);
    await this.docs.delete({ id });
    await this.storage.remove(row.storageKey);
    await this.audit.log(user, 'delete', 'documents', id, row.name);
  }
}
