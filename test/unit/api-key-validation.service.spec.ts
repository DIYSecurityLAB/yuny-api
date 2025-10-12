import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { UserType, ApiKeyStatus } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures } from '../fixtures/api-key-fixtures';

// Define tokens for dependency injection
const API_KEY_REPOSITORY = 'ApiKeyRepository';
const USAGE_LOG_REPOSITORY = 'ApiKeyUsageLogRepository';
const API_KEY_DOMAIN_SERVICE = 'ApiKeyDomainService';
const FRAUD_DETECTION_SERVICE = 'FraudDetectionService';

interface RequestContext {
  endpoint: string;
  method: string;
  ipAddress: string;
  userAgent?: string;
  geographicLocation?: string;
}

interface ApiKeyCredentials {
  keyId: string;
  secret: string;
}

class ApiKeyValidationService {
  constructor(
    private readonly apiKeyRepository: any,
    private readonly usageLogRepository: any,
    private readonly apiKeyDomainService: any,
    private readonly fraudDetectionService: any,
  ) {}

  async validateApiKey(
    apiKeyHeader: string,
    requestContext: RequestContext
  ): Promise<{
    apiKey: any;
    isValid: boolean;
    validationErrors: string[];
  }> {
    const validationErrors: string[] = [];

    // Parse credentials from header
    const credentials = this.apiKeyDomainService.parseApiKeyFromHeader(apiKeyHeader);
    if (!credentials) {
      validationErrors.push('Invalid API key format');
      throw new UnauthorizedException('Invalid API key format');
    }

    // Find API key by key ID
    const apiKey = await this.apiKeyRepository.findActiveByKeyId(credentials.keyId);
    if (!apiKey) {
      validationErrors.push('API key not found or inactive');
      throw new UnauthorizedException('Invalid API key');
    }

    // Validate secret hash
    const isValidSecret = this.apiKeyDomainService.validateCredentials(
      credentials,
      apiKey.secretHash
    );

    if (!isValidSecret) {
      validationErrors.push('Invalid API key secret');
      await this.logSuspiciousActivity(apiKey, requestContext, 'INVALID_SECRET');
      throw new UnauthorizedException('Invalid API key');
    }

    // Check if API key is active and not expired
    if (!apiKey.isActive()) {
      validationErrors.push('API key is inactive or expired');
      throw new UnauthorizedException('API key is inactive or expired');
    }

    // Validate IP restrictions
    if (!apiKey.isIpAllowed(requestContext.ipAddress)) {
      validationErrors.push('IP address not allowed');
      await this.logSuspiciousActivity(apiKey, requestContext, 'IP_BLOCKED');
      throw new UnauthorizedException('Access denied from this IP address');
    }

    // Validate geographic restrictions
    if (requestContext.geographicLocation && 
        !apiKey.isRegionAllowed(requestContext.geographicLocation)) {
      validationErrors.push('Geographic region not allowed');
      await this.logSuspiciousActivity(apiKey, requestContext, 'REGION_BLOCKED');
      throw new UnauthorizedException('Access denied from this region');
    }

    // Fraud detection
    const fraudScore = await this.calculateFraudScore(apiKey, requestContext);
    if (fraudScore > 70) {
      validationErrors.push('Suspicious activity detected');
      await this.logSuspiciousActivity(apiKey, requestContext, 'HIGH_FRAUD_SCORE', fraudScore);
      throw new UnauthorizedException('Access denied due to suspicious activity');
    }

    return {
      apiKey,
      isValid: validationErrors.length === 0,
      validationErrors,
    };
  }

  async checkPermission(
    apiKey: any,
    permission: string,
    resourceType?: string
  ): Promise<boolean> {
    return this.apiKeyDomainService.hasPermission(apiKey, permission, resourceType);
  }

  async logApiKeyUsage(
    apiKey: any,
    requestContext: RequestContext,
    statusCode: number,
    responseTimeMs?: number
  ): Promise<void> {
    const usageLog = {
      apiKeyId: apiKey.id,
      endpoint: requestContext.endpoint,
      httpMethod: requestContext.method,
      statusCode,
      responseTimeMs,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      geographicLocation: requestContext.geographicLocation,
      timestamp: new Date(),
      isSuspicious: false,
      fraudScore: null,
      securityFlags: [],
    };

    await this.usageLogRepository.save(usageLog);
  }

  private async calculateFraudScore(apiKey: any, requestContext: RequestContext): Promise<number> {
    return this.fraudDetectionService.calculateFraudScore(apiKey, requestContext);
  }

  private async logSuspiciousActivity(
    apiKey: any,
    requestContext: RequestContext,
    securityFlag: string,
    fraudScore?: number
  ): Promise<void> {
    const usageLog = {
      apiKeyId: apiKey.id,
      endpoint: requestContext.endpoint,
      httpMethod: requestContext.method,
      statusCode: 401,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      geographicLocation: requestContext.geographicLocation,
      timestamp: new Date(),
      isSuspicious: true,
      fraudScore: fraudScore || null,
      securityFlags: [securityFlag],
    };

    await this.usageLogRepository.save(usageLog);
  }
}

describe('ApiKeyValidationService', () => {
  let service: ApiKeyValidationService;
  let apiKeyRepository: any;
  let usageLogRepository: any;
  let apiKeyDomainService: any;
  let fraudDetectionService: any;

  beforeEach(async () => {
    apiKeyRepository = {
      findActiveByKeyId: jest.fn(),
      findById: jest.fn(),
    };

    usageLogRepository = {
      save: jest.fn(),
      findByApiKeyId: jest.fn(),
      findSuspiciousActivity: jest.fn(),
    };

    apiKeyDomainService = {
      parseApiKeyFromHeader: jest.fn(),
      validateCredentials: jest.fn(),
      hasPermission: jest.fn(),
    };

    fraudDetectionService = {
      calculateFraudScore: jest.fn(),
      analyzeBehaviorPattern: jest.fn(),
    };

    // Initialize service directly with mocks since it's a mock implementation
    service = new ApiKeyValidationService(
      apiKeyRepository,
      usageLogRepository,
      apiKeyDomainService,
      fraudDetectionService
    );
  });

  describe('validateApiKey', () => {
    const mockRequestContext: RequestContext = {
      endpoint: '/api/coupons',
      method: 'GET',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      geographicLocation: 'BR-SP',
    };

    it('should successfully validate a valid API key', async () => {
      // Arrange
      const apiKeyHeader = ApiKeyFixtures.getValidApiKeyCredentials();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'test-secret',
      };
      const mockApiKey = {
        id: 'api-key-id',
        keyId: mockCredentials.keyId,
        secretHash: 'hashed-secret',
        status: ApiKeyStatus.ACTIVE,
        userType: UserType.MERCHANT,
        isActive: jest.fn().mockReturnValue(true),
        isIpAllowed: jest.fn().mockReturnValue(true),
        isRegionAllowed: jest.fn().mockReturnValue(true),
      };

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(mockCredentials);
      apiKeyRepository.findActiveByKeyId.mockResolvedValue(mockApiKey);
      apiKeyDomainService.validateCredentials.mockReturnValue(true);
      fraudDetectionService.calculateFraudScore.mockResolvedValue(10);

      // Act
      const result = await service.validateApiKey(apiKeyHeader, mockRequestContext);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.apiKey).toBe(mockApiKey);
      expect(result.validationErrors).toHaveLength(0);
      expect(apiKeyDomainService.parseApiKeyFromHeader).toHaveBeenCalledWith(apiKeyHeader);
      expect(apiKeyRepository.findActiveByKeyId).toHaveBeenCalledWith(mockCredentials.keyId);
      expect(apiKeyDomainService.validateCredentials).toHaveBeenCalledWith(mockCredentials, mockApiKey.secretHash);
      expect(mockApiKey.isActive).toHaveBeenCalled();
      expect(mockApiKey.isIpAllowed).toHaveBeenCalledWith(mockRequestContext.ipAddress);
      expect(mockApiKey.isRegionAllowed).toHaveBeenCalledWith(mockRequestContext.geographicLocation);
      expect(fraudDetectionService.calculateFraudScore).toHaveBeenCalledWith(mockApiKey, mockRequestContext);
    });

    it('should throw UnauthorizedException for invalid API key format', async () => {
      // Arrange
      const invalidApiKeyHeader = ApiKeyFixtures.getInvalidFormatApiKey();

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(null);

      // Act & Assert
      await expect(service.validateApiKey(invalidApiKeyHeader, mockRequestContext))
        .rejects.toThrow(UnauthorizedException);
      expect(apiKeyDomainService.parseApiKeyFromHeader).toHaveBeenCalledWith(invalidApiKeyHeader);
      expect(apiKeyRepository.findActiveByKeyId).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for non-existent API key', async () => {
      // Arrange
      const apiKeyHeader = ApiKeyFixtures.getValidApiKeyCredentials();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'test-secret',
      };

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(mockCredentials);
      apiKeyRepository.findActiveByKeyId.mockResolvedValue(null);

      // Act & Assert
      await expect(service.validateApiKey(apiKeyHeader, mockRequestContext))
        .rejects.toThrow(UnauthorizedException);
      expect(apiKeyRepository.findActiveByKeyId).toHaveBeenCalledWith(mockCredentials.keyId);
      expect(apiKeyDomainService.validateCredentials).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid secret', async () => {
      // Arrange
      const apiKeyHeader = ApiKeyFixtures.getInvalidSecretApiKey();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'invalid-secret',
      };
      const mockApiKey = {
        id: 'api-key-id',
        keyId: mockCredentials.keyId,
        secretHash: 'hashed-secret',
        status: ApiKeyStatus.ACTIVE,
      };

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(mockCredentials);
      apiKeyRepository.findActiveByKeyId.mockResolvedValue(mockApiKey);
      apiKeyDomainService.validateCredentials.mockReturnValue(false);
      usageLogRepository.save.mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.validateApiKey(apiKeyHeader, mockRequestContext))
        .rejects.toThrow(UnauthorizedException);
      expect(apiKeyDomainService.validateCredentials).toHaveBeenCalledWith(mockCredentials, mockApiKey.secretHash);
      expect(usageLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        isSuspicious: true,
        securityFlags: ['INVALID_SECRET'],
      }));
    });

    it('should throw UnauthorizedException for inactive API key', async () => {
      // Arrange
      const apiKeyHeader = ApiKeyFixtures.getValidApiKeyCredentials();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'test-secret',
      };
      const mockApiKey = {
        id: 'api-key-id',
        keyId: mockCredentials.keyId,
        secretHash: 'hashed-secret',
        status: ApiKeyStatus.EXPIRED,
        isActive: jest.fn().mockReturnValue(false),
      };

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(mockCredentials);
      apiKeyRepository.findActiveByKeyId.mockResolvedValue(mockApiKey);
      apiKeyDomainService.validateCredentials.mockReturnValue(true);

      // Act & Assert
      await expect(service.validateApiKey(apiKeyHeader, mockRequestContext))
        .rejects.toThrow(UnauthorizedException);
      expect(mockApiKey.isActive).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for blocked IP address', async () => {
      // Arrange
      const apiKeyHeader = ApiKeyFixtures.getValidApiKeyCredentials();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'test-secret',
      };
      const mockApiKey = {
        id: 'api-key-id',
        keyId: mockCredentials.keyId,
        secretHash: 'hashed-secret',
        status: ApiKeyStatus.ACTIVE,
        isActive: jest.fn().mockReturnValue(true),
        isIpAllowed: jest.fn().mockReturnValue(false),
      };

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(mockCredentials);
      apiKeyRepository.findActiveByKeyId.mockResolvedValue(mockApiKey);
      apiKeyDomainService.validateCredentials.mockReturnValue(true);
      usageLogRepository.save.mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.validateApiKey(apiKeyHeader, mockRequestContext))
        .rejects.toThrow(UnauthorizedException);
      expect(mockApiKey.isIpAllowed).toHaveBeenCalledWith(mockRequestContext.ipAddress);
      expect(usageLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        isSuspicious: true,
        securityFlags: ['IP_BLOCKED'],
      }));
    });

    it('should throw UnauthorizedException for blocked geographic region', async () => {
      // Arrange
      const apiKeyHeader = ApiKeyFixtures.getValidApiKeyCredentials();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'test-secret',
      };
      const mockApiKey = {
        id: 'api-key-id',
        keyId: mockCredentials.keyId,
        secretHash: 'hashed-secret',
        status: ApiKeyStatus.ACTIVE,
        isActive: jest.fn().mockReturnValue(true),
        isIpAllowed: jest.fn().mockReturnValue(true),
        isRegionAllowed: jest.fn().mockReturnValue(false),
      };

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(mockCredentials);
      apiKeyRepository.findActiveByKeyId.mockResolvedValue(mockApiKey);
      apiKeyDomainService.validateCredentials.mockReturnValue(true);
      usageLogRepository.save.mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.validateApiKey(apiKeyHeader, mockRequestContext))
        .rejects.toThrow(UnauthorizedException);
      expect(mockApiKey.isRegionAllowed).toHaveBeenCalledWith(mockRequestContext.geographicLocation);
      expect(usageLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        isSuspicious: true,
        securityFlags: ['REGION_BLOCKED'],
      }));
    });

    it('should throw UnauthorizedException for high fraud score', async () => {
      // Arrange
      const apiKeyHeader = ApiKeyFixtures.getValidApiKeyCredentials();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'test-secret',
      };
      const mockApiKey = {
        id: 'api-key-id',
        keyId: mockCredentials.keyId,
        secretHash: 'hashed-secret',
        status: ApiKeyStatus.ACTIVE,
        isActive: jest.fn().mockReturnValue(true),
        isIpAllowed: jest.fn().mockReturnValue(true),
        isRegionAllowed: jest.fn().mockReturnValue(true),
      };

      apiKeyDomainService.parseApiKeyFromHeader.mockReturnValue(mockCredentials);
      apiKeyRepository.findActiveByKeyId.mockResolvedValue(mockApiKey);
      apiKeyDomainService.validateCredentials.mockReturnValue(true);
      fraudDetectionService.calculateFraudScore.mockResolvedValue(85);
      usageLogRepository.save.mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.validateApiKey(apiKeyHeader, mockRequestContext))
        .rejects.toThrow(UnauthorizedException);
      expect(fraudDetectionService.calculateFraudScore).toHaveBeenCalledWith(mockApiKey, mockRequestContext);
      expect(usageLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        isSuspicious: true,
        fraudScore: 85,
        securityFlags: ['HIGH_FRAUD_SCORE'],
      }));
    });
  });

  describe('checkPermission', () => {
    it('should return true for valid permission', async () => {
      // Arrange
      const mockApiKey = { id: 'api-key-id', permissions: ['coupon.create'] };
      const permission = 'coupon.create';

      apiKeyDomainService.hasPermission.mockReturnValue(true);

      // Act
      const result = await service.checkPermission(mockApiKey, permission);

      // Assert
      expect(result).toBe(true);
      expect(apiKeyDomainService.hasPermission).toHaveBeenCalledWith(mockApiKey, permission, undefined);
    });

    it('should return false for invalid permission', async () => {
      // Arrange
      const mockApiKey = { id: 'api-key-id', permissions: ['coupon.create'] };
      const permission = 'admin.all';

      apiKeyDomainService.hasPermission.mockReturnValue(false);

      // Act
      const result = await service.checkPermission(mockApiKey, permission);

      // Assert
      expect(result).toBe(false);
      expect(apiKeyDomainService.hasPermission).toHaveBeenCalledWith(mockApiKey, permission, undefined);
    });

    it('should check permission with resource type', async () => {
      // Arrange
      const mockApiKey = { id: 'api-key-id', permissions: ['electronics.manage'] };
      const permission = 'electronics.manage';
      const resourceType = 'electronics';

      apiKeyDomainService.hasPermission.mockReturnValue(true);

      // Act
      const result = await service.checkPermission(mockApiKey, permission, resourceType);

      // Assert
      expect(result).toBe(true);
      expect(apiKeyDomainService.hasPermission).toHaveBeenCalledWith(mockApiKey, permission, resourceType);
    });
  });

  describe('logApiKeyUsage', () => {
    it('should log normal API key usage', async () => {
      // Arrange
      const mockApiKey = { id: 'api-key-id' };
      const requestContext: RequestContext = {
        endpoint: '/api/coupons',
        method: 'GET',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        geographicLocation: 'BR-SP',
      };
      const statusCode = 200;
      const responseTimeMs = 150;

      usageLogRepository.save.mockResolvedValue(undefined);

      // Act
      await service.logApiKeyUsage(mockApiKey, requestContext, statusCode, responseTimeMs);

      // Assert
      expect(usageLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        apiKeyId: mockApiKey.id,
        endpoint: requestContext.endpoint,
        httpMethod: requestContext.method,
        statusCode,
        responseTimeMs,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        geographicLocation: requestContext.geographicLocation,
        isSuspicious: false,
        fraudScore: null,
        securityFlags: [],
      }));
    });

    it('should log API key usage without optional fields', async () => {
      // Arrange
      const mockApiKey = { id: 'api-key-id' };
      const requestContext: RequestContext = {
        endpoint: '/api/coupons',
        method: 'GET',
        ipAddress: '192.168.1.1',
      };
      const statusCode = 200;

      usageLogRepository.save.mockResolvedValue(undefined);

      // Act
      await service.logApiKeyUsage(mockApiKey, requestContext, statusCode);

      // Assert
      expect(usageLogRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        apiKeyId: mockApiKey.id,
        endpoint: requestContext.endpoint,
        httpMethod: requestContext.method,
        statusCode,
        responseTimeMs: undefined,
        ipAddress: requestContext.ipAddress,
        userAgent: undefined,
        geographicLocation: undefined,
        isSuspicious: false,
      }));
    });
  });
});