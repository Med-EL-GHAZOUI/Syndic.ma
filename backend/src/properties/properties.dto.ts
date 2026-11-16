import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

const PHONE = /^(\+212|0)[5-7]\d{8}$/;
import { Matches } from 'class-validator';

export class ResidenceDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsString() @MaxLength(80) city: string;
  @IsString() @MaxLength(200) address: string;
  @IsOptional() @IsInt() @Min(1900) @Max(2100) yearBuilt?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) monthlyFee?: number;
}

export class BuildingDto {
  @IsUUID() residenceId: string;
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsInt() @Min(1) @Max(60) floors: number;
  @IsOptional() @IsBoolean() elevator?: boolean;
}

export class UnitDto {
  @IsUUID() buildingId: string;
  @IsString() @MinLength(1) @MaxLength(12) number: string;
  @IsInt() @Min(-5) @Max(60) floor: number;
  @IsIn(['apartment', 'shop', 'office', 'parking']) type: 'apartment' | 'shop' | 'office' | 'parking';
  @IsOptional() @IsInt() @Min(0) @Max(30) rooms?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(5000) area: number;
  @IsInt() @Min(0) @Max(100000) tantiemes: number;
}

export class UnitQuery extends PageQuery {
  @IsOptional() @IsUUID() residenceId?: string;
  @IsOptional() @IsUUID() buildingId?: string;
}

export class ResidentDto {
  @IsUUID() unitId: string;
  @IsIn(['owner', 'tenant']) type: 'owner' | 'tenant';
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;
  @IsOptional() @Matches(PHONE, { message: 'phone must be a Moroccan number (e.g. 0612345678 or +212612345678)' }) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsDateString({ strict: true }) since: string;
  @IsOptional() @IsBoolean() livesIn?: boolean;
}

export class EndOccupancyDto {
  @IsDateString({ strict: true }) until: string;
}

export class ResidentQuery extends PageQuery {
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() active?: boolean;
}
