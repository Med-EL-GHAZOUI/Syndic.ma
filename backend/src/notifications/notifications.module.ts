import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification, Resident, User } from '../entities';
import { JobsService } from './jobs.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Global: business modules (finance, ops, community) inject NotificationsService to notify without importing it. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Notification, Resident, User])],
  controllers: [NotificationsController],
  providers: [NotificationsService, JobsService],
  exports: [NotificationsService, JobsService],
})
export class NotificationsModule {}
