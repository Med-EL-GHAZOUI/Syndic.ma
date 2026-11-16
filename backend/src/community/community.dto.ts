import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

// ---- documents (multipart text fields arrive as strings) ----
export class DocumentUploadDto {
  @IsUUID() residenceId: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsIn(['regulation', 'minutes', 'contract', 'invoice', 'insurance', 'plan', 'other']) category: string;
  @IsIn(['all', 'owners', 'staff']) visibility: string;
}

// ---- maintenance ----
export class WorkOrderDto {
  @IsUUID() residenceId: string;
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsIn(['corrective', 'preventive']) type: 'corrective' | 'preventive';
  @IsUUID() providerId: string;
  @IsOptional() @IsUUID() complaintId?: string;
  @IsDateString({ strict: true }) scheduledDate: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) estimatedCost?: number;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class CompleteWorkDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) actualCost: number;
  @IsOptional() @IsString() @MaxLength(600) note?: string;
  @IsOptional() @IsBoolean() createExpense?: boolean;
}

export class NoteDto {
  @IsString() @MinLength(1) @MaxLength(600) text: string;
}

export class WorkQuery extends PageQuery {
  @IsOptional() @IsIn(['planned', 'in_progress', 'done', 'cancelled']) status?: string;
}

// ---- assemblies ----
export class AssemblyDto {
  @IsUUID() residenceId: string;
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsIn(['ordinary', 'extraordinary']) type: 'ordinary' | 'extraordinary';
  @IsDateString({ strict: true }) date: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be HH:MM' }) time: string;
  @IsString() @MinLength(2) @MaxLength(150) location: string;
  @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @MaxLength(200, { each: true }) agenda: string[];
}

export class AttendanceDto {
  @IsUUID() unitId: string;
  @IsIn(['present', 'proxy', 'absent']) status: 'present' | 'proxy' | 'absent';
  @IsOptional() @IsString() @MaxLength(80) proxyTo?: string;
}

export class ResolutionDto {
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @Type(() => Number) @IsInt() @Min(0) votesFor: number;
  @Type(() => Number) @IsInt() @Min(0) votesAgainst: number;
  @Type(() => Number) @IsInt() @Min(0) abstain: number;
}

export class MinutesDto {
  @IsString() @MaxLength(10000) minutes: string;
}
