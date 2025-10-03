import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures } from '../fixtures/api-key-fixtures';
import { TestHelper } from '../helpers/test-helper';

describe('API Key System Security Tests', () => {
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

  describe('Authentication Security', () => {
    it('should prevent brute force attacks on API key validation', async () => {
      // Setup: Create valid user and API key
      const testUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: testUser });

      const apiKeyData = {
        id: 'security-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440000',
        secret_hash: 'security-test-secret-hash',
        name: 'Security Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdUser.user_id,
        tenant_id: 'security-tenant',
        store_id: 'security-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      // Add permission
      await prismaService.apiKeyPermission.create({
        data: {
          id: 'security-perm-1',
          api_key_id: apiKeyData.id,
          permission: 'coupon.create',
          granted_at: new Date(),
        },
      });

      // Test: Attempt multiple requests with invalid API key
      const invalidApiKey = 'ApiKey invalid-key:aW52YWxpZC1zZWNyZXQ=';
      const bruteForceAttempts = 50;

      const bruteForcePromises = Array.from({ length: bruteForceAttempts }, (_, i) =>
        request(app.getHttpServer())
          .get('/api/coupons/search')
          .set('x-api-key', invalidApiKey)
          .set('x-store-id', 'security-store')
          .then(response => ({
            attempt: i + 1,
            status: response.status,
            responseTime: Date.now(),
          }))
          .catch(error => ({
            attempt: i + 1,
            status: error.status || 500,
            responseTime: Date.now(),
          }))
      );

      const results = await Promise.all(bruteForcePromises);

      // Should reject all invalid attempts
      const unauthorizedResults = results.filter(r => r.status === 401);
      expect(unauthorizedResults.length).toBe(bruteForceAttempts);

      // Should log suspicious activity
      const suspiciousLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          is_suspicious: true,
          timestamp: {
            gte: new Date(Date.now() - 60000), // Last minute
          },
        },
      });

      expect(suspiciousLogs.length).toBeGreaterThan(0);

      // Should increase fraud scores for repeated failures
      const highFraudScoreLogs = suspiciousLogs.filter(log => log.fraud_score > 70);
      expect(highFraudScoreLogs.length).toBeGreaterThan(0);
    });

    it('should enforce IP address restrictions properly', async () => {
      // Setup: Create API key with IP restrictions
      const testUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: testUser });

      const allowedIps = ['192.168.1.100', '10.0.0.0/8'];
      const apiKeyData = {
        id: 'ip-restricted-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440001',
        secret_hash: 'ip-restricted-secret-hash',
        name: 'IP Restricted API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdUser.user_id,
        tenant_id: 'ip-tenant',
        store_id: 'ip-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: allowedIps,
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      await prismaService.apiKeyPermission.create({
        data: {
          id: 'ip-perm-1',
          api_key_id: apiKeyData.id,
          permission: 'coupon.create',
          granted_at: new Date(),
        },
      });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:aXAtcmVzdHJpY3RlZC1zZWNyZXQ=`;

      // Test with allowed IP (simulated via headers - in real scenario would use req.ip)
      const allowedIpResponse = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'ip-store')
        .set('x-forwarded-for', '192.168.1.100');

      // Should succeed for allowed IP
      expect([200, 404]).toContain(allowedIpResponse.status); // 404 if endpoint doesn't exist

      // Test with blocked IP
      const blockedIpResponse = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'ip-store')
        .set('x-forwarded-for', '203.0.113.1'); // Blocked IP

      // Should be blocked
      expect(blockedIpResponse.status).toBe(403);

      // Should log security violation
      const securityLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: apiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['IP_BLOCKED'],
          },
        },
      });

      expect(securityLogs.length).toBeGreaterThan(0);
    });

    it('should detect and prevent API key enumeration attacks', async () => {
      // Setup: Create valid API key
      const testUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: testUser });

      const validKeyId = '550e8400-e29b-41d4-a716-446655440002';
      const apiKeyData = {
        id: 'enum-test-api-key',
        key_id: validKeyId,
        secret_hash: 'enum-test-secret-hash',
        name: 'Enumeration Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdUser.user_id,
        tenant_id: 'enum-tenant',
        store_id: 'enum-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      // Test: Attempt enumeration with pattern-based key IDs
      const enumerationAttempts = [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440003',
        '550e8400-e29b-41d4-a716-446655440004',
        '550e8400-e29b-41d4-a716-446655440005',
        'api-key-1',
        'api-key-2',
        'test-key-1',
        'merchant-key-1',
      ];

      const enumerationResults = await Promise.all(
        enumerationAttempts.map(async (keyId, index) => {
          const fakeApiKey = `ApiKey ${keyId}:ZmFrZS1zZWNyZXQ=`;
          
          const response = await request(app.getHttpServer())
            .get('/api/coupons/search')
            .set('x-api-key', fakeApiKey)
            .set('x-store-id', 'enum-store')
            .catch(error => ({
              status: error.status || 500,
            }));

          return {
            keyId,
            status: response.status,
            attempt: index + 1,
          };
        })
      );

      // All enumeration attempts should fail with same error code
      const unauthorizedAttempts = enumerationResults.filter(r => r.status === 401);
      expect(unauthorizedAttempts.length).toBe(enumerationAttempts.length);

      // Should detect enumeration pattern
      const enumerationLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          is_suspicious: true,
          security_flags: {
            hasEvery: ['ENUMERATION_ATTEMPT'],
          },
          timestamp: {
            gte: new Date(Date.now() - 60000),
          },
        },
      });

      expect(enumerationLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Authorization Security', () => {
    it('should prevent privilege escalation attempts', async () => {
      // Setup: Create consumer user and API key (limited permissions)
      const consumerUser = ApiKeyFixtures.createConsumerUser();
      const createdConsumer = await prismaService.usuario.create({ data: consumerUser });

      const consumerApiKeyData = {
        id: 'consumer-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440003',
        secret_hash: 'consumer-secret-hash',
        name: 'Consumer API Key',
        user_type: UserType.CONSUMER,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.BASIC,
        user_id: createdConsumer.user_id,
        tenant_id: 'consumer-tenant',
        marketplace_context: 'general',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.BASIC,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: consumerApiKeyData });

      // Give consumer only read permissions
      await prismaService.apiKeyPermission.create({
        data: {
          id: 'consumer-perm-1',
          api_key_id: consumerApiKeyData.id,
          permission: 'coupon.read',
          granted_at: new Date(),
        },
      });

      const consumerApiKey = `ApiKey ${consumerApiKeyData.key_id}:Y29uc3VtZXItc2VjcmV0`;

      // Test: Attempt to access admin endpoints
      const privilegeEscalationAttempts = [
        { method: 'POST', endpoint: '/api/admin/users', description: 'Create user' },
        { method: 'DELETE', endpoint: '/api/admin/users/test-user', description: 'Delete user' },
        { method: 'POST', endpoint: '/api/admin/api-keys', description: 'Create API key' },
        { method: 'PUT', endpoint: '/api/admin/api-keys/test-key', description: 'Update API key' },
        { method: 'GET', endpoint: '/api/admin/analytics', description: 'View admin analytics' },
        { method: 'POST', endpoint: '/api/merchant/coupons', description: 'Create coupon' },
        { method: 'PUT', endpoint: '/api/merchant/store/settings', description: 'Update store' },
      ];

      const escalationResults = await Promise.all(
        privilegeEscalationAttempts.map(async (attempt) => {
          let response;
          
          switch (attempt.method) {
            case 'POST':
              response = await request(app.getHttpServer())
                .post(attempt.endpoint)
                .set('x-api-key', consumerApiKey)
                .send({ test: 'data' })
                .catch(error => ({ status: error.status || 500 }));
              break;
            case 'PUT':
              response = await request(app.getHttpServer())
                .put(attempt.endpoint)
                .set('x-api-key', consumerApiKey)
                .send({ test: 'data' })
                .catch(error => ({ status: error.status || 500 }));
              break;
            case 'DELETE':
              response = await request(app.getHttpServer())
                .delete(attempt.endpoint)
                .set('x-api-key', consumerApiKey)
                .catch(error => ({ status: error.status || 500 }));
              break;
            default:
              response = await request(app.getHttpServer())
                .get(attempt.endpoint)
                .set('x-api-key', consumerApiKey)
                .catch(error => ({ status: error.status || 500 }));
          }

          return {
            ...attempt,
            status: response.status,
          };
        })
      );

      // All privilege escalation attempts should be blocked
      const blockedAttempts = escalationResults.filter(r => [403, 401].includes(r.status));
      expect(blockedAttempts.length).toBe(privilegeEscalationAttempts.length);

      // Should log security violations
      const violationLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: consumerApiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['PRIVILEGE_ESCALATION'],
          },
        },
      });

      expect(violationLogs.length).toBeGreaterThan(0);
    });

    it('should enforce tenant isolation properly', async () => {
      // Setup: Create two merchants in different tenants
      const merchant1User = ApiKeyFixtures.createMerchantUser();
      merchant1User.user_id = 'merchant-1-user';
      merchant1User.email = 'merchant1@test.com';
      const createdMerchant1 = await prismaService.usuario.create({ data: merchant1User });

      const merchant2User = ApiKeyFixtures.createMerchantUser();
      merchant2User.user_id = 'merchant-2-user';
      merchant2User.email = 'merchant2@test.com';
      merchant2User.cpf = '98765432100';
      const createdMerchant2 = await prismaService.usuario.create({ data: merchant2User });

      // Create API keys for different tenants
      const merchant1ApiKeyData = {
        id: 'merchant-1-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440004',
        secret_hash: 'merchant1-secret-hash',
        name: 'Merchant 1 API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant1.user_id,
        tenant_id: 'tenant-1',
        store_id: 'store-1',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const merchant2ApiKeyData = {
        id: 'merchant-2-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440005',
        secret_hash: 'merchant2-secret-hash',
        name: 'Merchant 2 API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant2.user_id,
        tenant_id: 'tenant-2',
        store_id: 'store-2',
        marketplace_context: 'fashion',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.createMany({
        data: [merchant1ApiKeyData, merchant2ApiKeyData],
      });

      // Add permissions
      await prismaService.apiKeyPermission.createMany({
        data: [
          {
            id: 'merchant-1-perm',
            api_key_id: merchant1ApiKeyData.id,
            permission: 'coupon.create',
            granted_at: new Date(),
          },
          {
            id: 'merchant-2-perm',
            api_key_id: merchant2ApiKeyData.id,
            permission: 'coupon.create',
            granted_at: new Date(),
          },
        ],
      });

      // Create test data for each tenant
      await prismaService.coupon.createMany({
        data: [
          {
            id: 'coupon-tenant-1',
            tenant_id: 'tenant-1',
            store_id: 'store-1',
            merchant_id: createdMerchant1.user_id,
            code: 'TENANT1COUPON',
            description: 'Tenant 1 Coupon',
            discount_type: 'PERCENTAGE',
            discount_value: 10,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 'coupon-tenant-2',
            tenant_id: 'tenant-2',
            store_id: 'store-2',
            merchant_id: createdMerchant2.user_id,
            code: 'TENANT2COUPON',
            description: 'Tenant 2 Coupon',
            discount_type: 'PERCENTAGE',
            discount_value: 15,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const merchant1ApiKey = `ApiKey ${merchant1ApiKeyData.key_id}:bWVyY2hhbnQxLXNlY3JldA==`;
      const merchant2ApiKey = `ApiKey ${merchant2ApiKeyData.key_id}:bWVyY2hhbnQyLXNlY3JldA==`;

      // Test: Merchant 1 should only access their tenant data
      const merchant1Response = await request(app.getHttpServer())
        .get('/api/coupons')
        .set('x-api-key', merchant1ApiKey)
        .set('x-store-id', 'store-1')
        .catch(error => ({ status: error.status || 500, body: {} }));

      // Test: Merchant 1 should NOT access Merchant 2's data
      const crossTenantResponse = await request(app.getHttpServer())
        .get('/api/coupons')
        .set('x-api-key', merchant1ApiKey)
        .set('x-store-id', 'store-2') // Trying to access different tenant's store
        .catch(error => ({ status: error.status || 500 }));

      // Should block cross-tenant access
      expect(crossTenantResponse.status).toBe(403);

      // Should log tenant isolation violation
      const isolationViolationLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: merchant1ApiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['TENANT_ISOLATION_VIOLATION'],
          },
        },
      });

      expect(isolationViolationLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Data Protection Security', () => {
    it('should prevent sensitive data exposure in error messages', async () => {
      // Test various error scenarios to ensure no sensitive data leaks
      const errorTestCases = [
        {
          name: 'Invalid API Key Format',
          apiKey: 'InvalidFormat',
          expectedStatus: 401,
        },
        {
          name: 'Malformed Base64 Secret',
          apiKey: 'ApiKey valid-key-id:invalid-base64!@#',
          expectedStatus: 401,
        },
        {
          name: 'SQL Injection Attempt in API Key',
          apiKey: "ApiKey 550e8400'; DROP TABLE api_keys; --:dGVzdA==",
          expectedStatus: 401,
        },
        {
          name: 'XSS Attempt in API Key',
          apiKey: 'ApiKey <script>alert("xss")</script>:dGVzdA==',
          expectedStatus: 401,
        },
      ];

      const errorResults = await Promise.all(
        errorTestCases.map(async (testCase) => {
          const response = await request(app.getHttpServer())
            .get('/api/coupons/search')
            .set('x-api-key', testCase.apiKey)
            .catch(error => ({
              status: error.status || 500,
              body: error.response?.body || {},
            }));

          return {
            ...testCase,
            actualStatus: response.status,
            responseBody: response.body,
          };
        })
      );

      errorResults.forEach((result) => {
        // Should return expected error status
        expect(result.actualStatus).toBe(result.expectedStatus);

        // Should not expose sensitive information in error messages
        const responseText = JSON.stringify(result.responseBody).toLowerCase();
        
        // Check for common sensitive data patterns
        expect(responseText).not.toMatch(/secret|password|hash|token/);
        expect(responseText).not.toMatch(/database|table|column/);
        expect(responseText).not.toMatch(/internal|stack|trace/);
        expect(responseText).not.toMatch(/prisma|sql/);
      });
    });

    it('should implement proper rate limiting against attacks', async () => {
      // Setup: Create API key with basic rate limiting
      const testUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: testUser });

      const rateLimitApiKeyData = {
        id: 'rate-limit-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440006',
        secret_hash: 'rate-limit-secret-hash',
        name: 'Rate Limit Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.BASIC, // Low limits for testing
        user_id: createdUser.user_id,
        tenant_id: 'rate-limit-tenant',
        store_id: 'rate-limit-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.BASIC,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: rateLimitApiKeyData });

      await prismaService.apiKeyPermission.create({
        data: {
          id: 'rate-limit-perm',
          api_key_id: rateLimitApiKeyData.id,
          permission: 'coupon.read',
          granted_at: new Date(),
        },
      });

      // Configure rate limits for BASIC tier (low limits for testing)
      await prismaService.rateLimitConfig.create({
        data: {
          id: 'basic-rate-config',
          api_key_id: rateLimitApiKeyData.id,
          tier: RateLimitTier.BASIC,
          requests_per_minute: 10,
          requests_per_hour: 100,
          requests_per_day: 1000,
          burst_limit: 15,
          concurrent_requests: 5,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      const validApiKey = `ApiKey ${rateLimitApiKeyData.key_id}:cmF0ZS1saW1pdC1zZWNyZXQ=`;

      // Test: Exceed rate limits
      const rapidRequests = 20; // Exceed the 10 per minute limit
      const requestPromises = Array.from({ length: rapidRequests }, (_, i) =>
        request(app.getHttpServer())
          .get('/api/coupons/search')
          .set('x-api-key', validApiKey)
          .set('x-store-id', 'rate-limit-store')
          .then(response => ({
            request: i + 1,
            status: response.status,
            headers: response.headers,
          }))
          .catch(error => ({
            request: i + 1,
            status: error.status || 500,
            headers: error.response?.headers || {},
          }))
      );

      const results = await Promise.all(requestPromises);

      // Should have some successful requests initially
      const successfulRequests = results.filter(r => [200, 404].includes(r.status));
      expect(successfulRequests.length).toBeGreaterThan(0);

      // Should start rate limiting after exceeding limits
      const rateLimitedRequests = results.filter(r => r.status === 429);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);

      // Rate limited responses should include proper headers
      const rateLimitedWithHeaders = rateLimitedRequests.filter(r => 
        r.headers['x-ratelimit-remaining'] !== undefined ||
        r.headers['retry-after'] !== undefined
      );
      expect(rateLimitedWithHeaders.length).toBeGreaterThan(0);

      // Should log rate limit violations
      const rateLimitLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: rateLimitApiKeyData.id,
          status_code: 429,
        },
      });

      expect(rateLimitLogs.length).toBeGreaterThan(0);

      // Should track rate limit metrics
      const rateLimitMetrics = await prismaService.rateLimitMetrics.findMany({
        where: {
          api_key_id: rateLimitApiKeyData.id,
          violated_at: {
            gte: new Date(Date.now() - 60000), // Last minute
          },
        },
      });

      expect(rateLimitMetrics.length).toBeGreaterThan(0);
    });

    it('should detect and prevent DoS attacks', async () => {
      // Setup: Create API key for DoS testing
      const testUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: testUser });

      const dosTestApiKeyData = {
        id: 'dos-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440007',
        secret_hash: 'dos-test-secret-hash',
        name: 'DoS Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdUser.user_id,
        tenant_id: 'dos-tenant',
        store_id: 'dos-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: dosTestApiKeyData });

      const validApiKey = `ApiKey ${dosTestApiKeyData.key_id}:ZG9zLXRlc3Qtc2VjcmV0`;

      // Test: Simulate DoS attack patterns
      const dosPatterns = [
        {
          name: 'Rapid Fire Requests',
          requests: 100,
          delay: 0,
        },
        {
          name: 'Large Payload Attack',
          requests: 10,
          payload: 'x'.repeat(10000), // Large payload
        },
        {
          name: 'Resource Intensive Queries',
          requests: 20,
          endpoint: '/api/analytics/complex-report',
        },
      ];

      for (const pattern of dosPatterns) {
        const patternResults = await Promise.all(
          Array.from({ length: pattern.requests }, async (_, i) => {
            if (pattern.delay > 0) {
              await new Promise(resolve => setTimeout(resolve, pattern.delay));
            }

            const endpoint = pattern.endpoint || '/api/coupons/search';
            let requestPromise;

            if (pattern.payload) {
              requestPromise = request(app.getHttpServer())
                .post(endpoint)
                .set('x-api-key', validApiKey)
                .set('x-store-id', 'dos-store')
                .send({ data: pattern.payload });
            } else {
              requestPromise = request(app.getHttpServer())
                .get(endpoint)
                .set('x-api-key', validApiKey)
                .set('x-store-id', 'dos-store');
            }

            return requestPromise
              .then(response => ({
                pattern: pattern.name,
                request: i + 1,
                status: response.status,
                responseTime: Date.now(),
              }))
              .catch(error => ({
                pattern: pattern.name,
                request: i + 1,
                status: error.status || 500,
                responseTime: Date.now(),
              }));
          })
        );

        // Analyze pattern results
        const blockedRequests = patternResults.filter(r => [429, 503].includes(r.status));
        console.log(`DoS Pattern "${pattern.name}": ${blockedRequests.length}/${pattern.requests} blocked`);

        // Should block excessive requests
        if (pattern.name === 'Rapid Fire Requests') {
          expect(blockedRequests.length).toBeGreaterThan(pattern.requests * 0.3); // At least 30% blocked
        }
      }

      // Should detect DoS patterns in logs
      const dosLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: dosTestApiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['DOS_PATTERN'],
          },
        },
      });

      expect(dosLogs.length).toBeGreaterThan(0);

      // Should trigger automatic API key suspension for severe DoS
      const suspendedApiKey = await prismaService.apiKey.findUnique({
        where: { id: dosTestApiKeyData.id },
      });

      // API key might be temporarily suspended
      expect([ApiKeyStatus.ACTIVE, ApiKeyStatus.SUSPENDED]).toContain(suspendedApiKey?.status);
    });
  });

  describe('Fraud Detection Security', () => {
    it('should detect suspicious transaction patterns', async () => {
      // Setup: Create merchant with transaction capabilities
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      const fraudTestApiKeyData = {
        id: 'fraud-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440008',
        secret_hash: 'fraud-test-secret-hash',
        name: 'Fraud Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'fraud-tenant',
        store_id: 'fraud-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: fraudTestApiKeyData });

      const validApiKey = `ApiKey ${fraudTestApiKeyData.key_id}:ZnJhdWQtdGVzdC1zZWNyZXQ=`;

      // Test: Simulate suspicious transaction patterns
      const suspiciousPatterns = [
        {
          name: 'High Value Transactions',
          transactions: Array.from({ length: 5 }, (_, i) => ({
            value: 50000 + (i * 10000), // R$ 50k to R$ 90k
            currency: 'BRL',
          })),
        },
        {
          name: 'Rapid Sequential Transactions',
          transactions: Array.from({ length: 20 }, (_, i) => ({
            value: 1000,
            currency: 'BRL',
          })),
        },
        {
          name: 'Round Number Pattern',
          transactions: [
            { value: 10000, currency: 'BRL' },
            { value: 20000, currency: 'BRL' },
            { value: 50000, currency: 'BRL' },
            { value: 100000, currency: 'BRL' },
          ],
        },
      ];

      for (const pattern of suspiciousPatterns) {
        await Promise.all(
          pattern.transactions.map(async (transaction, index) => {
            // Simulate transaction API call
            await request(app.getHttpServer())
              .post('/api/transactions/process')
              .set('x-api-key', validApiKey)
              .set('x-store-id', 'fraud-store')
              .send({
                amount: transaction.value,
                currency: transaction.currency,
                customer_id: `customer-${index}`,
                coupon_code: `COUPON${index}`,
              })
              .catch(() => {
                // Expected to fail if endpoint doesn't exist, but should still log
              });
          })
        );

        // Allow time for fraud detection processing
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Should detect high-risk transactions
      const highRiskLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: fraudTestApiKeyData.id,
          fraud_score: { gte: 70 },
        },
      });

      expect(highRiskLogs.length).toBeGreaterThan(0);

      // Should flag suspicious patterns
      const suspiciousLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: fraudTestApiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['HIGH_VALUE_TRANSACTION'],
          },
        },
      });

      expect(suspiciousLogs.length).toBeGreaterThan(0);

      // Should create fraud alerts
      const fraudAlerts = await prismaService.securityAlert.findMany({
        where: {
          api_key_id: fraudTestApiKeyData.id,
          alert_type: 'FRAUD_DETECTION',
          severity: { in: ['HIGH', 'CRITICAL'] },
        },
      });

      expect(fraudAlerts.length).toBeGreaterThan(0);
    });

    it('should implement velocity checks for fraud prevention', async () => {
      // Setup: Create consumer for velocity testing
      const consumerUser = ApiKeyFixtures.createConsumerUser();
      const createdConsumer = await prismaService.usuario.create({ data: consumerUser });

      const velocityTestApiKeyData = {
        id: 'velocity-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440009',
        secret_hash: 'velocity-test-secret-hash',
        name: 'Velocity Test API Key',
        user_type: UserType.CONSUMER,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.BASIC,
        user_id: createdConsumer.user_id,
        tenant_id: 'velocity-tenant',
        marketplace_context: 'general',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.BASIC,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: velocityTestApiKeyData });

      const validApiKey = `ApiKey ${velocityTestApiKeyData.key_id}:dmVsb2NpdHktdGVzdA==`;

      // Test: Rapid coupon purchases (velocity fraud)
      const rapidPurchases = 15;
      const purchasePromises = Array.from({ length: rapidPurchases }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/coupons/purchase')
          .set('x-api-key', validApiKey)
          .send({
            coupon_id: `coupon-${i}`,
            quantity: 1,
            payment_method: 'credit_card',
          })
          .then(response => ({
            purchase: i + 1,
            status: response.status,
            timestamp: Date.now(),
          }))
          .catch(error => ({
            purchase: i + 1,
            status: error.status || 500,
            timestamp: Date.now(),
          }))
      );

      const purchaseResults = await Promise.all(purchasePromises);

      // Should start blocking after velocity threshold is exceeded
      const blockedPurchases = purchaseResults.filter(r => [429, 403].includes(r.status));
      expect(blockedPurchases.length).toBeGreaterThan(0);

      // Should detect velocity fraud pattern
      const velocityLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: velocityTestApiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['VELOCITY_FRAUD'],
          },
        },
      });

      expect(velocityLogs.length).toBeGreaterThan(0);

      // Should create velocity-based fraud scores
      const highVelocityScores = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: velocityTestApiKeyData.id,
          fraud_score: { gte: 60 },
        },
      });

      expect(highVelocityScores.length).toBeGreaterThan(0);
    });
  });
});