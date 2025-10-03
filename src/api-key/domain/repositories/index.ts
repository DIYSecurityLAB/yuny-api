import { ApiKeyEntity, ApiKeyUsageLogEntity, ApiKeyRateLimitEntity } from '../entities';
import { UserType, ApiKeyStatus, RateLimitTier } from '../enums';

// Repository interface for API Key management
export interface ApiKeyRepository {
  // Basic CRUD operations
  create(apiKey: ApiKeyEntity): Promise<ApiKeyEntity>;
  findById(id: string): Promise<ApiKeyEntity | null>;
  findByKeyId(keyId: string): Promise<ApiKeyEntity | null>;
  findByUserId(userId: string): Promise<ApiKeyEntity[]>;
  update(apiKey: ApiKeyEntity): Promise<ApiKeyEntity>;
  delete(id: string): Promise<void>;

  // Business queries
  findActiveByKeyId(keyId: string): Promise<ApiKeyEntity | null>;
  findByUserIdAndType(userId: string, userType: UserType): Promise<ApiKeyEntity[]>;
  findByTenant(tenantId: string): Promise<ApiKeyEntity[]>;
  findByStore(storeId: string): Promise<ApiKeyEntity[]>;
  findExpiredKeys(): Promise<ApiKeyEntity[]>;
  findUnusedKeys(daysUnused: number): Promise<ApiKeyEntity[]>;

  // Multi-tenant support
  findByTenantAndType(tenantId: string, userType: UserType): Promise<ApiKeyEntity[]>;
  
  // Pagination support
  findAll(offset: number, limit: number): Promise<{
    data: ApiKeyEntity[];
    total: number;
  }>;

  // Bulk operations
  bulkUpdateStatus(keyIds: string[], status: ApiKeyStatus): Promise<void>;
  bulkDelete(keyIds: string[]): Promise<void>;
}

// Repository interface for Usage Logs
export interface ApiKeyUsageLogRepository {
  // Basic operations
  create(log: ApiKeyUsageLogEntity): Promise<ApiKeyUsageLogEntity>;
  findById(id: string): Promise<ApiKeyUsageLogEntity | null>;
  
  // Analytics queries
  findByApiKeyId(
    apiKeyId: string, 
    startDate: Date, 
    endDate: Date,
    offset?: number,
    limit?: number
  ): Promise<{
    data: ApiKeyUsageLogEntity[];
    total: number;
  }>;

  findByMerchantId(
    merchantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ApiKeyUsageLogEntity[]>;

  // Rate limiting support
  countRequestsInTimeWindow(
    apiKeyId: string,
    endpoint: string,
    windowStart: Date,
    windowEnd: Date
  ): Promise<number>;

  // Fraud detection
  findSuspiciousActivity(
    startDate: Date,
    endDate: Date,
    fraudThreshold: number
  ): Promise<ApiKeyUsageLogEntity[]>;

  // Aggregation queries
  getUsageStats(
    apiKeyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    topEndpoints: { endpoint: string; count: number }[];
  }>;

  getRevenueStats(
    merchantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRevenue: number;
    transactionCount: number;
    averageTransactionValue: number;
    topCategories: { category: string; revenue: number }[];
  }>;

  // Cleanup operations
  deleteOldLogs(olderThan: Date): Promise<number>;
  archiveLogs(olderThan: Date): Promise<number>;
}

// Repository interface for Rate Limits
export interface ApiKeyRateLimitRepository {
  // Basic operations
  create(rateLimit: ApiKeyRateLimitEntity): Promise<ApiKeyRateLimitEntity>;
  findById(id: string): Promise<ApiKeyRateLimitEntity | null>;
  findByApiKeyId(apiKeyId: string): Promise<ApiKeyRateLimitEntity[]>;
  findByApiKeyIdAndEndpoint(
    apiKeyId: string, 
    endpoint: string
  ): Promise<ApiKeyRateLimitEntity | null>;
  update(rateLimit: ApiKeyRateLimitEntity): Promise<ApiKeyRateLimitEntity>;
  delete(id: string): Promise<void>;

  // Business queries
  findByEndpointPattern(pattern: string): Promise<ApiKeyRateLimitEntity[]>;
  findByTier(tier: RateLimitTier): Promise<ApiKeyRateLimitEntity[]>;

  // Bulk operations
  bulkCreateForApiKey(
    apiKeyId: string, 
    rateLimits: Omit<ApiKeyRateLimitEntity, 'id' | 'apiKeyId'>[]
  ): Promise<ApiKeyRateLimitEntity[]>;
  
  bulkUpdateForTier(
    tier: RateLimitTier,
    updates: Partial<ApiKeyRateLimitEntity>
  ): Promise<void>;
}

// Specialized queries interface
export interface ApiKeyAnalyticsRepository {
  // Dashboard metrics
  getApiKeyMetrics(tenantId?: string): Promise<{
    totalActiveKeys: number;
    totalRequests24h: number;
    totalRevenue24h: number;
    topMerchants: { merchantId: string; requests: number; revenue: number }[];
    errorRate: number;
    averageResponseTime: number;
  }>;

  // Performance monitoring
  getPerformanceMetrics(
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week'
  ): Promise<{
    timestamp: Date;
    requests: number;
    errors: number;
    averageResponseTime: number;
    revenue: number;
  }[]>;

  // Security monitoring
  getSecurityMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    suspiciousRequests: number;
    blockedIps: string[];
    fraudulentTransactions: number;
    complianceViolations: number;
  }>;

  // Merchant analytics
  getMerchantInsights(
    merchantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    revenue: number;
    topProducts: { category: string; sales: number }[];
    conversionRate: number;
    averageOrderValue: number;
  }>;
}