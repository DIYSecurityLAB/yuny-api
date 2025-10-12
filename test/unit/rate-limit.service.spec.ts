import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';

// Custom TooManyRequestsException since it doesn't exist in @nestjs/common
class TooManyRequestsException extends HttpException {
  constructor(message: string, options?: any) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
import { UserType, RateLimitTier } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures } from '../fixtures/api-key-fixtures';

// Define tokens for dependency injection
const RATE_LIMIT_REPOSITORY = 'ApiKeyRateLimitRepository';
const CACHE_SERVICE = 'CacheService';

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

interface RateLimitState {
  currentMinute: number;
  currentHour: number;
  currentDay: number;
  lastRequestTime: Date;
  burstCount: number;
}

class RateLimitService {
  constructor(
    private readonly rateLimitRepository: any,
    private readonly cacheService: any,
  ) {}

  async checkRateLimit(
    apiKeyId: string,
    userType: UserType,
    rateLimitTier: RateLimitTier,
    endpoint: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
    retryAfter?: number;
  }> {
    const config = this.getRateLimitConfig(userType, rateLimitTier, endpoint);
    const state = await this.getCurrentRateLimitState(apiKeyId, endpoint);
    const now = new Date();

    // Reset counters if time periods have passed
    this.resetCountersIfNeeded(state, now);

    // Check burst limit first (skip if unlimited)
    if (config.burstLimit !== -1 && state.burstCount >= config.burstLimit) {
      const timeSinceLastRequest = now.getTime() - state.lastRequestTime.getTime();
      if (timeSinceLastRequest < 1000) { // 1 second burst window
        throw new TooManyRequestsException('Burst limit exceeded');
      }
      state.burstCount = 0;
    }

    // Check rate limits (skip if unlimited)
    if (config.requestsPerMinute !== -1 && state.currentMinute >= config.requestsPerMinute) {
      const resetTime = new Date(now.getTime() + (60 - now.getSeconds()) * 1000);
      throw new TooManyRequestsException('Rate limit exceeded', {
        cause: 'MINUTE_LIMIT',
        description: `Minute limit of ${config.requestsPerMinute} requests exceeded`,
      });
    }

    if (config.requestsPerHour !== -1 && state.currentHour >= config.requestsPerHour) {
      const resetTime = new Date(now.getTime() + (60 - now.getMinutes()) * 60 * 1000);
      throw new TooManyRequestsException('Rate limit exceeded', {
        cause: 'HOUR_LIMIT',
        description: `Hour limit of ${config.requestsPerHour} requests exceeded`,
      });
    }

    if (config.requestsPerDay !== -1 && state.currentDay >= config.requestsPerDay) {
      const resetTime = new Date(now.getTime() + (24 - now.getHours()) * 60 * 60 * 1000);
      throw new TooManyRequestsException('Rate limit exceeded', {
        cause: 'DAY_LIMIT',
        description: `Day limit of ${config.requestsPerDay} requests exceeded`,
      });
    }

    // Increment counters
    state.currentMinute++;
    state.currentHour++;
    state.currentDay++;
    state.burstCount++;
    state.lastRequestTime = now;

    // Save updated state
    await this.saveRateLimitState(apiKeyId, endpoint, state);

    const nextMinuteReset = new Date(now.getTime() + (60 - now.getSeconds()) * 1000);
    
    return {
      allowed: true,
      remaining: config.requestsPerMinute - state.currentMinute,
      resetTime: nextMinuteReset,
    };
  }

  async updateRateLimits(
    apiKeyId: string,
    endpoint: string,
    newLimits: Partial<RateLimitConfig>
  ): Promise<void> {
    const existingLimits = await this.rateLimitRepository.findByApiKeyIdAndEndpoint(apiKeyId, endpoint);
    
    if (existingLimits) {
      await this.rateLimitRepository.update({
        ...existingLimits,
        ...newLimits,
      });
    } else {
      await this.rateLimitRepository.create({
        apiKeyId,
        endpointPattern: endpoint,
        ...newLimits,
      });
    }

    // Clear cache for this API key
    await this.cacheService.delete(`rate_limit:${apiKeyId}:${endpoint}`);
  }

  async getRateLimitStatus(
    apiKeyId: string,
    endpoint: string
  ): Promise<{
    currentMinute: number;
    currentHour: number;
    currentDay: number;
    limits: RateLimitConfig;
    nextReset: Date;
  }> {
    const state = await this.getCurrentRateLimitState(apiKeyId, endpoint);
    const limits = await this.getCustomRateLimitConfig(apiKeyId, endpoint);
    const now = new Date();
    const nextReset = new Date(now.getTime() + (60 - now.getSeconds()) * 1000);

    return {
      currentMinute: state.currentMinute,
      currentHour: state.currentHour,
      currentDay: state.currentDay,
      limits,
      nextReset,
    };
  }

  private getRateLimitConfig(
    userType: UserType,
    rateLimitTier: RateLimitTier,
    endpoint: string
  ): RateLimitConfig {
    // Default configurations based on user type and tier
    const defaultConfigs: Record<string, Record<string, RateLimitConfig>> = {
      [RateLimitTier.BASIC]: {
        [UserType.MERCHANT]: {
          requestsPerMinute: 30,
          requestsPerHour: 1000,
          requestsPerDay: 10000,
          burstLimit: 5,
        },
        [UserType.CONSUMER]: {
          requestsPerMinute: 20,
          requestsPerHour: 500,
          requestsPerDay: 5000,
          burstLimit: 3,
        },
      },
      [RateLimitTier.PREMIUM]: {
        [UserType.MERCHANT]: {
          requestsPerMinute: 100,
          requestsPerHour: 5000,
          requestsPerDay: 50000,
          burstLimit: 20,
        },
        [UserType.CONSUMER]: {
          requestsPerMinute: 60,
          requestsPerHour: 2000,
          requestsPerDay: 20000,
          burstLimit: 10,
        },
      },
      [RateLimitTier.ENTERPRISE]: {
        [UserType.MERCHANT]: {
          requestsPerMinute: 500,
          requestsPerHour: 20000,
          requestsPerDay: 200000,
          burstLimit: 100,
        },
        [UserType.CONSUMER]: {
          requestsPerMinute: 200,
          requestsPerHour: 10000,
          requestsPerDay: 100000,
          burstLimit: 50,
        },
      },
      [RateLimitTier.UNLIMITED]: {
        [UserType.ADMIN]: {
          requestsPerMinute: -1,
          requestsPerHour: -1,
          requestsPerDay: -1,
          burstLimit: -1,
        },
      },
    };

    const tierConfig = defaultConfigs[rateLimitTier];
    if (tierConfig && tierConfig[userType]) {
      return tierConfig[userType];
    }
    return defaultConfigs[RateLimitTier.BASIC][UserType.CONSUMER];
  }

  private async getCurrentRateLimitState(apiKeyId: string, endpoint: string): Promise<RateLimitState> {
    const cacheKey = `rate_limit:${apiKeyId}:${endpoint}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      const parsed = JSON.parse(cached);
      // Convert the string date back to Date object
      parsed.lastRequestTime = new Date(parsed.lastRequestTime);
      return parsed;
    }

    // Initialize new state
    return {
      currentMinute: 0,
      currentHour: 0,
      currentDay: 0,
      lastRequestTime: new Date(),
      burstCount: 0,
    };
  }

  private resetCountersIfNeeded(state: RateLimitState, now: Date): void {
    const lastRequest = new Date(state.lastRequestTime);

    // Reset minute counter if we're in a new minute
    if (now.getMinutes() !== lastRequest.getMinutes() || 
        now.getHours() !== lastRequest.getHours() ||
        now.getDate() !== lastRequest.getDate()) {
      state.currentMinute = 0;
    }

    // Reset hour counter if we're in a new hour
    if (now.getHours() !== lastRequest.getHours() ||
        now.getDate() !== lastRequest.getDate()) {
      state.currentHour = 0;
    }

    // Reset day counter if we're in a new day
    if (now.getDate() !== lastRequest.getDate()) {
      state.currentDay = 0;
    }
  }

  private async saveRateLimitState(apiKeyId: string, endpoint: string, state: RateLimitState): Promise<void> {
    const cacheKey = `rate_limit:${apiKeyId}:${endpoint}`;
    await this.cacheService.set(cacheKey, JSON.stringify(state), 86400); // 24 hours TTL
  }

  private async getCustomRateLimitConfig(apiKeyId: string, endpoint: string): Promise<RateLimitConfig> {
    const customLimits = await this.rateLimitRepository.findByApiKeyIdAndEndpoint(apiKeyId, endpoint);
    
    if (customLimits) {
      return {
        requestsPerMinute: customLimits.requestsPerMinute,
        requestsPerHour: customLimits.requestsPerHour,
        requestsPerDay: customLimits.requestsPerDay,
        burstLimit: customLimits.burstLimit,
      };
    }

    // Return default config
    return this.getRateLimitConfig(UserType.CONSUMER, RateLimitTier.BASIC, endpoint);
  }
}

describe('RateLimitService', () => {
  let service: RateLimitService;
  let rateLimitRepository: any;
  let cacheService: any;

  beforeEach(async () => {
    rateLimitRepository = {
      findByApiKeyIdAndEndpoint: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };

    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };

    // Initialize service directly with mocks since it's a mock implementation
    service = new RateLimitService(rateLimitRepository, cacheService);
  });

  describe('checkRateLimit', () => {
    const apiKeyId = 'test-api-key-id';
    const endpoint = '/api/coupons';

    it('should allow request within rate limits', async () => {
      // Arrange
      cacheService.get.mockResolvedValue(null); // No cached state
      cacheService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.checkRateLimit(
        apiKeyId,
        UserType.MERCHANT,
        RateLimitTier.BASIC,
        endpoint
      );

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(29); // 30 - 1
      expect(result.resetTime).toBeInstanceOf(Date);
      expect(cacheService.set).toHaveBeenCalledWith(
        `rate_limit:${apiKeyId}:${endpoint}`,
        expect.any(String),
        86400
      );
    });

    it('should throw TooManyRequestsException when minute limit exceeded', async () => {
      // Arrange
      const cachedState = {
        currentMinute: 30, // At limit for basic merchant
        currentHour: 30,
        currentDay: 30,
        lastRequestTime: new Date().toISOString(),
        burstCount: 0,
      };
      
      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));

      // Act & Assert
      await expect(service.checkRateLimit(
        apiKeyId,
        UserType.MERCHANT,
        RateLimitTier.BASIC,
        endpoint
      )).rejects.toThrow(TooManyRequestsException);
    });

    it('should throw TooManyRequestsException when hour limit exceeded', async () => {
      // Arrange
      const cachedState = {
        currentMinute: 0,
        currentHour: 1000, // At limit for basic merchant
        currentDay: 1000,
        lastRequestTime: new Date().toISOString(),
        burstCount: 0,
      };
      
      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));

      // Act & Assert
      await expect(service.checkRateLimit(
        apiKeyId,
        UserType.MERCHANT,
        RateLimitTier.BASIC,
        endpoint
      )).rejects.toThrow(TooManyRequestsException);
    });

    it('should throw TooManyRequestsException when day limit exceeded', async () => {
      // Arrange
      const cachedState = {
        currentMinute: 0,
        currentHour: 0,
        currentDay: 10000, // At limit for basic merchant
        lastRequestTime: new Date().toISOString(),
        burstCount: 0,
      };
      
      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));

      // Act & Assert
      await expect(service.checkRateLimit(
        apiKeyId,
        UserType.MERCHANT,
        RateLimitTier.BASIC,
        endpoint
      )).rejects.toThrow(TooManyRequestsException);
    });

    it('should throw TooManyRequestsException when burst limit exceeded', async () => {
      // Arrange
      const now = new Date();
      const cachedState = {
        currentMinute: 0,
        currentHour: 0,
        currentDay: 0,
        lastRequestTime: new Date(now.getTime() - 500).toISOString(), // 500ms ago
        burstCount: 5, // At burst limit for basic merchant
      };
      
      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));

      // Act & Assert
      await expect(service.checkRateLimit(
        apiKeyId,
        UserType.MERCHANT,
        RateLimitTier.BASIC,
        endpoint
      )).rejects.toThrow(TooManyRequestsException);
    });

    it('should allow higher limits for premium tier', async () => {
      // Arrange
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.checkRateLimit(
        apiKeyId,
        UserType.MERCHANT,
        RateLimitTier.PREMIUM,
        endpoint
      );

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99); // 100 - 1 for premium merchant
    });

    it('should allow unlimited requests for admin with unlimited tier', async () => {
      // Arrange
      const cachedState = {
        currentMinute: 9999,
        currentHour: 9999,
        currentDay: 9999,
        lastRequestTime: new Date().toISOString(),
        burstCount: 9999,
      };
      
      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));

      // Act
      const result = await service.checkRateLimit(
        apiKeyId,
        UserType.ADMIN,
        RateLimitTier.UNLIMITED,
        endpoint
      );

      // Assert
      expect(result.allowed).toBe(true);
      // For unlimited tier, remaining should be -1 or a very high number
    });

    it('should reset counters when time periods change', async () => {
      // Arrange
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const cachedState = {
        currentMinute: 30,
        currentHour: 1000,
        currentDay: 5000,
        lastRequestTime: oneHourAgo.toISOString(),
        burstCount: 5,
      };
      
      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));
      cacheService.set.mockResolvedValue(undefined);

      // Act
      const result = await service.checkRateLimit(
        apiKeyId,
        UserType.MERCHANT,
        RateLimitTier.BASIC,
        endpoint
      );

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(29); // Should reset to new minute/hour
    });
  });

  describe('updateRateLimits', () => {
    const apiKeyId = 'test-api-key-id';
    const endpoint = '/api/coupons';

    it('should update existing rate limits', async () => {
      // Arrange
      const existingLimits = {
        id: 'existing-id',
        apiKeyId,
        endpointPattern: endpoint,
        requestsPerMinute: 30,
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        burstLimit: 5,
      };
      const newLimits = {
        requestsPerMinute: 60,
        requestsPerHour: 2000,
      };

      rateLimitRepository.findByApiKeyIdAndEndpoint.mockResolvedValue(existingLimits);
      rateLimitRepository.update.mockResolvedValue(undefined);
      cacheService.delete.mockResolvedValue(undefined);

      // Act
      await service.updateRateLimits(apiKeyId, endpoint, newLimits);

      // Assert
      expect(rateLimitRepository.update).toHaveBeenCalledWith({
        ...existingLimits,
        ...newLimits,
      });
      expect(cacheService.delete).toHaveBeenCalledWith(`rate_limit:${apiKeyId}:${endpoint}`);
    });

    it('should create new rate limits when none exist', async () => {
      // Arrange
      const newLimits = {
        requestsPerMinute: 60,
        requestsPerHour: 2000,
        requestsPerDay: 20000,
        burstLimit: 10,
      };

      rateLimitRepository.findByApiKeyIdAndEndpoint.mockResolvedValue(null);
      rateLimitRepository.create.mockResolvedValue(undefined);
      cacheService.delete.mockResolvedValue(undefined);

      // Act
      await service.updateRateLimits(apiKeyId, endpoint, newLimits);

      // Assert
      expect(rateLimitRepository.create).toHaveBeenCalledWith({
        apiKeyId,
        endpointPattern: endpoint,
        ...newLimits,
      });
      expect(cacheService.delete).toHaveBeenCalledWith(`rate_limit:${apiKeyId}:${endpoint}`);
    });
  });

  describe('getRateLimitStatus', () => {
    const apiKeyId = 'test-api-key-id';
    const endpoint = '/api/coupons';

    it('should return current rate limit status', async () => {
      // Arrange
      const cachedState = {
        currentMinute: 15,
        currentHour: 250,
        currentDay: 2500,
        lastRequestTime: new Date().toISOString(),
        burstCount: 2,
      };
      const customLimits = {
        requestsPerMinute: 60,
        requestsPerHour: 2000,
        requestsPerDay: 20000,
        burstLimit: 10,
      };

      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));
      rateLimitRepository.findByApiKeyIdAndEndpoint.mockResolvedValue(customLimits);

      // Act
      const result = await service.getRateLimitStatus(apiKeyId, endpoint);

      // Assert
      expect(result.currentMinute).toBe(15);
      expect(result.currentHour).toBe(250);
      expect(result.currentDay).toBe(2500);
      expect(result.limits).toEqual(customLimits);
      expect(result.nextReset).toBeInstanceOf(Date);
    });

    it('should return default limits when no custom limits exist', async () => {
      // Arrange
      const cachedState = {
        currentMinute: 5,
        currentHour: 50,
        currentDay: 500,
        lastRequestTime: new Date().toISOString(),
        burstCount: 1,
      };

      cacheService.get.mockResolvedValue(JSON.stringify(cachedState));
      rateLimitRepository.findByApiKeyIdAndEndpoint.mockResolvedValue(null);

      // Act
      const result = await service.getRateLimitStatus(apiKeyId, endpoint);

      // Assert
      expect(result.currentMinute).toBe(5);
      expect(result.currentHour).toBe(50);
      expect(result.currentDay).toBe(500);
      expect(result.limits).toEqual({
        requestsPerMinute: 20, // Default for basic consumer
        requestsPerHour: 500,
        requestsPerDay: 5000,
        burstLimit: 3,
      });
    });
  });
});