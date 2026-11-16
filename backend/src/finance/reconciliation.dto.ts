import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class ImportDto {
  @IsUUID() residenceId: string;
  /** CSV text, max ~500 KB (a statement of a few thousand lines). */
  @IsString() @MinLength(10) @MaxLength(500_000) csv: string;
}

export class MatchDto {
  @IsUUID() paymentId: string;
}

export class AutoMatchDto {
  @IsUUID() residenceId: string;
}

export class LinesQuery extends PageQuery {
  @IsOptional() @IsUUID() residenceId?: string;
  @IsOptional() @IsIn(['unmatched', 'matched', 'ignored']) status?: string;
}

export class CloseDto {
  @IsUUID() residenceId: string;
  @IsDateString({ strict: true }) closedThrough: string;
}
