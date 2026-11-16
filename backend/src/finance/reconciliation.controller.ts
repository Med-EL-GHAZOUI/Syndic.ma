import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Perm } from '../common/auth-user';
import { ClosuresService } from './closures.service';
import { ReasonDto, SummaryQuery } from './finance.dto';
import { AutoMatchDto, CloseDto, ImportDto, LinesQuery, MatchDto } from './reconciliation.dto';
import { ReconciliationService } from './reconciliation.service';

const uuid = new ParseUUIDPipe();

@ApiTags('reconciliation')
@ApiBearerAuth()
@Controller()
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService, private readonly closures: ClosuresService) {}

  @Perm('reconciliation', 'v') @Get('reconciliation/lines')
  lines(@CurrentUser() u: AuthUser, @Query() q: LinesQuery) { return this.svc.list(u, q); }

  @Perm('reconciliation', 'v') @Get('reconciliation/summary')
  summary(@CurrentUser() u: AuthUser, @Query() q: SummaryQuery) { return this.svc.summary(u, q.residenceId); }

  @Perm('reconciliation', 'c') @Post('reconciliation/import')
  import(@CurrentUser() u: AuthUser, @Body() dto: ImportDto) { return this.svc.importCsv(u, dto); }

  @Perm('reconciliation', 'x') @HttpCode(200) @Post('reconciliation/auto')
  auto(@CurrentUser() u: AuthUser, @Body() dto: AutoMatchDto) { return this.svc.autoMatch(u, dto.residenceId); }

  @Perm('reconciliation', 'x') @HttpCode(200) @Post('reconciliation/lines/:id/match')
  match(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: MatchDto) { return this.svc.match(u, id, dto.paymentId); }

  @Perm('reconciliation', 'x') @HttpCode(200) @Post('reconciliation/lines/:id/unmatch')
  unmatch(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReasonDto) { return this.svc.unmatch(u, id, dto.reason); }

  @Perm('reconciliation', 'x') @HttpCode(200) @Post('reconciliation/lines/:id/ignore')
  ignore(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReasonDto) { return this.svc.ignore(u, id, dto.reason); }

  @Perm('reconciliation', 'v') @Get('finance/closures')
  listClosures(@CurrentUser() u: AuthUser) { return this.closures.list(u); }

  @Perm('finance', 'e') @Post('finance/closures')
  close(@CurrentUser() u: AuthUser, @Body() dto: CloseDto) { return this.closures.close(u, dto); }
}
