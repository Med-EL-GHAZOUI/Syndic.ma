import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Perm } from '../common/auth-user';
import { PageQuery } from '../common/pagination';
import { CallDto, ChargeQuery, PaymentDto, PaymentQuery, ReasonDto, SummaryQuery } from './finance.dto';
import { FinanceService } from './finance.service';

const uuid = new ParseUUIDPipe();

@ApiTags('finance')
@ApiBearerAuth()
@Controller()
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  @Perm('finance', 'v') @Get('calls')
  listCalls(@CurrentUser() u: AuthUser, @Query() q: PageQuery) { return this.svc.listCalls(u, q); }

  @Perm('finance', 'c') @Post('calls')
  createCall(@CurrentUser() u: AuthUser, @Body() dto: CallDto) { return this.svc.createCall(u, dto); }

  @Perm('finance', 'e') @HttpCode(200) @Post('calls/:id/issue')
  issue(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.issueCall(u, id); }

  @Perm('finance', 'e') @HttpCode(200) @Post('calls/:id/close')
  close(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.closeCall(u, id); }

  @Perm('finance', 'd') @HttpCode(204) @Delete('calls/:id')
  removeDraft(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.deleteDraftCall(u, id); }

  @Perm('finance', 'v') @Get('charges')
  charges(@CurrentUser() u: AuthUser, @Query() q: ChargeQuery) { return this.svc.listCharges(u, q); }

  @Perm('finance', 'v') @Get('units/:id/statement')
  statement(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.statement(u, id); }

  @Perm('reports', 'v') @Get('finance/summary')
  summary(@CurrentUser() u: AuthUser, @Query() q: SummaryQuery) { return this.svc.summary(u, q.residenceId); }

  @Perm('payments', 'v') @Get('payments')
  payments(@CurrentUser() u: AuthUser, @Query() q: PaymentQuery) { return this.svc.listPayments(u, q); }

  @Perm('payments', 'c') @Post('payments')
  record(@CurrentUser() u: AuthUser, @Body() dto: PaymentDto) { return this.svc.record(u, dto); }

  @Perm('payments', 'c') @Post('payments/declare')
  declare(@CurrentUser() u: AuthUser, @Body() dto: PaymentDto) { return this.svc.declare(u, dto); }

  @Perm('payments', 'x') @HttpCode(200) @Post('payments/:id/confirm')
  confirm(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.confirm(u, id); }

  @Perm('payments', 'x') @HttpCode(200) @Post('payments/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReasonDto) { return this.svc.reject(u, id, dto.reason); }

  @Perm('payments', 'x') @HttpCode(200) @Post('payments/:id/reverse')
  reverse(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReasonDto) { return this.svc.reverse(u, id, dto.reason); }
}
