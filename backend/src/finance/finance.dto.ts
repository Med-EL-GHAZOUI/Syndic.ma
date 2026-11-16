import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class CallDto {
  @IsUUID() residenceId: string;
  @IsString() @MinLength(2) @MaxLength(100) title: string;
  @IsString() @MinLength(2) @MaxLength(20) period: string;
  @IsDateString({ strict: true }) dueDate: string;
  @IsIn(['tantiemes', 'fixed']) basis: 'tantiemes' | 'fixed';
  @ValidateIf((o) => o.basis === 'tantiemes') @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) totalAmount?: number;
  @ValidateIf((o) => o.basis === 'fixed') @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amountPerUnit?: number;
}

export class PaymentDto {
  @IsUUID() unitId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsDateString({ strict: true }) date: string;
  @IsIn(['transfer', 'cheque', 'cash']) method: 'transfer' | 'cheque' | 'cash';
  @IsOptional() @IsString() @MaxLength(60) reference?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(240) reason: string;
}

export class ChargeQuery extends PageQuery {
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsUUID() callId?: string;
  @IsOptional() @IsIn(['paid', 'partial', 'overdue', 'unpaid']) status?: string;
}

export class PaymentQuery extends PageQuery {
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsIn(['pending', 'recorded', 'reversed', 'rejected']) status?: string;
}

export class SummaryQuery {
  @IsOptional() @IsUUID() residenceId?: string;
}
