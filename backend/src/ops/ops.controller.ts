import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Perm } from '../common/auth-user';
import { PageQuery } from '../common/pagination';
import { AnnouncementDto, CommentDto, ComplaintDto, ComplaintStatusDto, ExpenseDto, ExpenseQuery, ProviderDto, ReasonDto } from './ops.dto';
import { OpsService } from './ops.service';

const uuid = new ParseUUIDPipe();

@ApiTags('operations')
@ApiBearerAuth()
@Controller()
export class OpsController {
  constructor(private readonly svc: OpsService) {}

  @Perm('providers', 'v') @Get('providers')
  providers(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.svc.listProviders(u, q); }
  @Perm('providers', 'c') @Post('providers')
  createProvider(@CurrentUser() u: AuthUser, @Body() dto: ProviderDto) { return this.svc.createProvider(u, dto); }
  @Perm('providers', 'e') @Put('providers/:id')
  updateProvider(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ProviderDto) { return this.svc.updateProvider(u, id, dto); }

  @Perm('expenses', 'v') @Get('expenses')
  expenses(@CurrentUser() u: AuthUser, @Query() q: ExpenseQuery) { return this.svc.listExpenses(u, q); }
  @Perm('expenses', 'c') @Post('expenses')
  createExpense(@CurrentUser() u: AuthUser, @Body() dto: ExpenseDto) { return this.svc.createExpense(u, dto); }
  @Perm('expenses', 'e') @Put('expenses/:id')
  updateExpense(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ExpenseDto) { return this.svc.updateExpense(u, id, dto); }
  @Perm('expenses', 'a') @HttpCode(200) @Post('expenses/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.transitionExpense(u, id, 'pending', 'approved', 'approve'); }
  @Perm('expenses', 'a') @HttpCode(200) @Post('expenses/:id/pay')
  pay(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.transitionExpense(u, id, 'approved', 'paid', 'pay'); }
  @Perm('expenses', 'a') @HttpCode(200) @Post('expenses/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReasonDto) { return this.svc.cancelExpense(u, id, dto.reason); }

  @Perm('complaints', 'v') @Get('complaints')
  complaints(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.svc.listComplaints(u, q); }
  @Perm('complaints', 'c') @Post('complaints')
  createComplaint(@CurrentUser() u: AuthUser, @Body() dto: ComplaintDto) { return this.svc.createComplaint(u, dto); }
  @Perm('complaints', 'e') @Patch('complaints/:id/status')
  setStatus(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ComplaintStatusDto) { return this.svc.setComplaintStatus(u, id, dto); }
  @Perm('complaints', 'c') @Post('complaints/:id/comments')
  comment(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: CommentDto) { return this.svc.comment(u, id, dto); }

  @Perm('announcements', 'v') @Get('announcements')
  announcements(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.svc.listAnnouncements(u, q); }
  @Perm('announcements', 'c') @Post('announcements')
  createAnnouncement(@CurrentUser() u: AuthUser, @Body() dto: AnnouncementDto) { return this.svc.createAnnouncement(u, dto); }
  @Perm('announcements', 'd') @HttpCode(204) @Delete('announcements/:id')
  deleteAnnouncement(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.deleteAnnouncement(u, id); }
}
