import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, Organization, Residence, User } from '../entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Organization, Residence, AuditLog])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
