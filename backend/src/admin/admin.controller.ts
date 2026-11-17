import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Perm } from '../common/auth-user';
import { AuditQuery, CreateUserDto, OrganizationDto, UpdateUserDto } from './admin.dto';
import { AdminService } from './admin.service';

const uuid = new ParseUUIDPipe();

@ApiTags('administration')
@ApiBearerAuth()
@Controller()
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Perm('users', 'v') @Get('users')
  users(@CurrentUser() u: AuthUser) { return this.svc.listUsers(u); }
  @Perm('users', 'c') @Post('users')
  createUser(@CurrentUser() u: AuthUser, @Body() dto: CreateUserDto) { return this.svc.createUser(u, dto); }
  @Perm('users', 'e') @Patch('users/:id')
  updateUser(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: UpdateUserDto) { return this.svc.updateUser(u, id, dto); }

  @Perm('users', 'e') @HttpCode(204) @Post('users/:id/mfa-reset')
  resetMfa(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) { return this.svc.resetMfa(u, id); }

  @Perm('platform', 'v') @Get('platform/organizations')
  orgs() { return this.svc.listOrgs(); }
  @Perm('platform', 'c') @Post('platform/organizations')
  createOrg(@CurrentUser() u: AuthUser, @Body() dto: OrganizationDto) { return this.svc.createOrg(u, dto); }
  @Perm('platform', 'e') @Put('platform/organizations/:id')
  updateOrg(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body() dto: OrganizationDto) { return this.svc.updateOrg(u, id, dto); }

  @Perm('audit', 'v') @Get('audit')
  audit(@CurrentUser() u: AuthUser, @Query() q: AuditQuery) { return this.svc.listAudit(u, q); }
}
