import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

// super_admin is intentionally NOT assignable here: platform admins are provisioned out of band.
const ORG_ROLES = ['syndic_admin', 'manager', 'accountant', 'owner', 'tenant', 'provider'] as const;

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsEmail() @MaxLength(200) email: string;
  /** Initial password; the user must change it. Min 12 chars. */
  @IsString() @MinLength(12) @MaxLength(128) password: string;
  @IsIn(ORG_ROLES as unknown as string[]) role: (typeof ORG_ROLES)[number];
  @IsOptional() @IsUUID('4', { each: true }) residenceIds?: string[];
  @IsOptional() @IsUUID() providerId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsIn(ORG_ROLES as unknown as string[]) role?: (typeof ORG_ROLES)[number];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsUUID('4', { each: true }) residenceIds?: string[];
}

export class OrganizationDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsIn(['starter', 'pro', 'business']) plan: string;
  @IsIn(['trial', 'active', 'suspended']) status: 'trial' | 'active' | 'suspended';
}

export class AuditQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(40) action?: string;
  @IsOptional() @IsString() @MaxLength(40) entity?: string;
}
