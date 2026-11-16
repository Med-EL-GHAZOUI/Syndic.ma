import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class ProviderDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsIn(['plumbing', 'electricity', 'elevator', 'cleaning', 'security', 'gardening', 'painting', 'general']) category: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) contactName?: string;
  @IsOptional() @Matches(/^(\+212|0)[5-7]\d{8}$/) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(/^\d{15}$/, { message: 'ICE must be 15 digits' }) ice?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ExpenseDto {
  @IsUUID() residenceId: string;
  @IsIn(['cleaning', 'security', 'elevator', 'electricity', 'water', 'gardening', 'repairs', 'insurance', 'admin', 'other']) category: string;
  @IsString() @MinLength(2) @MaxLength(150) label: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsDateString({ strict: true }) date: string;
  @IsOptional() @IsUUID() providerId?: string;
  @IsOptional() @IsString() @MaxLength(40) invoiceRef?: string;
}

export class ExpenseQuery extends PageQuery {
  @IsOptional() @IsIn(['pending', 'approved', 'paid', 'cancelled']) status?: string;
}

export class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(240) reason: string;
}

export class ComplaintDto {
  @IsOptional() @IsUUID() residenceId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsString() @MinLength(3) @MaxLength(120) title: string;
  @IsIn(['plumbing', 'electricity', 'elevator', 'cleaning', 'noise', 'security', 'parking', 'other']) category: string;
  @IsIn(['low', 'medium', 'high', 'urgent']) priority: string;
  @IsString() @MinLength(3) @MaxLength(2000) description: string;
}

export class ComplaintStatusDto {
  @IsIn(['new', 'in_progress', 'resolved', 'closed']) status: 'new' | 'in_progress' | 'resolved' | 'closed';
}

export class CommentDto {
  @IsString() @MinLength(1) @MaxLength(1000) text: string;
}

export class AnnouncementDto {
  @IsUUID() residenceId: string;
  @IsString() @MinLength(3) @MaxLength(150) title: string;
  @IsString() @MinLength(3) @MaxLength(4000) body: string;
  @IsIn(['info', 'works', 'meeting', 'urgent']) category: string;
  @IsIn(['all', 'owners', 'staff']) audience: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}
