import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Allocation, BankLine, CallForFunds, Charge, Payment, PeriodClosure, Resident } from '../entities';
import { ClosuresService } from './closures.service';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [TypeOrmModule.forFeature([CallForFunds, Charge, Payment, Allocation, Resident, BankLine, PeriodClosure])],
  controllers: [FinanceController, ReconciliationController],
  providers: [FinanceService, ReconciliationService, ClosuresService],
})
export class FinanceModule {}
