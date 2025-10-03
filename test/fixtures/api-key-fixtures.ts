import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus, MarketplacePermission } from '../../src/api-key/domain/enums';

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

export interface TestUser {
  user_id: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  senhaHash: string;
}

export interface TestApiKey {
  id: string;
  key_id: string;
  secret_hash: string;
  name: string;
  user_type: UserType;
  status: ApiKeyStatus;
  rate_limit_tier: RateLimitTier;
  user_id: string;
  tenant_id?: string;
  store_id?: string;
  consumer_id?: string;
  compliance_level: ComplianceLevel;
  allowed_regions: string[];
  allowed_ips: string[];
  expires_at?: Date;
}

export class ApiKeyFixtures {
  static createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      user_id: 'user-123e4567-e89b-12d3-a456-426614174000',
      nome: 'Test User',
      cpf: '12345678901',
      email: 'test@example.com',
      telefone: '+5511999999999',
      senhaHash: '$2b$10$hash',
      ...overrides,
    };
  }

  static createMerchantUser(overrides: Partial<TestUser> = {}): TestUser {
    return this.createTestUser({
      user_id: 'merchant-123e4567-e89b-12d3-a456-426614174000',
      nome: 'Merchant User',
      email: 'merchant@example.com',
      cpf: '98765432100',
      ...overrides,
    });
  }

  static createConsumerUser(overrides: Partial<TestUser> = {}): TestUser {
    return this.createTestUser({
      user_id: 'consumer-123e4567-e89b-12d3-a456-426614174000',
      nome: 'Consumer User',
      email: 'consumer@example.com',
      cpf: '11122233344',
      ...overrides,
    });
  }

  static createAdminUser(overrides: Partial<TestUser> = {}): TestUser {
    return this.createTestUser({
      user_id: 'admin-123e4567-e89b-12d3-a456-426614174000',
      nome: 'Admin User',
      email: 'admin@example.com',
      cpf: '55566677788',
      ...overrides,
    });
  }

  static createMerchantApiKeyRequest(overrides: Partial<CreateApiKeyRequest> = {}): CreateApiKeyRequest {
    return {
      name: 'Merchant Test API Key',
      userType: UserType.MERCHANT,
      userId: 'merchant-123e4567-e89b-12d3-a456-426614174000',
      rateLimitTier: RateLimitTier.PREMIUM,
      storeId: 'store-123e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-123e4567-e89b-12d3-a456-426614174000',
      marketplaceContext: 'electronics',
      allowedRegions: ['BR-SP', 'BR-RJ'],
      complianceLevel: ComplianceLevel.PCI_DSS,
      allowedIps: ['192.168.1.1', '10.0.0.1'],
      ...overrides,
    };
  }

  static createConsumerApiKeyRequest(overrides: Partial<CreateApiKeyRequest> = {}): CreateApiKeyRequest {
    return {
      name: 'Consumer Test API Key',
      userType: UserType.CONSUMER,
      userId: 'consumer-123e4567-e89b-12d3-a456-426614174000',
      rateLimitTier: RateLimitTier.BASIC,
      consumerId: 'consumer-123e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-123e4567-e89b-12d3-a456-426614174000',
      marketplaceContext: 'general',
      allowedRegions: ['BR'],
      complianceLevel: ComplianceLevel.BASIC,
      ...overrides,
    };
  }

  static createAdminApiKeyRequest(overrides: Partial<CreateApiKeyRequest> = {}): CreateApiKeyRequest {
    return {
      name: 'Admin Test API Key',
      userType: UserType.ADMIN,
      userId: 'admin-123e4567-e89b-12d3-a456-426614174000',
      rateLimitTier: RateLimitTier.UNLIMITED,
      tenantId: 'tenant-123e4567-e89b-12d3-a456-426614174000',
      complianceLevel: ComplianceLevel.SOX,
      allowedRegions: ['*'],
      allowedIps: ['*'],
      ...overrides,
    };
  }

  static createExpiredApiKeyRequest(overrides: Partial<CreateApiKeyRequest> = {}): CreateApiKeyRequest {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return this.createConsumerApiKeyRequest({
      name: 'Expired Test API Key',
      expiresAt: yesterday,
      ...overrides,
    });
  }

  static createTemporaryApiKeyRequest(overrides: Partial<CreateApiKeyRequest> = {}): CreateApiKeyRequest {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.createConsumerApiKeyRequest({
      name: 'Temporary Test API Key',
      expiresAt: tomorrow,
      ...overrides,
    });
  }

  static createCryptoProviderApiKeyRequest(overrides: Partial<CreateApiKeyRequest> = {}): CreateApiKeyRequest {
    return {
      name: 'Crypto Provider API Key',
      userType: UserType.PARTNER,
      userId: 'crypto-provider-123e4567-e89b-12d3-a456-426614174000',
      rateLimitTier: RateLimitTier.ENTERPRISE,
      tenantId: 'fireblocks-tenant',
      marketplaceContext: 'crypto',
      complianceLevel: ComplianceLevel.SOX,
      allowedRegions: ['*'],
      allowedIps: ['192.168.100.1', '192.168.100.2'],
      ...overrides,
    };
  }

  static getValidApiKeyCredentials(): string {
    return 'ApiKey 550e8400-e29b-41d4-a716-446655440000:dGVzdC1zZWNyZXQtMzItYnl0ZXMtYmFzZTY0LWVuY29kZWQ=';
  }

  static getInvalidFormatApiKey(): string {
    return 'Bearer invalid-format';
  }

  static getInvalidSecretApiKey(): string {
    return 'ApiKey 550e8400-e29b-41d4-a716-446655440000:invalid-secret';
  }

  static getMalformedApiKey(): string {
    return 'ApiKey malformed';
  }

  static getEmptyApiKey(): string {
    return '';
  }

  static getValidPermissions(): string[] {
    return [
      'coupon.create',
      'coupon.update',
      'coupon.delete',
      'analytics.view',
      'inventory.update',
      'revenue.read',
    ];
  }

  static getConsumerPermissions(): string[] {
    return [
      'coupon.search',
      'coupon.purchase',
      'coupon.redeem',
      'wallet.view',
      'transaction.history',
    ];
  }

  static getAdminPermissions(): string[] {
    return [
      'admin.all',
      'system.config',
      'user.manage',
      'merchant.manage',
      'compliance.override',
    ];
  }

  static getComplianceTestScenarios(): Array<{
    scenario: string;
    complianceLevel: ComplianceLevel;
    transactionValue: number;
    kycLevel: 'basic' | 'advanced';
    shouldPass: boolean;
    expectedError?: string;
  }> {
    return [
      {
        scenario: 'Basic KYC - Low Value Transaction',
        complianceLevel: ComplianceLevel.BASIC,
        transactionValue: 100,
        kycLevel: 'basic',
        shouldPass: true,
      },
      {
        scenario: 'Basic KYC - High Value Transaction',
        complianceLevel: ComplianceLevel.BASIC,
        transactionValue: 200000,
        kycLevel: 'basic',
        shouldPass: false,
        expectedError: 'Transaction value exceeds KYC limit',
      },
      {
        scenario: 'Advanced KYC - High Value Transaction',
        complianceLevel: ComplianceLevel.LGPD,
        transactionValue: 200000,
        kycLevel: 'advanced',
        shouldPass: true,
      },
    ];
  }

  static getFraudDetectionScenarios(): Array<{
    scenario: string;
    ipAddress: string;
    userAgent: string;
    requestPattern: 'normal' | 'burst' | 'distributed' | 'scraping';
    expectedFraudScore: number;
    shouldBlock: boolean;
  }> {
    return [
      {
        scenario: 'Normal Usage Pattern',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (compatible browser)',
        requestPattern: 'normal',
        expectedFraudScore: 10,
        shouldBlock: false,
      },
      {
        scenario: 'Suspicious Burst Pattern',
        ipAddress: '10.0.0.1',
        userAgent: 'curl/7.68.0',
        requestPattern: 'burst',
        expectedFraudScore: 75,
        shouldBlock: true,
      },
      {
        scenario: 'Distributed Attack Pattern',
        ipAddress: '203.0.113.1',
        userAgent: 'python-requests/2.25.1',
        requestPattern: 'distributed',
        expectedFraudScore: 85,
        shouldBlock: true,
      },
      {
        scenario: 'Web Scraping Pattern',
        ipAddress: '198.51.100.1',
        userAgent: 'Scrapy/2.5.0',
        requestPattern: 'scraping',
        expectedFraudScore: 90,
        shouldBlock: true,
      },
    ];
  }
}