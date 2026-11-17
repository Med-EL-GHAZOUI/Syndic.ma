import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth-user';
import { NotificationQuery } from './notifications.dto';
import { NotificationsService } from './notifications.service';

/** No @Perm on purpose: every signed-in user has notifications, and only ever sees their own. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: NotificationQuery) { return this.svc.list(u, q); }
  @Get('unread-count') unread(@CurrentUser() u: AuthUser) { return this.svc.unreadCount(u); }
  @HttpCode(200) @Post('read-all') readAll(@CurrentUser() u: AuthUser) { return this.svc.markAllRead(u); }
  @HttpCode(200) @Post(':id/read') read(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.svc.markRead(u, id); }
}
