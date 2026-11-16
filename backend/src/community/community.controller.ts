import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Perm } from '../common/auth-user';
import { PageQuery } from '../common/pagination';
import { AssembliesService } from './assemblies.service';
import { AssemblyDto, AttendanceDto, CompleteWorkDto, DocumentUploadDto, MinutesDto, NoteDto, ResolutionDto, WorkOrderDto, WorkQuery } from './community.dto';
import { DocumentsService } from './documents.service';
import { MAX_UPLOAD_BYTES } from './file-validation';
import { MaintenanceService } from './maintenance.service';

const uuid = new ParseUUIDPipe();

@ApiTags('community')
@ApiBearerAuth()
@Controller()
export class CommunityController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly assemblies: AssembliesService,
    private readonly documents: DocumentsService,
  ) {}

  // ---- maintenance ----
  @Perm('maintenance', 'v') @Get('maintenance')
  listWork(@CurrentUser() u: AuthUser, @Query() q: WorkQuery) { return this.maintenance.list(u, q); }
  @Perm('maintenance', 'c') @Post('maintenance')
  createWork(@CurrentUser() u: AuthUser, @Body() dto: WorkOrderDto) { return this.maintenance.create(u, dto); }
  @Perm('maintenance', 'e') @HttpCode(200) @Post('maintenance/:id/start')
  startWork(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.maintenance.start(u, id); }
  @Perm('maintenance', 'e') @HttpCode(200) @Post('maintenance/:id/complete')
  completeWork(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: CompleteWorkDto) { return this.maintenance.complete(u, id, dto); }
  @Perm('maintenance', 'e') @HttpCode(200) @Post('maintenance/:id/cancel')
  cancelWork(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.maintenance.cancel(u, id); }
  @Perm('maintenance', 'e') @Post('maintenance/:id/notes')
  noteWork(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: NoteDto) { return this.maintenance.addNote(u, id, dto); }

  // ---- assemblies ----
  @Perm('assemblies', 'v') @Get('assemblies')
  listAssemblies(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.assemblies.list(u, q); }
  @Perm('assemblies', 'v') @Get('assemblies/:id')
  viewAssembly(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.assemblies.view(u, id); }
  @Perm('assemblies', 'c') @Post('assemblies')
  createAssembly(@CurrentUser() u: AuthUser, @Body() dto: AssemblyDto) { return this.assemblies.create(u, dto); }
  @Perm('assemblies', 'e') @Put('assemblies/:id')
  updateAssembly(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: AssemblyDto) { return this.assemblies.update(u, id, dto); }
  @Perm('assemblies', 'e') @HttpCode(200) @Post('assemblies/:id/convene')
  convene(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.assemblies.convene(u, id); }
  @Perm('assemblies', 'e') @HttpCode(200) @Post('assemblies/:id/hold')
  hold(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.assemblies.hold(u, id); }
  @Perm('assemblies', 'e') @HttpCode(200) @Post('assemblies/:id/cancel')
  cancelAssembly(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.assemblies.cancel(u, id); }
  @Perm('assemblies', 'd') @HttpCode(204) @Delete('assemblies/:id')
  deleteAssembly(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.assemblies.remove(u, id); }
  @Perm('assemblies', 'e') @Put('assemblies/:id/attendance')
  attendance(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: AttendanceDto) { return this.assemblies.setAttendance(u, id, dto); }
  @Perm('assemblies', 'e') @Post('assemblies/:id/resolutions')
  addResolution(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ResolutionDto) { return this.assemblies.addResolution(u, id, dto); }
  @Perm('assemblies', 'e') @Put('assemblies/:id/resolutions/:rid')
  updateResolution(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Param('rid', uuid) rid: string, @Body() dto: ResolutionDto) { return this.assemblies.updateResolution(u, id, rid, dto); }
  @Perm('assemblies', 'e') @Patch('assemblies/:id/minutes')
  minutes(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: MinutesDto) { return this.assemblies.setMinutes(u, id, dto); }

  // ---- documents ----
  @Perm('documents', 'v') @Get('documents')
  listDocs(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.documents.list(u, q); }

  @Perm('documents', 'c')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8 } }))
  @Post('documents')
  upload(@CurrentUser() u: AuthUser, @Body() dto: DocumentUploadDto, @UploadedFile() file?: Express.Multer.File) { return this.documents.upload(u, dto, file); }

  @Perm('documents', 'v') @Get('documents/:id/download')
  async download(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    const { row, stream } = await this.documents.download(u, id);
    // Always a download (never rendered inline), with the server-detected content type.
    return new StreamableFile(stream, { type: row.mime, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`, length: row.size });
  }

  @Perm('documents', 'd') @HttpCode(204) @Delete('documents/:id')
  removeDoc(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.documents.remove(u, id); }
}
