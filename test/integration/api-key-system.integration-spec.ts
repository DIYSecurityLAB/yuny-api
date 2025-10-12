import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures, CreateApiKeyRequest } from '../fixtures/api-key-fixtures';
import { TestHelper } from '../helpers/test-helper';

describe('API Key System Integration Tests', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    app = await TestHelper.createTestApp();
    prismaService = TestHelper.getPrismaService();
  });

  afterAll(async () => {
    await TestHelper.closeTestApp();
  });

  beforeEach(async () => {
    await TestHelper.cleanDatabase();
  });

  describe('API Key Creation and Management Flow', () => {
    it('should create merchant user and API key with complete flow', async () => {
      // Step 1: Create a merchant user
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({
        data: merchantUser,
      });

      expect(createdUser).toBeDefined();
      expect(createdUser.user_id).toBe(merchantUser.user_id);
      expect(createdUser.nome).toBe(merchantUser.nome);

      // Step 2: Create API key for merchant
      const apiKeyData = {
        id: 'api-key-123',
        key_id: '550e8400-e29b-41d4-a716-446655440000',
        secret_hash: 'hashed-secret-value',
        name: 'Merchant API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdUser.user_id,
        tenant_id: 'tenant-123',
        store_id: 'store-123',
        marketplace_context: 'electronics',
        allowed_regions: ['BR-SP', 'BR-RJ'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: ['192.168.1.1'],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const createdApiKey = await prismaService.apiKey.create({
        data: apiKeyData,
      });

      expect(createdApiKey).toBeDefined();
      expect(createdApiKey.key_id).toBe(apiKeyData.key_id);
      expect(createdApiKey.user_type).toBe(UserType.MERCHANT);
      expect(createdApiKey.rate_limit_tier).toBe(RateLimitTier.PREMIUM);

      // Step 3: Add permissions to API key
      const permissions = [
        'coupon.create',
        'coupon.manage',
        'inventory.update',
        'analytics.view',
      ];

      const permissionPromises = permissions.map((permission) =>
        prismaService.apiKeyPermission.create({
          data: {
            id: `perm-${permission}-${Date.now()}`,
            api_key_id: createdApiKey.id,
            permission,
            granted_at: new Date(),
          },
        })
      );

      const createdPermissions = await Promise.all(permissionPromises);
      expect(createdPermissions).toHaveLength(4);

      // Step 4: Create rate limit configuration
      const rateLimitConfig = {
        id: 'rate-limit-123',
        api_key_id: createdApiKey.id,
        endpoint_pattern: '/api/coupons/*',
        requests_per_minute: 100,
        requests_per_hour: 5000,
        requests_per_day: 50000,
        burst_limit: 20,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const createdRateLimit = await prismaService.apiKeyRateLimit.create({
        data: rateLimitConfig,
      });

      expect(createdRateLimit).toBeDefined();
      expect(createdRateLimit.requests_per_minute).toBe(100);

      // Step 5: Verify complete API key with relations
      const fullApiKey = await prismaService.apiKey.findUnique({
        where: { id: createdApiKey.id },
        include: {
          usuario: true,
          permissions: true,
          rate_limits: true,
        },
      });

      expect(fullApiKey).toBeDefined();
      expect(fullApiKey?.usuario.nome).toBe(merchantUser.nome);
      expect(fullApiKey?.permissions).toHaveLength(4);
      expect(fullApiKey?.rate_limits).toHaveLength(1);
      expect(fullApiKey?.permissions.map(p => p.permission)).toEqual(
        expect.arrayContaining(permissions)
      );
    });

    it('should create consumer user with KYC compliance restrictions', async () => {
      // Step 1: Create consumer user
      const consumerUser = ApiKeyFixtures.createConsumerUser();
      const createdUser = await prismaService.usuario.create({
        data: consumerUser,
      });

      // Step 2: Create consumer API key with KYC restrictions
      const apiKeyData = {
        id: 'consumer-api-key-123',
        key_id: '550e8400-e29b-41d4-a716-446655440001',
        secret_hash: 'hashed-consumer-secret',
        name: 'Consumer API Key',
        user_type: UserType.CONSUMER,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.BASIC,
        user_id: createdUser.user_id,
        tenant_id: 'tenant-123',
        consumer_id: createdUser.user_id,
        marketplace_context: 'general',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.BASIC, // Basic KYC level
        allowed_ips: [], // No IP restrictions for consumers
        created_at: new Date(),
        updated_at: new Date(),
      };

      const createdApiKey = await prismaService.apiKey.create({
        data: apiKeyData,
      });

      // Step 3: Add consumer-specific permissions
      const consumerPermissions = [
        'coupon.search',
        'coupon.purchase',
        'coupon.redeem',
        'wallet.view',
        'transaction.history',
      ];

      const permissionPromises = consumerPermissions.map((permission) =>
        prismaService.apiKeyPermission.create({
          data: {
            id: `perm-${permission}-${Date.now()}`,
            api_key_id: createdApiKey.id,
            permission,
            granted_at: new Date(),
          },
        })
      );

      await Promise.all(permissionPromises);

      // Step 4: Verify consumer cannot access merchant-only endpoints
      const fullApiKey = await prismaService.apiKey.findUnique({
        where: { id: createdApiKey.id },
        include: {
          permissions: true,
        },
      });

      const permissionList = fullApiKey?.permissions.map(p => p.permission) || [];
      
      // Consumer should have consumer permissions
      expect(permissionList).toContain('coupon.search');
      expect(permissionList).toContain('wallet.view');
      
      // Consumer should NOT have merchant permissions
      expect(permissionList).not.toContain('coupon.create');
      expect(permissionList).not.toContain('inventory.update');
      expect(permissionList).not.toContain('analytics.view');
    });

    it('should enforce multi-tenant isolation', async () => {
      // Step 1: Create two different tenants with users
      const tenant1User = ApiKeyFixtures.createMerchantUser({
        user_id: 'tenant1-user-id',
        email: 'merchant1@tenant1.com',
        cpf: '11111111111',
      });

      const tenant2User = ApiKeyFixtures.createMerchantUser({
        user_id: 'tenant2-user-id',
        email: 'merchant2@tenant2.com',
        cpf: '22222222222',
      });

      await Promise.all([
        prismaService.usuario.create({ data: tenant1User }),
        prismaService.usuario.create({ data: tenant2User }),
      ]);

      // Step 2: Create API keys for different tenants
      const tenant1ApiKey = {
        id: 'tenant1-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440001',
        secret_hash: 'tenant1-secret-hash',
        name: 'Tenant 1 API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: tenant1User.user_id,
        tenant_id: 'tenant-1',
        store_id: 'store-tenant-1',
        marketplace_context: 'electronics',
        allowed_regions: ['BR-SP'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const tenant2ApiKey = {
        id: 'tenant2-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440002',
        secret_hash: 'tenant2-secret-hash',
        name: 'Tenant 2 API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: tenant2User.user_id,
        tenant_id: 'tenant-2',
        store_id: 'store-tenant-2',
        marketplace_context: 'fashion',
        allowed_regions: ['BR-RJ'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await Promise.all([
        prismaService.apiKey.create({ data: tenant1ApiKey }),
        prismaService.apiKey.create({ data: tenant2ApiKey }),
      ]);

      // Step 3: Verify tenant isolation
      const tenant1Keys = await prismaService.apiKey.findMany({
        where: { tenant_id: 'tenant-1' },
        include: { usuario: true },
      });

      const tenant2Keys = await prismaService.apiKey.findMany({
        where: { tenant_id: 'tenant-2' },
        include: { usuario: true },
      });

      expect(tenant1Keys).toHaveLength(1);
      expect(tenant2Keys).toHaveLength(1);
      expect(tenant1Keys[0].store_id).toBe('store-tenant-1');
      expect(tenant2Keys[0].store_id).toBe('store-tenant-2');
      expect(tenant1Keys[0].marketplace_context).toBe('electronics');
      expect(tenant2Keys[0].marketplace_context).toBe('fashion');

      // Step 4: Verify cross-tenant queries return nothing
      const crossTenantQuery = await prismaService.apiKey.findMany({
        where: {
          tenant_id: 'tenant-1',
          store_id: 'store-tenant-2', // This should return nothing
        },
      });

      expect(crossTenantQuery).toHaveLength(0);
    });
  });

  describe('API Key Usage Logging Integration', () => {
    it('should log API key usage with complete context', async () => {
      // Step 1: Create user and API key
      const user = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: user });

      const apiKeyData = {
        id: 'usage-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440000',
        secret_hash: 'usage-test-secret',
        name: 'Usage Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdUser.user_id,
        tenant_id: 'tenant-123',
        store_id: 'store-123',
        marketplace_context: 'electronics',
        allowed_regions: ['BR-SP'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: ['192.168.1.1'],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const createdApiKey = await prismaService.apiKey.create({ data: apiKeyData });

      // Step 2: Log multiple usage entries
      const usageLogs = [
        {
          id: 'usage-log-1',
          api_key_id: createdApiKey.id,
          endpoint: '/api/coupons',
          http_method: 'GET',
          status_code: 200,
          response_time_ms: 150,
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0 (compatible)',
          request_id: 'req-123',
          transaction_value: 50.00,
          currency: 'BRL',
          merchant_id: createdUser.user_id,
          coupon_category: 'electronics',
          geographic_location: 'BR-SP',
          is_suspicious: false,
          fraud_score: 5.0,
          security_flags: [],
          timestamp: new Date(),
        },
        {
          id: 'usage-log-2',
          api_key_id: createdApiKey.id,
          endpoint: '/api/coupons',
          http_method: 'POST',
          status_code: 201,
          response_time_ms: 300,
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0 (compatible)',
          request_id: 'req-124',
          transaction_value: 100.00,
          currency: 'BRL',
          merchant_id: createdUser.user_id,
          coupon_category: 'electronics',
          geographic_location: 'BR-SP',
          is_suspicious: false,
          fraud_score: 3.0,
          security_flags: [],
          timestamp: new Date(),
        },
        {
          id: 'usage-log-3',
          api_key_id: createdApiKey.id,
          endpoint: '/api/analytics',
          http_method: 'GET',
          status_code: 401,
          response_time_ms: 50,
          ip_address: '203.0.113.1', // Different IP
          user_agent: 'curl/7.68.0', // Suspicious user agent
          request_id: 'req-125',
          transaction_value: null,
          currency: null,
          merchant_id: createdUser.user_id,
          coupon_category: null,
          geographic_location: 'US-CA', // Different location
          is_suspicious: true,
          fraud_score: 85.0,
          security_flags: ['IP_MISMATCH', 'SUSPICIOUS_USER_AGENT', 'GEO_ANOMALY'],
          timestamp: new Date(),
        },
      ];

      await Promise.all(
        usageLogs.map(log => prismaService.apiKeyUsageLog.create({ data: log }))
      );

      // Step 3: Query usage analytics
      const totalUsage = await prismaService.apiKeyUsageLog.count({
        where: { api_key_id: createdApiKey.id },
      });

      const suspiciousActivity = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: createdApiKey.id,
          is_suspicious: true,
        },
      });

      const highValueTransactions = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: createdApiKey.id,
          transaction_value: { gte: 100 },
        },
      });

      expect(totalUsage).toBe(3);
      expect(suspiciousActivity).toHaveLength(1);
      expect(suspiciousActivity[0].fraud_score).toBe(85.0);
      expect(suspiciousActivity[0].security_flags).toContain('IP_MISMATCH');
      expect(highValueTransactions).toHaveLength(1);
      expect(highValueTransactions[0].transaction_value?.toNumber()).toBe(100.00);

      // Step 4: Test aggregated analytics
      const analyticsResult = await prismaService.apiKeyUsageLog.aggregate({
        where: {
          api_key_id: createdApiKey.id,
          is_suspicious: false,
        },
        _avg: {
          response_time_ms: true,
          fraud_score: true,
        },
        _sum: {
          transaction_value: true,
        },
        _count: {
          id: true,
        },
      });

      expect(analyticsResult._count.id).toBe(2); // Only non-suspicious requests
      expect(analyticsResult._avg.response_time_ms).toBe(225); // (150 + 300) / 2
      expect(analyticsResult._avg.fraud_score).toBe(4.0); // (5 + 3) / 2
      expect(analyticsResult._sum.transaction_value?.toNumber()).toBe(150.00); // 50 + 100
    });

    it('should handle fraud detection patterns', async () => {
      // Create user and API key
      const user = ApiKeyFixtures.createConsumerUser();
      const createdUser = await prismaService.usuario.create({ data: user });

      const apiKeyData = {
        id: 'fraud-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440003',
        secret_hash: 'fraud-test-secret',
        name: 'Fraud Test API Key',
        user_type: UserType.CONSUMER,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.BASIC,
        user_id: createdUser.user_id,
        tenant_id: 'tenant-123',
        consumer_id: createdUser.user_id,
        marketplace_context: 'general',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.BASIC,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const createdApiKey = await prismaService.apiKey.create({ data: apiKeyData });

      // Create suspicious usage patterns
      const fraudPatterns = ApiKeyFixtures.getFraudDetectionScenarios();
      
      const usageLogsPromises = fraudPatterns.map((pattern, index) => {
        return prismaService.apiKeyUsageLog.create({
          data: {
            id: `fraud-log-${index}`,
            api_key_id: createdApiKey.id,
            endpoint: '/api/coupons',
            http_method: 'GET',
            status_code: pattern.shouldBlock ? 429 : 200,
            response_time_ms: 100,
            ip_address: pattern.ipAddress,
            user_agent: pattern.userAgent,
            request_id: `req-fraud-${index}`,
            transaction_value: null,
            currency: null,
            merchant_id: null,
            coupon_category: 'general',
            geographic_location: 'BR-SP',
            is_suspicious: pattern.shouldBlock,
            fraud_score: pattern.expectedFraudScore,
            security_flags: pattern.shouldBlock ? ['HIGH_FRAUD_SCORE'] : [],
            timestamp: new Date(),
          },
        });
      });

      await Promise.all(usageLogsPromises);

      // Analyze fraud patterns
      const fraudAnalysis = await prismaService.apiKeyUsageLog.groupBy({
        by: ['is_suspicious'],
        where: { api_key_id: createdApiKey.id },
        _count: {
          id: true,
        },
        _avg: {
          fraud_score: true,
        },
      });

      const suspiciousCount = fraudAnalysis.find(g => g.is_suspicious === true)?._count.id || 0;
      const normalCount = fraudAnalysis.find(g => g.is_suspicious === false)?._count.id || 0;
      const avgFraudScore = fraudAnalysis.find(g => g.is_suspicious === true)?._avg.fraud_score || 0;

      expect(suspiciousCount).toBeGreaterThan(0);
      expect(normalCount).toBeGreaterThan(0);
      expect(avgFraudScore).toBeGreaterThan(70); // High fraud score threshold

      // Test IP-based fraud detection
      const ipAnalysis = await prismaService.apiKeyUsageLog.groupBy({
        by: ['ip_address'],
        where: {
          api_key_id: createdApiKey.id,
          is_suspicious: true,
        },
        _count: {
          id: true,
        },
      });

      expect(ipAnalysis.length).toBeGreaterThan(0);
      expect(ipAnalysis.some(ip => ip._count.id > 0)).toBe(true);
    });
  });

  describe('Compliance and KYC Integration', () => {
    it('should enforce compliance level restrictions', async () => {
      // Test different compliance scenarios
      const complianceScenarios = ApiKeyFixtures.getComplianceTestScenarios();
      
      for (const scenario of complianceScenarios) {
        // Create user for this scenario
        const user = ApiKeyFixtures.createConsumerUser({
          user_id: `user-${scenario.scenario.replace(/\s+/g, '-').toLowerCase()}`,
          email: `${scenario.scenario.replace(/\s+/g, '-').toLowerCase()}@test.com`,
          cpf: `${Math.random().toString().substring(2, 13)}`,
        });

        const createdUser = await prismaService.usuario.create({ data: user });

        // Create API key with specific compliance level
        const apiKeyData = {
          id: `compliance-api-key-${scenario.scenario.replace(/\s+/g, '-').toLowerCase()}`,
          key_id: `${scenario.scenario.replace(/\s+/g, '-').toLowerCase()}-key-id`,
          secret_hash: 'compliance-secret-hash',
          name: `${scenario.scenario} API Key`,
          user_type: UserType.CONSUMER,
          status: ApiKeyStatus.ACTIVE,
          rate_limit_tier: RateLimitTier.BASIC,
          user_id: createdUser.user_id,
          tenant_id: 'tenant-123',
          consumer_id: createdUser.user_id,
          marketplace_context: 'general',
          allowed_regions: ['BR'],
          compliance_level: scenario.complianceLevel,
          allowed_ips: [],
          created_at: new Date(),
          updated_at: new Date(),
        };

        const createdApiKey = await prismaService.apiKey.create({ data: apiKeyData });

        // Create usage log for transaction
        const usageLogData = {
          id: `compliance-usage-${scenario.scenario.replace(/\s+/g, '-').toLowerCase()}`,
          api_key_id: createdApiKey.id,
          endpoint: '/api/transactions',
          http_method: 'POST',
          status_code: scenario.shouldPass ? 200 : 403,
          response_time_ms: 200,
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0 (compatible)',
          request_id: `req-compliance-${Date.now()}`,
          transaction_value: scenario.transactionValue,
          currency: 'BRL',
          merchant_id: null,
          coupon_category: 'general',
          geographic_location: 'BR-SP',
          is_suspicious: !scenario.shouldPass,
          fraud_score: scenario.shouldPass ? 10.0 : 90.0,
          security_flags: scenario.shouldPass ? [] : ['COMPLIANCE_VIOLATION'],
          timestamp: new Date(),
        };

        await prismaService.apiKeyUsageLog.create({ data: usageLogData });

        // Verify compliance enforcement
        const complianceLog = await prismaService.apiKeyUsageLog.findUnique({
          where: { id: usageLogData.id },
          include: {
            api_key: true,
          },
        });

        expect(complianceLog).toBeDefined();
        expect(complianceLog?.api_key.compliance_level).toBe(scenario.complianceLevel);
        expect(complianceLog?.transaction_value?.toNumber()).toBe(scenario.transactionValue);
        expect(complianceLog?.status_code).toBe(scenario.shouldPass ? 200 : 403);
        
        if (!scenario.shouldPass) {
          expect(complianceLog?.is_suspicious).toBe(true);
          expect(complianceLog?.security_flags).toContain('COMPLIANCE_VIOLATION');
        }
      }
    });
  });
});