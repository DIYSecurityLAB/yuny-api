import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ApiKeyRepository, ApiKeyUsageLogRepository } from '../../domain/repositories';
import { ApiKeyDomainService, FraudDetectionService } from '../../domain/services';
import { ApiKeyEntity, ApiKeyUsageLogEntity, ApiKeyCredentials } from '../../domain/entities';
import { UserType, ApiKeyStatus, MarketplacePermission } from '../../domain/enums';

@Injectable()
export class ApiKeyValidationService {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly usageLogRepository: ApiKeyUsageLogRepository,
    private readonly apiKeyDomainService: ApiKeyDomainService,
    private readonly fraudDetectionService: FraudDetectionService,
  ) {}

  /**
   * Validate API key and return validated context
   */
  async validateApiKey(
    apiKeyHeader: string,
    requestContext: {
      endpoint: string;
      method: string;
      ipAddress: string;
      userAgent?: string;
      geographicLocation?: string;
    }
  ): Promise<{
    apiKey: ApiKeyEntity;
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

  /**
   * Check if API key has required permission
   */
  async checkPermission(
    apiKey: ApiKeyEntity,
    requiredPermission: MarketplacePermission,
    resourceType?: string
  ): Promise<boolean> {
    return apiKey.hasPermission(requiredPermission, resourceType);
  }

  /**
   * Log API key usage
   */
  async logUsage(
    apiKey: ApiKeyEntity,
    requestContext: {
      endpoint: string;
      method: string;
      ipAddress: string;
      userAgent?: string;
      requestId?: string;
      statusCode: number;
      responseTimeMs?: number;
      transactionValue?: number;
      currency?: string;
      merchantId?: string;
      couponCategory?: string;
      geographicLocation?: string;
    }
  ): Promise<void> {
    const fraudScore = await this.calculateFraudScore(apiKey, requestContext);
    const securityFlags = await this.getSecurityFlags(apiKey, requestContext);

    // Generate UUID for the log
    const { randomUUID } = await import('crypto');
    const logId = randomUUID();

    const usageLog = new ApiKeyUsageLogEntity(
      logId,
      apiKey.id,
      requestContext.endpoint,
      requestContext.method,
      requestContext.statusCode,
      requestContext.ipAddress,
      fraudScore > 50,
      securityFlags,
      new Date(),
      requestContext.responseTimeMs,
      requestContext.userAgent,
      requestContext.requestId,
      requestContext.transactionValue,
      requestContext.currency,
      requestContext.merchantId,
      requestContext.couponCategory,
      requestContext.geographicLocation,
      fraudScore,
    );

    await this.usageLogRepository.create(usageLog);

    // Update API key last used timestamp
    await this.apiKeyRepository.update({
      ...apiKey,
      lastUsedAt: new Date(),
    } as ApiKeyEntity);
  }

  /**
   * Get API key context for request
   */
  getApiKeyContext(apiKey: ApiKeyEntity): {
    userId: string;
    userType: UserType;
    tenantId?: string;
    storeId?: string;
    consumerId?: string;
    marketplaceContext?: string;
    permissions: MarketplacePermission[];
  } {
    return {
      userId: apiKey.userId,
      userType: apiKey.userType,
      tenantId: apiKey.tenantId,
      storeId: apiKey.storeId,
      consumerId: apiKey.consumerId,
      marketplaceContext: apiKey.marketplaceContext,
      permissions: apiKey.permissions.map(p => p.permission),
    };
  }

  private async calculateFraudScore(
    apiKey: ApiKeyEntity,
    requestContext: any
  ): Promise<number> {
    // Get recent request count for rate-based scoring
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentRequests = await this.usageLogRepository.countRequestsInTimeWindow(
      apiKey.id,
      requestContext.endpoint,
      oneHourAgo,
      new Date()
    );

    return this.fraudDetectionService.calculateFraudScore({
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      endpoint: requestContext.endpoint,
      transactionValue: requestContext.transactionValue,
      recentRequests,
      geographicLocation: requestContext.geographicLocation,
      userType: apiKey.userType,
    });
  }

  private async getSecurityFlags(
    apiKey: ApiKeyEntity,
    requestContext: any
  ): Promise<string[]> {
    const flags: string[] = [];

    // Check for rapid requests
    const oneMinuteAgo = new Date();
    oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

    const recentRequests = await this.usageLogRepository.countRequestsInTimeWindow(
      apiKey.id,
      requestContext.endpoint,
      oneMinuteAgo,
      new Date()
    );

    if (recentRequests > 60) {
      flags.push('RAPID_REQUESTS');
    }

    // Check for high-value transactions
    if (requestContext.transactionValue && requestContext.transactionValue > 10000) {
      flags.push('HIGH_VALUE_TRANSACTION');
    }

    // Check for error patterns
    if (requestContext.statusCode >= 400) {
      flags.push('REQUEST_ERROR');
    }

    return flags;
  }

  private async logSuspiciousActivity(
    apiKey: ApiKeyEntity,
    requestContext: any,
    reason: string,
    fraudScore?: number
  ): Promise<void> {
    const usageLog = new ApiKeyUsageLogEntity(
      '', // ID will be generated
      apiKey.id,
      requestContext.endpoint,
      requestContext.method,
      401, // Unauthorized
      requestContext.ipAddress,
      true, // is_suspicious
      [`SECURITY_VIOLATION`, reason],
      new Date(),
      undefined,
      requestContext.userAgent,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      requestContext.geographicLocation,
      fraudScore || 100,
    );

    await this.usageLogRepository.create(usageLog);
  }
}