import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement, Complaint, Expense, Provider } from '../entities';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [TypeOrmModule.forFeature([Provider, Expense, Complaint, Announcement])],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
