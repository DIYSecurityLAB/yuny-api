import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { ApiKeyEntity, ApiKeyCredentials } from '../entities';
import { UserType, ApiKeyStatus, RateLimitTier, ComplianceLevel, MarketplacePermission } from '../enums';

// Domain Service for API Key generation and validation
@Injectable()
export class ApiKeyDomainService {
  private readonly secretKey: string;

  constructor() {
    this.secretKey = process.env.API_KEY_SECRET || 'default-secret-key-change-in-production';
  }

  /**
   * Generate a new API key with secure credentials
   */
  generateApiKey(params: {
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
    permissions?: MarketplacePermission[];
  }): {
    apiKey: ApiKeyEntity;
    credentials: ApiKeyCredentials;
  } {
    // Generate unique key ID (UUID v4)
    const keyId = uuid();
    
    // Generate random secret (32 bytes in base64)
    const secret = crypto.randomBytes(32).toString('base64');
    
    // Calculate HMAC-SHA256 hash of secret
    const secretHash = this.calculateSecretHash(secret);

    // Create API key entity
    const apiKey = new ApiKeyEntity(
      uuid(), // id
      keyId,
      secretHash,
      params.name,
      params.userType,
      params.userId,
      ApiKeyStatus.ACTIVE,
      params.rateLimitTier || this.getDefaultRateLimitTier(params.userType),
      params.allowedRegions || [],
      params.complianceLevel || ComplianceLevel.BASIC,
      params.allowedIps || [],
      [], // permissions - will be set separately
      [], // rateLimits - will be set separately
      new Date(), // createdAt
      new Date(), // updatedAt
      params.tenantId,
      params.storeId,
      params.consumerId,
      params.marketplaceContext,
      undefined, // webhookSignatureSecret
      params.expiresAt,
      undefined, // lastUsedAt
    );

    // Create credentials (secret is only shown once)
    const credentials = new ApiKeyCredentials(keyId, secret);

    return { apiKey, credentials };
  }

  /**
   * Validate API key credentials
   */
  validateCredentials(
    credentials: ApiKeyCredentials,
    storedSecretHash: string
  ): boolean {
    const calculatedHash = this.calculateSecretHash(credentials.secret);
    return calculatedHash === storedSecretHash;
  }

  /**
   * Parse API key from authorization header
   */
  parseApiKeyFromHeader(authHeader: string): ApiKeyCredentials | null {
    if (!authHeader) {
      return null;
    }

    // Extract x-api-key header format: "ApiKey uuid:secret"
    return ApiKeyCredentials.fromString(authHeader);
  }

  /**
   * Generate webhook signature secret
   */
  generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Check if API key should be rotated
   */
  shouldRotateKey(apiKey: ApiKeyEntity): boolean {
    if (!apiKey.lastUsedAt) {
      return false;
    }

    // Rotate if key is older than 90 days and has been used recently
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return (
      apiKey.createdAt < ninetyDaysAgo &&
      apiKey.lastUsedAt > sevenDaysAgo
    );
  }

  /**
   * Generate temporary API key for campaigns
   */
  generateTemporaryApiKey(params: {
    name: string;
    userType: UserType;
    userId: string;
    durationHours: number;
    permissions: MarketplacePermission[];
    campaignContext?: string;
  }): {
    apiKey: ApiKeyEntity;
    credentials: ApiKeyCredentials;
  } {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + params.durationHours);

    return this.generateApiKey({
      ...params,
      expiresAt,
      marketplaceContext: params.campaignContext || 'temporary-campaign',
      rateLimitTier: RateLimitTier.PREMIUM, // Higher limits for campaigns
    });
  }

  private calculateSecretHash(secret: string): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(secret)
      .digest('hex');
  }

  private getDefaultRateLimitTier(userType: UserType): RateLimitTier {
    switch (userType) {
      case UserType.ADMIN:
      case UserType.PLATFORM:
        return RateLimitTier.UNLIMITED;
      case UserType.MERCHANT:
        return RateLimitTier.PREMIUM;
      case UserType.WEBHOOK:
        return RateLimitTier.ENTERPRISE;
      case UserType.CONSUMER:
      case UserType.PARTNER:
      default:
        return RateLimitTier.BASIC;
    }
  }
}

// Domain Service for permission management
@Injectable()
export class PermissionDomainService {
  /**
   * Get default permissions for user type
   */
  getDefaultPermissions(userType: UserType): MarketplacePermission[] {
    switch (userType) {
      case UserType.MERCHANT:
        return [
          MarketplacePermission.COUPON_CREATE,
          MarketplacePermission.COUPON_MANAGE,
          MarketplacePermission.INVENTORY_UPDATE,
          MarketplacePermission.ANALYTICS_VIEW,
          MarketplacePermission.STORE_PROFILE,
          MarketplacePermission.REVENUE_READ,
        ];

      case UserType.CONSUMER:
        return [
          MarketplacePermission.COUPON_SEARCH,
          MarketplacePermission.COUPON_PURCHASE,
          MarketplacePermission.COUPON_REDEEM,
          MarketplacePermission.WALLET_VIEW,
          MarketplacePermission.TRANSACTION_HISTORY,
        ];

      case UserType.PLATFORM:
        return [
          MarketplacePermission.MARKETPLACE_ANALYTICS,
          MarketplacePermission.MERCHANT_MANAGE,
          MarketplacePermission.CONSUMER_SUPPORT,
          MarketplacePermission.SYSTEM_CONFIG,
        ];

      case UserType.WEBHOOK:
        return [
          MarketplacePermission.WEBHOOK_RECEIVE,
          MarketplacePermission.NOTIFICATION_SEND,
          MarketplacePermission.EVENT_PROCESS,
        ];

      case UserType.ADMIN:
        return [MarketplacePermission.ADMIN_ALL];

      case UserType.PARTNER:
        return [
          MarketplacePermission.COUPON_SEARCH,
          MarketplacePermission.ANALYTICS_VIEW,
        ];

      default:
        return [];
    }
  }

  /**
   * Check if permission is allowed for user type
   */
  isPermissionAllowedForUserType(
    permission: MarketplacePermission,
    userType: UserType
  ): boolean {
    const allowedPermissions = this.getDefaultPermissions(userType);
    return allowedPermissions.includes(permission) || 
           allowedPermissions.includes(MarketplacePermission.ADMIN_ALL);
  }

  /**
   * Expand permissions including inherited ones
   */
  expandPermissions(permissions: MarketplacePermission[]): MarketplacePermission[] {
    const expanded = new Set(permissions);

    for (const permission of permissions) {
      if (permission === MarketplacePermission.ADMIN_ALL) {
        // Add all permissions
        Object.values(MarketplacePermission).forEach(p => expanded.add(p));
      }
      // Add other hierarchy expansions as needed
    }

    return Array.from(expanded);
  }

  /**
   * Validate permission compatibility with compliance level
   */
  validatePermissionCompliance(
    permission: MarketplacePermission,
    complianceLevel: ComplianceLevel
  ): boolean {
    // Define compliance-sensitive permissions
    const pciSensitive = [
      MarketplacePermission.COUPON_PURCHASE,
      MarketplacePermission.TRANSACTION_HISTORY,
      MarketplacePermission.REVENUE_READ,
    ];

    const gdprSensitive = [
      MarketplacePermission.CONSUMER_SUPPORT,
      MarketplacePermission.USER_MANAGE,
      MarketplacePermission.PROFILE_UPDATE,
    ];

    switch (complianceLevel) {
      case ComplianceLevel.PCI_DSS:
        return !pciSensitive.includes(permission) || 
               this.isHighSecurityEnvironment();

      case ComplianceLevel.GDPR:
      case ComplianceLevel.LGPD:
        return !gdprSensitive.includes(permission) ||
               this.hasDataProcessingConsent();

      default:
        return true;
    }
  }

  private isHighSecurityEnvironment(): boolean {
    // Implementation would check environment security level
    return process.env.NODE_ENV === 'production' && 
           process.env.PCI_COMPLIANCE === 'true';
  }

  private hasDataProcessingConsent(): boolean {
    // Implementation would check consent management system
    return true; // Simplified for example
  }
}

// Domain Service for fraud detection
@Injectable()
export class FraudDetectionService {
  /**
   * Calculate fraud score for API request
   */
  calculateFraudScore(params: {
    ipAddress: string;
    userAgent?: string;
    endpoint: string;
    transactionValue?: number;
    recentRequests: number;
    geographicLocation?: string;
    userType: UserType;
  }): number {
    let score = 0;

    // IP-based scoring
    if (this.isKnownMaliciousIp(params.ipAddress)) {
      score += 50;
    }

    // Rate-based scoring
    if (params.recentRequests > 100) {
      score += 20;
    }

    // Transaction-based scoring
    if (params.transactionValue && params.transactionValue > 10000) {
      score += 15;
    }

    // Geographic scoring
    if (params.geographicLocation && this.isHighRiskRegion(params.geographicLocation)) {
      score += 10;
    }

    // User type based scoring
    if (params.userType === UserType.CONSUMER && params.transactionValue && params.transactionValue > 5000) {
      score += 25;
    }

    return Math.min(score, 100);
  }

  /**
   * Detect anomalous patterns
   */
  detectAnomalousPatterns(requests: {
    timestamp: Date;
    endpoint: string;
    ipAddress: string;
    statusCode: number;
  }[]): string[] {
    const flags: string[] = [];

    // Rapid succession requests
    const rapidRequests = this.detectRapidRequests(requests);
    if (rapidRequests) {
      flags.push('RAPID_REQUESTS');
    }

    // Scanning behavior
    const scanningBehavior = this.detectScanningBehavior(requests);
    if (scanningBehavior) {
      flags.push('ENDPOINT_SCANNING');
    }

    // Error pattern
    const errorPattern = this.detectErrorPatterns(requests);
    if (errorPattern) {
      flags.push('HIGH_ERROR_RATE');
    }

    return flags;
  }

  private isKnownMaliciousIp(ip: string): boolean {
    // Implementation would check against threat intelligence feeds
    const maliciousIps = [
      // Example malicious IPs
      '192.168.1.100',
      '10.0.0.50',
    ];
    return maliciousIps.includes(ip);
  }

  private isHighRiskRegion(region: string): boolean {
    const highRiskRegions = ['XX', 'YY']; // Placeholder
    return highRiskRegions.includes(region);
  }

  private detectRapidRequests(requests: { timestamp: Date }[]): boolean {
    if (requests.length < 10) return false;

    const sortedRequests = requests.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const timeWindow = 60000; // 1 minute
    
    for (let i = 0; i <= sortedRequests.length - 10; i++) {
      const windowStart = sortedRequests[i].timestamp.getTime();
      const windowEnd = sortedRequests[i + 9].timestamp.getTime();
      
      if (windowEnd - windowStart < timeWindow) {
        return true; // 10 requests in less than 1 minute
      }
    }

    return false;
  }

  private detectScanningBehavior(requests: { endpoint: string }[]): boolean {
    const uniqueEndpoints = new Set(requests.map(r => r.endpoint));
    return uniqueEndpoints.size > 20; // More than 20 different endpoints
  }

  private detectErrorPatterns(requests: { statusCode: number }[]): boolean {
    const errorRequests = requests.filter(r => r.statusCode >= 400);
    const errorRate = errorRequests.length / requests.length;
    return errorRate > 0.5; // More than 50% error rate
  }
}