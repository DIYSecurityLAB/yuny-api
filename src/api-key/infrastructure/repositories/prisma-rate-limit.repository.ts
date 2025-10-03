import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ApiKeyRateLimitRepository } from '../../domain/repositories';
import { ApiKeyRateLimitEntity } from '../../domain/entities';
import { RateLimitTier } from '../../domain/enums';

@Injectable()
export class PrismaApiKeyRateLimitRepository implements ApiKeyRateLimitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(rateLimit: ApiKeyRateLimitEntity): Promise<ApiKeyRateLimitEntity> {
    const created = await this.prisma.apiKeyRateLimit.create({
      data: {
        id: rateLimit.id,
        api_key_id: rateLimit.apiKeyId,
        endpoint_pattern: rateLimit.endpointPattern,
        requests_per_minute: rateLimit.requestsPerMinute,
        requests_per_hour: rateLimit.requestsPerHour,
        requests_per_day: rateLimit.requestsPerDay,
        burst_limit: rateLimit.burstLimit,
        created_at: rateLimit.createdAt,
        updated_at: rateLimit.updatedAt,
      },
    });

    return this.mapToEntity(created);
  }

  async findById(id: string): Promise<ApiKeyRateLimitEntity | null> {
    const rateLimit = await this.prisma.apiKeyRateLimit.findUnique({
      where: { id },
    });

    return rateLimit ? this.mapToEntity(rateLimit) : null;
  }

  async findByApiKeyId(apiKeyId: string): Promise<ApiKeyRateLimitEntity[]> {
    const rateLimits = await this.prisma.apiKeyRateLimit.findMany({
      where: { api_key_id: apiKeyId },
      orderBy: { endpoint_pattern: 'asc' },
    });

    return rateLimits.map(this.mapToEntity);
  }

  async findByApiKeyIdAndEndpoint(
    apiKeyId: string,
    endpoint: string
  ): Promise<ApiKeyRateLimitEntity | null> {
    // Find the most specific matching pattern
    const rateLimits = await this.prisma.apiKeyRateLimit.findMany({
      where: { api_key_id: apiKeyId },
    });

    // Find the best matching pattern
    const matchingLimit = rateLimits.find(rl => {
      const pattern = rl.endpoint_pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(endpoint);
    });

    return matchingLimit ? this.mapToEntity(matchingLimit) : null;
  }

  async findByEndpointPattern(pattern: string): Promise<ApiKeyRateLimitEntity[]> {
    const rateLimits = await this.prisma.apiKeyRateLimit.findMany({
      where: { endpoint_pattern: pattern },
    });

    return rateLimits.map(this.mapToEntity);
  }

  async findByTier(tier: RateLimitTier): Promise<ApiKeyRateLimitEntity[]> {
    const rateLimits = await this.prisma.apiKeyRateLimit.findMany({
      where: {
        api_key: {
          rate_limit_tier: tier as any,
        },
      },
      include: {
        api_key: true,
      },
    });

    return rateLimits.map(this.mapToEntity);
  }

  async update(rateLimit: ApiKeyRateLimitEntity): Promise<ApiKeyRateLimitEntity> {
    const updated = await this.prisma.apiKeyRateLimit.update({
      where: { id: rateLimit.id },
      data: {
        endpoint_pattern: rateLimit.endpointPattern,
        requests_per_minute: rateLimit.requestsPerMinute,
        requests_per_hour: rateLimit.requestsPerHour,
        requests_per_day: rateLimit.requestsPerDay,
        burst_limit: rateLimit.burstLimit,
        updated_at: new Date(),
      },
    });

    return this.mapToEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.apiKeyRateLimit.delete({
      where: { id },
    });
  }

  async bulkCreateForApiKey(
    apiKeyId: string,
    rateLimits: Omit<ApiKeyRateLimitEntity, 'id' | 'apiKeyId'>[]
  ): Promise<ApiKeyRateLimitEntity[]> {
    const createData = rateLimits.map(rl => ({
      api_key_id: apiKeyId,
      endpoint_pattern: rl.endpointPattern,
      requests_per_minute: rl.requestsPerMinute,
      requests_per_hour: rl.requestsPerHour,
      requests_per_day: rl.requestsPerDay,
      burst_limit: rl.burstLimit,
      created_at: rl.createdAt,
      updated_at: rl.updatedAt,
    }));

    await this.prisma.apiKeyRateLimit.createMany({
      data: createData,
    });

    // Return the created rate limits
    return await this.findByApiKeyId(apiKeyId);
  }

  async bulkUpdateForTier(
    tier: RateLimitTier,
    updates: Partial<ApiKeyRateLimitEntity>
  ): Promise<void> {
    const updateData: any = {};
    
    if (updates.requestsPerMinute !== undefined) {
      updateData.requests_per_minute = updates.requestsPerMinute;
    }
    if (updates.requestsPerHour !== undefined) {
      updateData.requests_per_hour = updates.requestsPerHour;
    }
    if (updates.requestsPerDay !== undefined) {
      updateData.requests_per_day = updates.requestsPerDay;
    }
    if (updates.burstLimit !== undefined) {
      updateData.burst_limit = updates.burstLimit;
    }

    updateData.updated_at = new Date();

    await this.prisma.apiKeyRateLimit.updateMany({
      where: {
        api_key: {
          rate_limit_tier: tier as any,
        },
      },
      data: updateData,
    });
  }

  private mapToEntity(data: any): ApiKeyRateLimitEntity {
    return new ApiKeyRateLimitEntity(
      data.id,
      data.api_key_id,
      data.endpoint_pattern,
      data.requests_per_minute,
      data.requests_per_hour,
      data.requests_per_day,
      data.burst_limit,
      data.created_at,
      data.updated_at,
    );
  }
}