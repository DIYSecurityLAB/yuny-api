import { Injectable } from '@nestjs/common';
import { ApiKeyUsageLogRepository, ApiKeyRateLimitRepository } from '../../domain/repositories';
import { ApiKeyRateLimitEntity } from '../../domain/entities';
import { RATE_LIMIT_CONFIGS } from '../../domain/enums';

export interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: Date;
  retryAfter?: number; // seconds
}

export interface RateLimitCheck {
  apiKeyId: string;
  endpoint: string;
  userType: string;
  rateLimitTier: string;
}

@Injectable()
export class RateLimitService {
  private readonly cache = new Map<string, {
    count: number;
    windowStart: Date;
    requests: Date[];
  }>();

  constructor(
    private readonly usageLogRepository: ApiKeyUsageLogRepository,
    private readonly rateLimitRepository: ApiKeyRateLimitRepository,
  ) {}

  /**
   * Check if request is within rate limits
   */
  async checkRateLimit(check: RateLimitCheck): Promise<RateLimitResult> {
    // Get rate limit configuration for this API key and endpoint
    const rateLimit = await this.rateLimitRepository.findByApiKeyIdAndEndpoint(
      check.apiKeyId,
      check.endpoint
    );

    if (!rateLimit) {
      // No specific rate limit, use default from config
      return this.checkDefaultRateLimit(check);
    }

    const now = new Date();
    const cacheKey = `${check.apiKeyId}:${check.endpoint}`;

    // Check different time windows
    const minuteResult = await this.checkTimeWindow(
      cacheKey,
      now,
      60 * 1000, // 1 minute
      rateLimit.requestsPerMinute
    );

    if (!minuteResult.allowed) {
      return minuteResult;
    }

    const hourResult = await this.checkTimeWindow(
      cacheKey,
      now,
      60 * 60 * 1000, // 1 hour
      rateLimit.requestsPerHour
    );

    if (!hourResult.allowed) {
      return hourResult;
    }

    const dayResult = await this.checkTimeWindow(
      cacheKey,
      now,
      24 * 60 * 60 * 1000, // 1 day
      rateLimit.requestsPerDay
    );

    if (!dayResult.allowed) {
      return dayResult;
    }

    // Check burst limit (rapid succession)
    const burstResult = await this.checkBurstLimit(
      cacheKey,
      now,
      10 * 1000, // 10 seconds
      rateLimit.burstLimit
    );

    if (!burstResult.allowed) {
      return burstResult;
    }

    // All checks passed, record the request
    this.recordRequest(cacheKey, now);

    return {
      allowed: true,
      remainingRequests: rateLimit.requestsPerMinute - this.getRequestCount(cacheKey, now, 60 * 1000),
      resetTime: new Date(now.getTime() + 60 * 1000), // Next minute
    };
  }

  /**
   * Record a successful request for rate limiting
   */
  recordRequest(cacheKey: string, timestamp: Date): void {
    const entry = this.cache.get(cacheKey) || {
      count: 0,
      windowStart: timestamp,
      requests: [],
    };

    entry.requests.push(timestamp);
    
    // Clean old requests (older than 24 hours)
    const dayAgo = new Date(timestamp.getTime() - 24 * 60 * 60 * 1000);
    entry.requests = entry.requests.filter(req => req > dayAgo);

    this.cache.set(cacheKey, entry);
  }

  /**
   * Get current usage stats for API key
   */
  async getUsageStats(apiKeyId: string): Promise<{
    requestsLastMinute: number;
    requestsLastHour: number;
    requestsLastDay: number;
    topEndpoints: { endpoint: string; requests: number }[];
  }> {
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60 * 1000);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [minuteCount, hourCount, dayCount, usageStats] = await Promise.all([
      this.usageLogRepository.countRequestsInTimeWindow(apiKeyId, '', minuteAgo, now),
      this.usageLogRepository.countRequestsInTimeWindow(apiKeyId, '', hourAgo, now),
      this.usageLogRepository.countRequestsInTimeWindow(apiKeyId, '', dayAgo, now),
      this.usageLogRepository.getUsageStats(apiKeyId, dayAgo, now),
    ]);

    return {
      requestsLastMinute: minuteCount,
      requestsLastHour: hourCount,
      requestsLastDay: dayCount,
      topEndpoints: usageStats.topEndpoints.map(ep => ({
        endpoint: ep.endpoint,
        requests: ep.count,
      })),
    };
  }

  /**
   * Get rate limit status for API key
   */
  async getRateLimitStatus(apiKeyId: string): Promise<{
    endpoint: string;
    limit: number;
    remaining: number;
    resetTime: Date;
    period: string;
  }[]> {
    const rateLimits = await this.rateLimitRepository.findByApiKeyId(apiKeyId);
    const now = new Date();

    return rateLimits.map(rl => {
      const cacheKey = `${apiKeyId}:${rl.endpointPattern}`;
      const remaining = rl.requestsPerMinute - this.getRequestCount(cacheKey, now, 60 * 1000);
      
      return {
        endpoint: rl.endpointPattern,
        limit: rl.requestsPerMinute,
        remaining: Math.max(0, remaining),
        resetTime: new Date(now.getTime() + 60 * 1000),
        period: 'minute',
      };
    });
  }

  /**
   * Update rate limits for API key
   */
  async updateRateLimits(
    apiKeyId: string,
    updates: {
      endpointPattern: string;
      requestsPerMinute?: number;
      requestsPerHour?: number;
      requestsPerDay?: number;
      burstLimit?: number;
    }[]
  ): Promise<void> {
    for (const update of updates) {
      const existing = await this.rateLimitRepository.findByApiKeyIdAndEndpoint(
        apiKeyId,
        update.endpointPattern
      );

      if (existing) {
        const updated = new ApiKeyRateLimitEntity(
          existing.id,
          existing.apiKeyId,
          existing.endpointPattern,
          update.requestsPerMinute ?? existing.requestsPerMinute,
          update.requestsPerHour ?? existing.requestsPerHour,
          update.requestsPerDay ?? existing.requestsPerDay,
          update.burstLimit ?? existing.burstLimit,
          existing.createdAt,
          new Date(), // updatedAt
        );
        
        await this.rateLimitRepository.update(updated);
      }
    }
  }

  private async checkDefaultRateLimit(check: RateLimitCheck): Promise<RateLimitResult> {
    const config = RATE_LIMIT_CONFIGS[check.rateLimitTier as keyof typeof RATE_LIMIT_CONFIGS]?.[check.userType as keyof any];
    
    if (!config) {
      return {
        allowed: true,
        remainingRequests: 1000,
        resetTime: new Date(Date.now() + 60 * 1000),
      };
    }

    const now = new Date();
    const cacheKey = `${check.apiKeyId}:default`;

    return this.checkTimeWindow(
      cacheKey,
      now,
      60 * 1000, // 1 minute
      config.requestsPerMinute
    );
  }

  private async checkTimeWindow(
    cacheKey: string,
    now: Date,
    windowMs: number,
    limit: number
  ): Promise<RateLimitResult> {
    if (limit === -1) {
      // Unlimited
      return {
        allowed: true,
        remainingRequests: -1,
        resetTime: new Date(now.getTime() + windowMs),
      };
    }

    const windowStart = new Date(now.getTime() - windowMs);
    const requestCount = this.getRequestCount(cacheKey, now, windowMs);

    if (requestCount >= limit) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: new Date(now.getTime() + windowMs),
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    return {
      allowed: true,
      remainingRequests: limit - requestCount,
      resetTime: new Date(now.getTime() + windowMs),
    };
  }

  private async checkBurstLimit(
    cacheKey: string,
    now: Date,
    windowMs: number,
    burstLimit: number
  ): Promise<RateLimitResult> {
    if (burstLimit === -1) {
      return {
        allowed: true,
        remainingRequests: -1,
        resetTime: new Date(now.getTime() + windowMs),
      };
    }

    const requestCount = this.getRequestCount(cacheKey, now, windowMs);

    if (requestCount >= burstLimit) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: new Date(now.getTime() + windowMs),
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    return {
      allowed: true,
      remainingRequests: burstLimit - requestCount,
      resetTime: new Date(now.getTime() + windowMs),
    };
  }

  private getRequestCount(cacheKey: string, now: Date, windowMs: number): number {
    const entry = this.cache.get(cacheKey);
    if (!entry) return 0;

    const windowStart = new Date(now.getTime() - windowMs);
    return entry.requests.filter(req => req >= windowStart).length;
  }

  /**
   * Clean up old cache entries
   */
  cleanupCache(): void {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const [key, entry] of this.cache.entries()) {
      entry.requests = entry.requests.filter(req => req > dayAgo);
      if (entry.requests.length === 0) {
        this.cache.delete(key);
      }
    }
  }
}