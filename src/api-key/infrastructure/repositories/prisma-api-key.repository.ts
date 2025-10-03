import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { 
  ApiKeyRepository, 
  ApiKeyUsageLogRepository, 
  ApiKeyRateLimitRepository,
  ApiKeyAnalyticsRepository 
} from '../../domain/repositories';
import { 
  ApiKeyEntity, 
  ApiKeyUsageLogEntity, 
  ApiKeyRateLimitEntity,
  ApiKeyPermissionEntity 
} from '../../domain/entities';
import { UserType, ApiKeyStatus, RateLimitTier } from '../../domain/enums';
import { Prisma } from '@prisma/client';

@Injectable()
export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(apiKey: ApiKeyEntity): Promise<ApiKeyEntity> {
    const created = await this.prisma.apiKey.create({
      data: {
        id: apiKey.id,
        key_id: apiKey.keyId,
        secret_hash: apiKey.secretHash,
        name: apiKey.name,
        user_type: apiKey.userType as any,
        user_id: apiKey.userId,
        status: apiKey.status as any,
        rate_limit_tier: apiKey.rateLimitTier as any,
        tenant_id: apiKey.tenantId,
        store_id: apiKey.storeId,
        consumer_id: apiKey.consumerId,
        marketplace_context: apiKey.marketplaceContext,
        allowed_regions: apiKey.allowedRegions,
        compliance_level: apiKey.complianceLevel as any,
        allowed_ips: apiKey.allowedIps,
        webhook_signature_secret: apiKey.webhookSignatureSecret,
        expires_at: apiKey.expiresAt,
        created_at: apiKey.createdAt,
        updated_at: apiKey.updatedAt,
        last_used_at: apiKey.lastUsedAt,
      },
      include: {
        permissions: true,
        rate_limits: true,
      },
    });

    return this.mapToEntity(created);
  }

  async findById(id: string): Promise<ApiKeyEntity | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
      include: {
        permissions: true,
        rate_limits: true,
      },
    });

    return apiKey ? this.mapToEntity(apiKey) : null;
  }

  async findByKeyId(keyId: string): Promise<ApiKeyEntity | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { key_id: keyId },
      include: {
        permissions: true,
        rate_limits: true,
      },
    });

    return apiKey ? this.mapToEntity(apiKey) : null;
  }

  async findByUserId(userId: string): Promise<ApiKeyEntity[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { user_id: userId },
      include: {
        permissions: true,
        rate_limits: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return apiKeys.map(this.mapToEntity);
  }

  async findActiveByKeyId(keyId: string): Promise<ApiKeyEntity | null> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        key_id: keyId,
        status: 'ACTIVE',
        OR: [
          { expires_at: null },
          { expires_at: { gt: new Date() } },
        ],
      },
      include: {
        permissions: true,
        rate_limits: true,
      },
    });

    return apiKey ? this.mapToEntity(apiKey) : null;
  }

  async findByUserIdAndType(userId: string, userType: UserType): Promise<ApiKeyEntity[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { 
        user_id: userId,
        user_type: userType as any,
      },
      include: {
        permissions: true,
        rate_limits: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return apiKeys.map(this.mapToEntity);
  }

  async findByTenant(tenantId: string): Promise<ApiKeyEntity[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { tenant_id: tenantId },
      include: {
        permissions: true,
        rate_limits: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return apiKeys.map(this.mapToEntity);
  }

  async findByStore(storeId: string): Promise<ApiKeyEntity[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { store_id: storeId },
      include: {
        permissions: true,
        rate_limits: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return apiKeys.map(this.mapToEntity);
  }

  async findExpiredKeys(): Promise<ApiKeyEntity[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        expires_at: { lt: new Date() },
        status: { not: 'EXPIRED' },
      },
      include: {
        permissions: true,
        rate_limits: true,
      },
    });

    return apiKeys.map(this.mapToEntity);
  }

  async findUnusedKeys(daysUnused: number): Promise<ApiKeyEntity[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysUnused);

    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        OR: [
          { last_used_at: null },
          { last_used_at: { lt: cutoffDate } },
        ],
        status: 'ACTIVE',
      },
      include: {
        permissions: true,
        rate_limits: true,
      },
    });

    return apiKeys.map(this.mapToEntity);
  }

  async findByTenantAndType(tenantId: string, userType: UserType): Promise<ApiKeyEntity[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: { 
        tenant_id: tenantId,
        user_type: userType as any,
      },
      include: {
        permissions: true,
        rate_limits: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return apiKeys.map(this.mapToEntity);
  }

  async findAll(offset: number, limit: number): Promise<{
    data: ApiKeyEntity[];
    total: number;
  }> {
    const [apiKeys, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        skip: offset,
        take: limit,
        include: {
          permissions: true,
          rate_limits: true,
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.apiKey.count(),
    ]);

    return {
      data: apiKeys.map(this.mapToEntity),
      total,
    };
  }

  async update(apiKey: ApiKeyEntity): Promise<ApiKeyEntity> {
    const updated = await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        name: apiKey.name,
        status: apiKey.status as any,
        rate_limit_tier: apiKey.rateLimitTier as any,
        tenant_id: apiKey.tenantId,
        store_id: apiKey.storeId,
        consumer_id: apiKey.consumerId,
        marketplace_context: apiKey.marketplaceContext,
        allowed_regions: apiKey.allowedRegions,
        compliance_level: apiKey.complianceLevel as any,
        allowed_ips: apiKey.allowedIps,
        webhook_signature_secret: apiKey.webhookSignatureSecret,
        expires_at: apiKey.expiresAt,
        updated_at: new Date(),
        last_used_at: apiKey.lastUsedAt,
      },
      include: {
        permissions: true,
        rate_limits: true,
      },
    });

    return this.mapToEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.apiKey.delete({
      where: { id },
    });
  }

  async bulkUpdateStatus(keyIds: string[], status: ApiKeyStatus): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id: { in: keyIds } },
      data: { 
        status: status as any,
        updated_at: new Date(),
      },
    });
  }

  async bulkDelete(keyIds: string[]): Promise<void> {
    await this.prisma.apiKey.deleteMany({
      where: { id: { in: keyIds } },
    });
  }

  private mapToEntity(data: any): ApiKeyEntity {
    return new ApiKeyEntity(
      data.id,
      data.key_id,
      data.secret_hash,
      data.name,
      data.user_type as UserType,
      data.user_id,
      data.status as ApiKeyStatus,
      data.rate_limit_tier as RateLimitTier,
      data.allowed_regions || [],
      data.compliance_level,
      data.allowed_ips || [],
      data.permissions?.map((p: any) => new ApiKeyPermissionEntity(
        p.id,
        p.api_key_id,
        p.permission,
        p.resource_type,
        p.granted_at,
      )) || [],
      data.rate_limits?.map((rl: any) => new ApiKeyRateLimitEntity(
        rl.id,
        rl.api_key_id,
        rl.endpoint_pattern,
        rl.requests_per_minute,
        rl.requests_per_hour,
        rl.requests_per_day,
        rl.burst_limit,
        rl.created_at,
        rl.updated_at,
      )) || [],
      data.created_at,
      data.updated_at,
      data.tenant_id,
      data.store_id,
      data.consumer_id,
      data.marketplace_context,
      data.webhook_signature_secret,
      data.expires_at,
      data.last_used_at,
    );
  }
}