import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { ScopeService } from './scope.service';
import { AuditLog, Residence, Resident, Unit } from '../entities';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Residence, Resident, Unit])],
  providers: [AuditService, ScopeService],
  exports: [AuditService, ScopeService],
})
export class CommonModule {}
