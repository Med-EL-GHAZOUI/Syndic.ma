import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { PeriodService } from './period.service';
import { ScopeService } from './scope.service';
import { AuditLog, PeriodClosure, Residence, Resident, Unit } from '../entities';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Residence, Resident, Unit, PeriodClosure])],
  providers: [AuditService, ScopeService, PeriodService],
  exports: [AuditService, ScopeService, PeriodService],
})
export class CommonModule {}
