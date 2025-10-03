import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, IsDateString, IsUUID } from 'class-validator';
import { UserType, RateLimitTier, ComplianceLevel, MarketplacePermission } from '../../domain/enums';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(UserType)
  userType: UserType;

  @IsUUID()
  userId: string;

  @IsEnum(RateLimitTier)
  @IsOptional()
  rateLimitTier?: RateLimitTier;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;

  @IsUUID()
  @IsOptional()
  consumerId?: string;

  @IsString()
  @IsOptional()
  marketplaceContext?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedRegions?: string[];

  @IsEnum(ComplianceLevel)
  @IsOptional()
  complianceLevel?: ComplianceLevel;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedIps?: string[];

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsArray()
  @IsEnum(MarketplacePermission, { each: true })
  @IsOptional()
  customPermissions?: MarketplacePermission[];
}

export class CreateTemporaryApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(UserType)
  userType: UserType;

  @IsUUID()
  userId: string;

  @IsNotEmpty()
  durationHours: number;

  @IsArray()
  @IsEnum(MarketplacePermission, { each: true })
  permissions: MarketplacePermission[];

  @IsString()
  @IsOptional()
  campaignContext?: string;
}

export class UpdateApiKeyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedIps?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedRegions?: string[];

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class ApiKeyResponseDto {
  id: string;
  keyId: string;
  name: string;
  userType: UserType;
  status: string;
  rateLimitTier: RateLimitTier;
  permissions: MarketplacePermission[];
  createdAt: Date;
  expiresAt?: Date;
  credentials?: string; // Only included on creation
}

export class ListApiKeysQueryDto {
  @IsEnum(UserType)
  @IsOptional()
  userType?: UserType;

  @IsString()
  @IsOptional()
  status?: string;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsUUID()
  @IsOptional()
  storeId?: string;
}

export class ApiKeyUsageStatsDto {
  requestsLastMinute: number;
  requestsLastHour: number;
  requestsLastDay: number;
  topEndpoints: { endpoint: string; requests: number }[];
}

export class RateLimitStatusDto {
  endpoint: string;
  limit: number;
  remaining: number;
  resetTime: Date;
  period: string;
}