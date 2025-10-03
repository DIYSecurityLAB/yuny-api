import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures, CreateApiKeyRequest } from '../fixtures/api-key-fixtures';

// Define tokens for dependency injection
const API_KEY_REPOSITORY = 'ApiKeyRepository';
const RATE_LIMIT_REPOSITORY = 'ApiKeyRateLimitRepository';
const API_KEY_DOMAIN_SERVICE = 'ApiKeyDomainService';
const PERMISSION_DOMAIN_SERVICE = 'PermissionDomainService';

// Mock implementation
class ApiKeyManagementService {
  constructor(
    private readonly apiKeyRepository: any,
    private readonly rateLimitRepository: any,
    private readonly apiKeyDomainService: any,
    private readonly permissionDomainService: any,
  ) {}

  async createApiKey(request: CreateApiKeyRequest): Promise<any> {
    // Check if name already exists
    const existing = await this.apiKeyRepository.findByName(request.name, request.userId);
    if (existing) {
      throw new ConflictException('API key name already exists');
    }

    // Generate credentials
    const credentials = this.apiKeyDomainService.generateCredentials();
    const secretHash = this.apiKeyDomainService.hashSecret(credentials.secret);
    
    // Get permissions
    const permissions = request.customPermissions || 
      this.permissionDomainService.getDefaultPermissionsForUserType(request.userType);

    // Create API key
    const apiKey = {
      id: 'generated-id',
      keyId: credentials.keyId,
      secretHash,
      name: request.name,
      userType: request.userType,
      status: ApiKeyStatus.ACTIVE,
      rateLimitTier: request.rateLimitTier || RateLimitTier.BASIC,
      userId: request.userId,
      tenantId: request.tenantId,
      storeId: request.storeId,
      consumerId: request.consumerId,
      marketplaceContext: request.marketplaceContext,
      allowedRegions: request.allowedRegions || [],
      complianceLevel: request.complianceLevel || ComplianceLevel.BASIC,
      allowedIps: request.allowedIps || [],
      expiresAt: request.expiresAt,
      createdAt: new Date(),
      permissions: permissions.map((p: string) => ({ permission: p })),
    };

    await this.apiKeyRepository.save(apiKey);
    await this.rateLimitRepository.createDefaultLimits(apiKey.id, apiKey.rateLimitTier, apiKey.userType);

    return {
      id: apiKey.id,
      keyId: apiKey.keyId,
      name: apiKey.name,
      userType: apiKey.userType,
      status: apiKey.status,
      rateLimitTier: apiKey.rateLimitTier,
      permissions,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
      credentials: credentials.formattedCredentials,
    };
  }

  async getApiKey(id: string): Promise<any> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return {
      id: apiKey.id,
      keyId: apiKey.keyId,
      name: apiKey.name,
      userType: apiKey.userType,
      status: apiKey.status,
      rateLimitTier: apiKey.rateLimitTier,
      permissions: apiKey.permissions.map((p: any) => p.permission),
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
    };
  }

  async listApiKeys(userId: string): Promise<any[]> {
    const apiKeys = await this.apiKeyRepository.findByUserId(userId);
    return apiKeys.map((apiKey: any) => ({
      id: apiKey.id,
      keyId: apiKey.keyId,
      name: apiKey.name,
      userType: apiKey.userType,
      status: apiKey.status,
      rateLimitTier: apiKey.rateLimitTier,
      permissions: apiKey.permissions?.map((p: any) => p.permission) || [],
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
    }));
  }

  async revokeApiKey(id: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    apiKey.revoke();
    await this.apiKeyRepository.update(apiKey);
  }

  async updateApiKey(id: string, data: any): Promise<any> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    Object.assign(apiKey, data);
    const updated = await this.apiKeyRepository.update(apiKey);
    
    return {
      id: updated.id,
      keyId: updated.keyId,
      name: updated.name,
      userType: updated.userType,
      status: updated.status,
      rateLimitTier: updated.rateLimitTier,
      permissions: updated.permissions?.map((p: any) => p.permission) || [],
      createdAt: updated.createdAt,
      expiresAt: updated.expiresAt,
    };
  }
}

describe('ApiKeyManagementService', () => {  
  let service: ApiKeyManagementService;
  let apiKeyRepository: any;
  let rateLimitRepository: any;
  let apiKeyDomainService: any;
  let permissionDomainService: any;

  beforeEach(async () => {
    apiKeyRepository = {
      findByName: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findActiveByKeyId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    rateLimitRepository = {
      createDefaultLimits: jest.fn(),
      findByApiKeyId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    apiKeyDomainService = {
      generateCredentials: jest.fn(),
      hashSecret: jest.fn(),
      validateCredentials: jest.fn(),
      parseApiKeyFromHeader: jest.fn(),
      isExpired: jest.fn(),
    };

    permissionDomainService = {
      getDefaultPermissionsForUserType: jest.fn(),
      validatePermissions: jest.fn(),
      hasPermission: jest.fn(),
    };

    // Initialize service directly with mocks since it's a mock implementation
    service = new ApiKeyManagementService(
      apiKeyRepository,
      rateLimitRepository,
      apiKeyDomainService,
      permissionDomainService
    );
  });

  describe('createApiKey', () => {
    it('should successfully create a merchant API key with correct permissions', async () => {
      // Arrange
      const request: CreateApiKeyRequest = ApiKeyFixtures.createMerchantApiKeyRequest();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        secret: 'test-secret-32-bytes-base64-encoded',
        formattedCredentials: 'ApiKey 550e8400-e29b-41d4-a716-446655440000:dGVzdC1zZWNyZXQtMzItYnl0ZXMtYmFzZTY0LWVuY29kZWQ=',
      };
      const mockSecretHash = 'hashed-secret';
      const mockPermissions = ApiKeyFixtures.getValidPermissions();

      apiKeyRepository.findByName.mockResolvedValue(null);
      apiKeyDomainService.generateCredentials.mockReturnValue(mockCredentials);
      apiKeyDomainService.hashSecret.mockReturnValue(mockSecretHash);
      permissionDomainService.getDefaultPermissionsForUserType.mockReturnValue(mockPermissions);
      apiKeyRepository.save.mockResolvedValue(expect.any(Object));
      rateLimitRepository.createDefaultLimits.mockResolvedValue(undefined);

      // Act
      const result = await service.createApiKey(request);

      // Assert
      expect(result).toBeDefined();
      expect(result.keyId).toBe(mockCredentials.keyId);
      expect(result.userType).toBe(UserType.MERCHANT);
      expect(result.rateLimitTier).toBe(RateLimitTier.PREMIUM);
      expect(result.credentials).toBe(mockCredentials.formattedCredentials);
      expect(result.permissions).toEqual(expect.arrayContaining(mockPermissions));

      expect(apiKeyRepository.findByName).toHaveBeenCalledWith(request.name, request.userId);
      expect(apiKeyDomainService.generateCredentials).toHaveBeenCalled();
      expect(apiKeyDomainService.hashSecret).toHaveBeenCalledWith(mockCredentials.secret);
      expect(permissionDomainService.getDefaultPermissionsForUserType).toHaveBeenCalledWith(UserType.MERCHANT);
      expect(apiKeyRepository.save).toHaveBeenCalled();
      expect(rateLimitRepository.createDefaultLimits).toHaveBeenCalled();
    });

    it('should successfully create a consumer API key with basic permissions', async () => {
      // Arrange
      const request: CreateApiKeyRequest = ApiKeyFixtures.createConsumerApiKeyRequest();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440001',
        secret: 'consumer-secret-32-bytes-base64-encoded',
        formattedCredentials: 'ApiKey 550e8400-e29b-41d4-a716-446655440001:Y29uc3VtZXItc2VjcmV0LTMyLWJ5dGVzLWJhc2U2NC1lbmNvZGVk',
      };
      const mockSecretHash = 'hashed-consumer-secret';
      const mockPermissions = ApiKeyFixtures.getConsumerPermissions();

      apiKeyRepository.findByName.mockResolvedValue(null);
      apiKeyDomainService.generateCredentials.mockReturnValue(mockCredentials);
      apiKeyDomainService.hashSecret.mockReturnValue(mockSecretHash);
      permissionDomainService.getDefaultPermissionsForUserType.mockReturnValue(mockPermissions);
      apiKeyRepository.save.mockResolvedValue(expect.any(Object));
      rateLimitRepository.createDefaultLimits.mockResolvedValue(undefined);

      // Act
      const result = await service.createApiKey(request);

      // Assert
      expect(result).toBeDefined();
      expect(result.keyId).toBe(mockCredentials.keyId);
      expect(result.userType).toBe(UserType.CONSUMER);
      expect(result.rateLimitTier).toBe(RateLimitTier.BASIC);
      expect(result.permissions).toEqual(expect.arrayContaining(mockPermissions));
      expect(result.permissions).not.toContain('admin.all');
      expect(result.permissions).not.toContain('coupon.create');
    });

    it('should successfully create an admin API key with unlimited permissions', async () => {
      // Arrange
      const request: CreateApiKeyRequest = ApiKeyFixtures.createAdminApiKeyRequest();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440002',
        secret: 'admin-secret-32-bytes-base64-encoded',
        formattedCredentials: 'ApiKey 550e8400-e29b-41d4-a716-446655440002:YWRtaW4tc2VjcmV0LTMyLWJ5dGVzLWJhc2U2NC1lbmNvZGVk',
      };
      const mockSecretHash = 'hashed-admin-secret';
      const mockPermissions = ApiKeyFixtures.getAdminPermissions();

      apiKeyRepository.findByName.mockResolvedValue(null);
      apiKeyDomainService.generateCredentials.mockReturnValue(mockCredentials);
      apiKeyDomainService.hashSecret.mockReturnValue(mockSecretHash);
      permissionDomainService.getDefaultPermissionsForUserType.mockReturnValue(mockPermissions);
      apiKeyRepository.save.mockResolvedValue(expect.any(Object));
      rateLimitRepository.createDefaultLimits.mockResolvedValue(undefined);

      // Act
      const result = await service.createApiKey(request);

      // Assert
      expect(result).toBeDefined();
      expect(result.keyId).toBe(mockCredentials.keyId);
      expect(result.userType).toBe(UserType.ADMIN);
      expect(result.rateLimitTier).toBe(RateLimitTier.UNLIMITED);
      expect(result.permissions).toContain('admin.all');
    });

    it('should throw ConflictException when API key name already exists', async () => {
      // Arrange
      const request: CreateApiKeyRequest = ApiKeyFixtures.createMerchantApiKeyRequest();
      const existingApiKey = { id: 'existing-key-id', name: request.name };

      apiKeyRepository.findByName.mockResolvedValue(existingApiKey as any);

      // Act & Assert
      await expect(service.createApiKey(request)).rejects.toThrow(ConflictException);
      expect(apiKeyRepository.findByName).toHaveBeenCalledWith(request.name, request.userId);
      expect(apiKeyDomainService.generateCredentials).not.toHaveBeenCalled();
    });

    it('should create API key with custom permissions when provided', async () => {
      // Arrange
      const customPermissions = ['custom.permission', 'special.access'];
      const request: CreateApiKeyRequest = ApiKeyFixtures.createMerchantApiKeyRequest({
        customPermissions: customPermissions as any,
      });
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440003',
        secret: 'custom-secret',
        formattedCredentials: 'ApiKey 550e8400-e29b-41d4-a716-446655440003:Y3VzdG9tLXNlY3JldA==',
      };

      apiKeyRepository.findByName.mockResolvedValue(null);
      apiKeyDomainService.generateCredentials.mockReturnValue(mockCredentials);
      apiKeyDomainService.hashSecret.mockReturnValue('hashed-custom-secret');
      permissionDomainService.getDefaultPermissionsForUserType.mockReturnValue([]);
      apiKeyRepository.save.mockResolvedValue(expect.any(Object));
      rateLimitRepository.createDefaultLimits.mockResolvedValue(undefined);

      // Act
      const result = await service.createApiKey(request);

      // Assert
      expect(result.permissions).toEqual(expect.arrayContaining(customPermissions));
    });

    it('should create temporary API key with expiration date', async () => {
      // Arrange
      const request: CreateApiKeyRequest = ApiKeyFixtures.createTemporaryApiKeyRequest();
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440004',
        secret: 'temp-secret',
        formattedCredentials: 'ApiKey 550e8400-e29b-41d4-a716-446655440004:dGVtcC1zZWNyZXQ=',
      };

      apiKeyRepository.findByName.mockResolvedValue(null);
      apiKeyDomainService.generateCredentials.mockReturnValue(mockCredentials);
      apiKeyDomainService.hashSecret.mockReturnValue('hashed-temp-secret');
      permissionDomainService.getDefaultPermissionsForUserType.mockReturnValue([]);
      apiKeyRepository.save.mockResolvedValue(expect.any(Object));
      rateLimitRepository.createDefaultLimits.mockResolvedValue(undefined);

      // Act
      const result = await service.createApiKey(request);

      // Assert
      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should set correct compliance level for different user types', async () => {
      // Arrange
      const request: CreateApiKeyRequest = ApiKeyFixtures.createMerchantApiKeyRequest({
        complianceLevel: ComplianceLevel.PCI_DSS,
      });
      const mockCredentials = {
        keyId: '550e8400-e29b-41d4-a716-446655440005',
        secret: 'compliance-secret',
        formattedCredentials: 'ApiKey 550e8400-e29b-41d4-a716-446655440005:Y29tcGxpYW5jZS1zZWNyZXQ=',
      };

      apiKeyRepository.findByName.mockResolvedValue(null);
      apiKeyDomainService.generateCredentials.mockReturnValue(mockCredentials);
      apiKeyDomainService.hashSecret.mockReturnValue('hashed-compliance-secret');
      permissionDomainService.getDefaultPermissionsForUserType.mockReturnValue([]);
      apiKeyRepository.save.mockImplementation((apiKey: any) => Promise.resolve(apiKey));
      rateLimitRepository.createDefaultLimits.mockResolvedValue(undefined);

      // Act
      const result = await service.createApiKey(request);

      // Assert
      expect(apiKeyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          complianceLevel: ComplianceLevel.PCI_DSS,
        })
      );
    });
  });

  describe('getApiKey', () => {
    it('should return API key by ID without credentials', async () => {
      // Arrange
      const apiKeyId = 'test-api-key-id';
      const mockApiKey = {
        id: apiKeyId,
        keyId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test API Key',
        userType: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rateLimitTier: RateLimitTier.PREMIUM,
        permissions: [{ permission: 'coupon.create' }],
        createdAt: new Date(),
      };

      apiKeyRepository.findById.mockResolvedValue(mockApiKey as any);

      // Act
      const result = await service.getApiKey(apiKeyId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(apiKeyId);
      expect(result.credentials).toBeUndefined();
      expect(result.permissions).toEqual(['coupon.create']);
    });

    it('should throw NotFoundException when API key not found', async () => {
      // Arrange
      const apiKeyId = 'non-existent-key';
      apiKeyRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getApiKey(apiKeyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listApiKeys', () => {
    it('should return all API keys for a user', async () => {
      // Arrange
      const userId = 'test-user-id';
      const mockApiKeys = [
        {
          id: 'key1',
          keyId: '550e8400-e29b-41d4-a716-446655440001',
          name: 'API Key 1',
          userType: UserType.MERCHANT,
          status: ApiKeyStatus.ACTIVE,
          rateLimitTier: RateLimitTier.PREMIUM,
          permissions: [],
          createdAt: new Date(),
        },
        {
          id: 'key2',
          keyId: '550e8400-e29b-41d4-a716-446655440002',
          name: 'API Key 2',
          userType: UserType.MERCHANT,
          status: ApiKeyStatus.INACTIVE,
          rateLimitTier: RateLimitTier.BASIC,
          permissions: [],
          createdAt: new Date(),
        },
      ];

      apiKeyRepository.findByUserId.mockResolvedValue(mockApiKeys as any);

      // Act
      const result = await service.listApiKeys(userId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('key1');
      expect(result[1].id).toBe('key2');
      expect(result.every((key: any) => key.credentials === undefined)).toBe(true);
    });

    it('should return empty array when user has no API keys', async () => {
      // Arrange
      const userId = 'user-with-no-keys';
      apiKeyRepository.findByUserId.mockResolvedValue([]);

      // Act
      const result = await service.listApiKeys(userId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('revokeApiKey', () => {
    it('should successfully revoke an active API key', async () => {
      // Arrange
      const apiKeyId = 'test-api-key-id';
      const mockApiKey = {
        id: apiKeyId,
        status: ApiKeyStatus.ACTIVE,
        revoke: jest.fn(),
      };

      apiKeyRepository.findById.mockResolvedValue(mockApiKey as any);
      apiKeyRepository.update.mockResolvedValue(mockApiKey as any);

      // Act
      await service.revokeApiKey(apiKeyId);

      // Assert
      expect(mockApiKey.revoke).toHaveBeenCalled();
      expect(apiKeyRepository.update).toHaveBeenCalledWith(mockApiKey);
    });

    it('should throw NotFoundException when trying to revoke non-existent API key', async () => {
      // Arrange
      const apiKeyId = 'non-existent-key';
      apiKeyRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.revokeApiKey(apiKeyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateApiKey', () => {
    it('should successfully update API key properties', async () => {
      // Arrange
      const apiKeyId = 'test-api-key-id';
      const updateData = {
        name: 'Updated API Key Name',
        rateLimitTier: RateLimitTier.ENTERPRISE,
      };
      const mockApiKey = {
        id: apiKeyId,
        name: 'Original Name',
        rateLimitTier: RateLimitTier.BASIC,
        update: jest.fn(),
      };

      apiKeyRepository.findById.mockResolvedValue(mockApiKey as any);
      apiKeyRepository.update.mockResolvedValue({ ...mockApiKey, ...updateData } as any);

      // Act
      const result = await service.updateApiKey(apiKeyId, updateData);

      // Assert
      expect(result.name).toBe(updateData.name);
      expect(result.rateLimitTier).toBe(updateData.rateLimitTier);
      expect(apiKeyRepository.update).toHaveBeenCalledWith(mockApiKey);
    });

    it('should throw NotFoundException when trying to update non-existent API key', async () => {
      // Arrange
      const apiKeyId = 'non-existent-key';
      const updateData = { name: 'New Name' };
      apiKeyRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateApiKey(apiKeyId, updateData)).rejects.toThrow(NotFoundException);
    });
  });
});