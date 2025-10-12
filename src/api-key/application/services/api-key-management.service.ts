import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { ApiKeyRepository, ApiKeyRateLimitRepository } from '../../domain/repositories';
import { ApiKeyDomainService, PermissionDomainService } from '../../domain/services';
import { ApiKeyEntity, ApiKeyCredentials, ApiKeyRateLimitEntity, ApiKeyPermissionEntity } from '../../domain/entities';
import { UserType, RateLimitTier, ComplianceLevel, MarketplacePermission, RATE_LIMIT_CONFIGS } from '../../domain/enums';
import { v4 as uuid } from 'uuid';

export interface CreateApiKeyRequest {
  name: string;
  userType: UserType;
  userId: string;
  rateLimitTier?: RateLimitTier;
  tenantId?: string;
  storeId?: string;
  consumerId?: string;
  marketplaceContext?: string;
  allowedRegions?: string[];
  complianceLevel?: ComplianceLevel;
  allowedIps?: string[];
  expiresAt?: Date;
  customPermissions?: MarketplacePermission[];
}

export interface ApiKeyResponse {
  id: string;
  keyId: string;
  name: string;
  userType: UserType;
  status: string;
  rateLimitTier: RateLimitTier;
  permissions: MarketplacePermission[];
  createdAt: Date;
  expiresAt?: Date;
  // Credentials only returned on creation
  credentials?: string;
}

@Injectable()
export class ApiKeyManagementService {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly rateLimitRepository: ApiKeyRateLimitRepository,
    private readonly apiKeyDomainService: ApiKeyDomainService,
    private readonly permissionDomainService: PermissionDomainService,
  ) {}

  /**
   * Create a new API key
   */
  async createApiKey(request: CreateApiKeyRequest): Promise<ApiKeyResponse> {
    // Check if user already has an API key of this type (for some user types)
    if (request.userType === UserType.MERCHANT && request.storeId) {
      const existingKeys = await this.apiKeyRepository.findByStore(request.storeId);
      if (existingKeys.length > 0 && !this.allowMultipleKeysPerStore(request.userType)) {
        throw new ConflictException('Store already has an active API key');
      }
    }

    // Generate API key
    const { apiKey, credentials } = this.apiKeyDomainService.generateApiKey({
      name: request.name,
      userType: request.userType,
      userId: request.userId,
      rateLimitTier: request.rateLimitTier,
      tenantId: request.tenantId,
      storeId: request.storeId,
      consumerId: request.consumerId,
      marketplaceContext: request.marketplaceContext,
      allowedRegions: request.allowedRegions,
      complianceLevel: request.complianceLevel,
      allowedIps: request.allowedIps,
      expiresAt: request.expiresAt,
    });

    // Save API key
    const savedApiKey = await this.apiKeyRepository.create(apiKey);

    // Set up permissions
    await this.setupPermissions(savedApiKey, request.customPermissions);

    // Set up rate limits
    await this.setupRateLimits(savedApiKey);

    return {
      id: savedApiKey.id,
      keyId: savedApiKey.keyId,
      name: savedApiKey.name,
      userType: savedApiKey.userType,
      status: savedApiKey.status,
      rateLimitTier: savedApiKey.rateLimitTier,
      permissions: savedApiKey.permissions.map(p => p.permission),
      createdAt: savedApiKey.createdAt,
      expiresAt: savedApiKey.expiresAt,
      credentials: credentials.toString(), // Only shown once
    };
  }

  /**
   * Create temporary API key for campaigns
   */
  async createTemporaryApiKey(request: {
    name: string;
    userType: UserType;
    userId: string;
    durationHours: number;
    permissions: MarketplacePermission[];
    campaignContext?: string;
  }): Promise<ApiKeyResponse> {
    const { apiKey, credentials } = this.apiKeyDomainService.generateTemporaryApiKey(request);

    const savedApiKey = await this.apiKeyRepository.create(apiKey);
    await this.setupCustomPermissions(savedApiKey, request.permissions);
    await this.setupRateLimits(savedApiKey);

    return {
      id: savedApiKey.id,
      keyId: savedApiKey.keyId,
      name: savedApiKey.name,
      userType: savedApiKey.userType,
      status: savedApiKey.status,
      rateLimitTier: savedApiKey.rateLimitTier,
      permissions: request.permissions,
      createdAt: savedApiKey.createdAt,
      expiresAt: savedApiKey.expiresAt,
      credentials: credentials.toString(),
    };
  }

  /**
   * List API keys for user
   */
  async listApiKeys(userId: string, userType?: UserType): Promise<ApiKeyResponse[]> {
    const apiKeys = userType 
      ? await this.apiKeyRepository.findByUserIdAndType(userId, userType)
      : await this.apiKeyRepository.findByUserId(userId);

    return apiKeys.map(key => ({
      id: key.id,
      keyId: key.keyId,
      name: key.name,
      userType: key.userType,
      status: key.status,
      rateLimitTier: key.rateLimitTier,
      permissions: key.permissions.map(p => p.permission),
      createdAt: key.createdAt,
      expiresAt: key.expiresAt,
      // Never return credentials in list
    }));
  }

  /**
   * Get API key details
   */
  async getApiKey(id: string): Promise<ApiKeyResponse> {
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
      permissions: apiKey.permissions.map(p => p.permission),
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
    };
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(id: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    const revokedApiKey = new ApiKeyEntity(
      apiKey.id,
      apiKey.keyId,
      apiKey.secretHash,
      apiKey.name,
      apiKey.userType,
      apiKey.userId,
      'REVOKED' as any,
      apiKey.rateLimitTier,
      apiKey.allowedRegions,
      apiKey.complianceLevel,
      apiKey.allowedIps,
      apiKey.permissions,
      apiKey.rateLimits,
      apiKey.createdAt,
      new Date(), // updatedAt
      apiKey.tenantId,
      apiKey.storeId,
      apiKey.consumerId,
      apiKey.marketplaceContext,
      apiKey.webhookSignatureSecret,
      apiKey.expiresAt,
      apiKey.lastUsedAt,
    );

    await this.apiKeyRepository.update(revokedApiKey);
  }

  /**
   * Update API key settings
   */
  async updateApiKey(id: string, updates: {
    name?: string;
    allowedIps?: string[];
    allowedRegions?: string[];
    expiresAt?: Date;
  }): Promise<ApiKeyResponse> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    const updatedApiKey = new ApiKeyEntity(
      apiKey.id,
      apiKey.keyId,
      apiKey.secretHash,
      updates.name ?? apiKey.name,
      apiKey.userType,
      apiKey.userId,
      apiKey.status,
      apiKey.rateLimitTier,
      updates.allowedRegions ?? apiKey.allowedRegions,
      apiKey.complianceLevel,
      updates.allowedIps ?? apiKey.allowedIps,
      apiKey.permissions,
      apiKey.rateLimits,
      apiKey.createdAt,
      new Date(),
      apiKey.tenantId,
      apiKey.storeId,
      apiKey.consumerId,
      apiKey.marketplaceContext,
      apiKey.webhookSignatureSecret,
      updates.expiresAt ?? apiKey.expiresAt,
      apiKey.lastUsedAt,
    );

    const saved = await this.apiKeyRepository.update(updatedApiKey);

    return {
      id: saved.id,
      keyId: saved.keyId,
      name: saved.name,
      userType: saved.userType,
      status: saved.status,
      rateLimitTier: saved.rateLimitTier,
      permissions: saved.permissions.map(p => p.permission),
      createdAt: saved.createdAt,
      expiresAt: saved.expiresAt,
    };
  }

  /**
   * Rotate API key secret
   */
  async rotateApiKey(id: string): Promise<ApiKeyResponse> {
    const existingKey = await this.apiKeyRepository.findById(id);
    if (!existingKey) {
      throw new NotFoundException('API key not found');
    }

    // Generate new credentials
    const { apiKey: newKey, credentials } = this.apiKeyDomainService.generateApiKey({
      name: existingKey.name,
      userType: existingKey.userType,
      userId: existingKey.userId,
      rateLimitTier: existingKey.rateLimitTier,
      tenantId: existingKey.tenantId,
      storeId: existingKey.storeId,
      consumerId: existingKey.consumerId,
      marketplaceContext: existingKey.marketplaceContext,
      allowedRegions: existingKey.allowedRegions,
      complianceLevel: existingKey.complianceLevel,
      allowedIps: existingKey.allowedIps,
      expiresAt: existingKey.expiresAt,
    });

    // Update existing key with new secret
    const rotatedKey = new ApiKeyEntity(
      existingKey.id, // Keep same ID
      newKey.keyId, // New key ID
      newKey.secretHash, // New secret hash
      existingKey.name,
      existingKey.userType,
      existingKey.userId,
      existingKey.status,
      existingKey.rateLimitTier,
      existingKey.allowedRegions,
      existingKey.complianceLevel,
      existingKey.allowedIps,
      existingKey.permissions,
      existingKey.rateLimits,
      existingKey.createdAt,
      new Date(),
      existingKey.tenantId,
      existingKey.storeId,
      existingKey.consumerId,
      existingKey.marketplaceContext,
      existingKey.webhookSignatureSecret,
      existingKey.expiresAt,
      existingKey.lastUsedAt,
    );

    const saved = await this.apiKeyRepository.update(rotatedKey);

    return {
      id: saved.id,
      keyId: saved.keyId,
      name: saved.name,
      userType: saved.userType,
      status: saved.status,
      rateLimitTier: saved.rateLimitTier,
      permissions: saved.permissions.map(p => p.permission),
      createdAt: saved.createdAt,
      expiresAt: saved.expiresAt,
      credentials: credentials.toString(), // New credentials
    };
  }

  private async setupPermissions(
    apiKey: ApiKeyEntity,
    customPermissions?: MarketplacePermission[]
  ): Promise<void> {
    const permissions = customPermissions || 
      this.permissionDomainService.getDefaultPermissions(apiKey.userType);

    await this.setupCustomPermissions(apiKey, permissions);
  }

  private async setupCustomPermissions(
    apiKey: ApiKeyEntity,
    permissions: MarketplacePermission[]
  ): Promise<void> {
    // Implementation would create permission records
    // For now, we'll assume permissions are handled at the entity level
  }

  private async setupRateLimits(apiKey: ApiKeyEntity): Promise<void> {
    const config = RATE_LIMIT_CONFIGS[apiKey.rateLimitTier]?.[apiKey.userType];
    if (!config) return;

    const defaultEndpoints = [
      '/api/coupons/*',
      '/api/analytics/*',
      '/api/merchant/*',
      '/api/consumer/*',
      '/api/webhooks/*',
    ];

    const rateLimits = defaultEndpoints.map(endpoint => 
      new ApiKeyRateLimitEntity(
        uuid(),
        apiKey.id,
        endpoint,
        config.requestsPerMinute,
        config.requestsPerHour,
        config.requestsPerDay,
        config.burstLimit,
      )
    );

    await this.rateLimitRepository.bulkCreateForApiKey(
      apiKey.id,
      rateLimits
    );
  }

  private allowMultipleKeysPerStore(userType: UserType): boolean {
    // Some user types might allow multiple keys per store
    return userType === UserType.WEBHOOK || userType === UserType.PLATFORM;
  }
}