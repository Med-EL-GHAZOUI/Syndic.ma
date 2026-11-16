import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Allocation, CallForFunds, Charge, Payment, Resident } from '../entities';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [TypeOrmModule.forFeature([CallForFunds, Charge, Payment, Allocation, Resident])],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
