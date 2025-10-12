import { UserType, ApiKeyStatus, RateLimitTier, ComplianceLevel, MarketplacePermission } from '../enums';

// Domain Entity: API Key
export class ApiKeyEntity {
  constructor(
    public readonly id: string,
    public readonly keyId: string,
    public readonly secretHash: string,
    public readonly name: string,
    public readonly userType: UserType,
    public readonly userId: string,
    public readonly status: ApiKeyStatus,
    public readonly rateLimitTier: RateLimitTier,
    public readonly allowedRegions: string[] = [],
    public readonly complianceLevel: ComplianceLevel = ComplianceLevel.BASIC,
    public readonly allowedIps: string[] = [],
    public readonly permissions: ApiKeyPermissionEntity[] = [],
    public readonly rateLimits: ApiKeyRateLimitEntity[] = [],
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
    public readonly tenantId?: string,
    public readonly storeId?: string,
    public readonly consumerId?: string,
    public readonly marketplaceContext?: string,
    public readonly webhookSignatureSecret?: string,
    public readonly expiresAt?: Date,
    public readonly lastUsedAt?: Date,
  ) {}

  // Business logic methods
  isActive(): boolean {
    if (this.status !== ApiKeyStatus.ACTIVE) {
      return false;
    }

    if (this.expiresAt && this.expiresAt < new Date()) {
      return false;
    }

    return true;
  }

  hasPermission(permission: MarketplacePermission, resourceType?: string): boolean {
    return this.permissions.some(p => 
      p.permission === permission && 
      (!resourceType || p.resourceType === resourceType)
    );
  }

  isIpAllowed(ip: string): boolean {
    if (this.allowedIps.length === 0) {
      return true; // No IP restriction
    }
    return this.allowedIps.includes(ip);
  }

  isRegionAllowed(region: string): boolean {
    if (this.allowedRegions.length === 0) {
      return true; // No region restriction
    }
    return this.allowedRegions.includes(region);
  }

  updateLastUsed(): void {
    // This would update the lastUsedAt field
    // In practice, this would be handled by the repository
  }

  revoke(): void {
    // Business logic for revoking an API key
    // Status would be changed to REVOKED
  }
}

// Domain Entity: API Key Permission
export class ApiKeyPermissionEntity {
  constructor(
    public readonly id: string,
    public readonly apiKeyId: string,
    public readonly permission: MarketplacePermission,
    public readonly resourceType?: string,
    public readonly grantedAt: Date = new Date(),
  ) {}
}

// Domain Entity: API Key Usage Log
export class ApiKeyUsageLogEntity {
  constructor(
    public readonly id: string,
    public readonly apiKeyId: string,
    public readonly endpoint: string,
    public readonly httpMethod: string,
    public readonly statusCode: number,
    public readonly ipAddress: string,
    public readonly isSuspicious: boolean = false,
    public readonly securityFlags: string[] = [],
    public readonly timestamp: Date = new Date(),
    public readonly responseTimeMs?: number,
    public readonly userAgent?: string,
    public readonly requestId?: string,
    public readonly transactionValue?: number,
    public readonly currency?: string,
    public readonly merchantId?: string,
    public readonly couponCategory?: string,
    public readonly geographicLocation?: string,
    public readonly fraudScore?: number,
  ) {}

  // Business logic for fraud detection
  calculateFraudScore(): number {
    let score = 0;

    // Basic fraud detection logic
    if (this.statusCode >= 400) score += 10;
    if (this.responseTimeMs && this.responseTimeMs > 5000) score += 5;
    if (this.securityFlags.length > 0) score += 20;

    return Math.min(score, 100);
  }

  isSuspiciousActivity(): boolean {
    return this.fraudScore !== undefined && this.fraudScore > 50;
  }
}

// Domain Entity: API Key Rate Limit
export class ApiKeyRateLimitEntity {
  constructor(
    public readonly id: string,
    public readonly apiKeyId: string,
    public readonly endpointPattern: string,
    public readonly requestsPerMinute: number,
    public readonly requestsPerHour: number,
    public readonly requestsPerDay: number,
    public readonly burstLimit: number,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
  ) {}

  isWithinLimit(requests: number, timeWindow: 'minute' | 'hour' | 'day'): boolean {
    switch (timeWindow) {
      case 'minute':
        return requests <= this.requestsPerMinute;
      case 'hour':
        return requests <= this.requestsPerHour;
      case 'day':
        return requests <= this.requestsPerDay;
      default:
        return false;
    }
  }
}

// Value Object: API Key Credentials
export class ApiKeyCredentials {
  constructor(
    public readonly keyId: string,
    public readonly secret: string,
  ) {}

  toString(): string {
    return `ApiKey ${this.keyId}:${this.secret}`;
  }

  static fromString(credentialString: string): ApiKeyCredentials | null {
    const match = credentialString.match(/^ApiKey\s+([^:]+):(.+)$/);
    if (!match) {
      return null;
    }

    return new ApiKeyCredentials(match[1], match[2]);
  }
}