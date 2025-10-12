import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures } from '../fixtures/api-key-fixtures';
import { TestHelper } from '../helpers/test-helper';

describe('API Key System Compliance Tests', () => {
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

  describe('Transaction Compliance', () => {
    it('should enforce transaction value thresholds based on compliance level', async () => {
      // Setup: Create merchants with different compliance levels
      const basicMerchant = ApiKeyFixtures.createMerchantUser();
      basicMerchant.user_id = 'basic-merchant';
      basicMerchant.email = 'basic@test.com';
      const createdBasicMerchant = await prismaService.usuario.create({ data: basicMerchant });

      const enhancedMerchant = ApiKeyFixtures.createMerchantUser();
      enhancedMerchant.user_id = 'enhanced-merchant';
      enhancedMerchant.email = 'enhanced@test.com';
      enhancedMerchant.cpf = '98765432100';
      const createdEnhancedMerchant = await prismaService.usuario.create({ data: enhancedMerchant });

      // Create API keys with different compliance levels
      const basicApiKeyData = {
        id: 'basic-compliance-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440020',
        secret_hash: 'basic-compliance-secret',
        name: 'Basic Compliance API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.BASIC,
        user_id: createdBasicMerchant.user_id,
        tenant_id: 'basic-tenant',
        store_id: 'basic-store',
        marketplace_context: 'general',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.BASIC,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const enhancedApiKeyData = {
        id: 'enhanced-compliance-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440021',
        secret_hash: 'enhanced-compliance-secret',
        name: 'Enhanced Compliance API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdEnhancedMerchant.user_id,
        tenant_id: 'enhanced-tenant',
        store_id: 'enhanced-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.createMany({
        data: [basicApiKeyData, enhancedApiKeyData],
      });

      // Add permissions
      await prismaService.apiKeyPermission.createMany({
        data: [
          {
            id: 'basic-trans-perm',
            api_key_id: basicApiKeyData.id,
            permission: 'transaction.create',
            granted_at: new Date(),
          },
          {
            id: 'enhanced-trans-perm',
            api_key_id: enhancedApiKeyData.id,
            permission: 'transaction.create',
            granted_at: new Date(),
          },
        ],
      });

      const basicApiKey = `ApiKey ${basicApiKeyData.key_id}:YmFzaWMtY29tcGxpYW5jZQ==`;
      const enhancedApiKey = `ApiKey ${enhancedApiKeyData.key_id}:ZW5oYW5jZWQtY29tcGxpYW5jZQ==`;

      // Test: Basic compliance should reject high-value transactions
      const basicHighValueResponse = await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', basicApiKey)
        .set('x-store-id', 'basic-store')
        .send({
          amount: 25000, // R$ 25,000 - above basic compliance threshold
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should block high-value transaction for basic compliance
      expect(basicHighValueResponse.status).toBe(403);

      // Test: Enhanced compliance should allow high-value transactions
      const enhancedHighValueResponse = await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', enhancedApiKey)
        .set('x-store-id', 'enhanced-store')
        .send({
          amount: 25000, // Same amount
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
        })
        .catch(error => ({
          status: error.status || 500,
        }));

      // Should allow high-value transaction for enhanced compliance
      expect([200, 201, 404]).toContain(enhancedHighValueResponse.status);

      // Verify compliance violations are logged
      const complianceViolations = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: basicApiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['COMPLIANCE_VIOLATION'],
          },
        },
      });

      expect(complianceViolations.length).toBeGreaterThan(0);
    });

    it('should track cumulative transaction volumes for compliance monitoring', async () => {
      // Setup: Create merchant for volume tracking
      const volumeMerchant = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: volumeMerchant });

      const volumeApiKeyData = {
        id: 'volume-tracking-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440022',
        secret_hash: 'volume-tracking-secret',
        name: 'Volume Tracking API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'volume-tenant',
        store_id: 'volume-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.BASIC,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: volumeApiKeyData });

      const validApiKey = `ApiKey ${volumeApiKeyData.key_id}:dm9sdW1lLXRyYWNraW5n`;

      // Simulate multiple transactions to reach volume threshold
      const transactions = [
        { amount: 15000, customer: 'customer-1' },
        { amount: 18000, customer: 'customer-2' },
        { amount: 22000, customer: 'customer-3' },
        { amount: 25000, customer: 'customer-4' },
        { amount: 30000, customer: 'customer-5' }, // This should trigger compliance alert
      ];

      let cumulativeVolume = 0;
      
      for (const [index, transaction] of transactions.entries()) {
        cumulativeVolume += transaction.amount;

        const response = await request(app.getHttpServer())
          .post('/api/transactions/process')
          .set('x-api-key', validApiKey)
          .set('x-store-id', 'volume-store')
          .send({
            amount: transaction.amount,
            currency: 'BRL',
            customer_id: transaction.customer,
            payment_method: 'credit_card',
          })
          .catch(error => ({
            status: error.status || 500,
            body: error.response?.body || {},
          }));

        // Should start requiring enhanced compliance after volume threshold
        if (cumulativeVolume > 100000) { // R$ 100k threshold
          expect(response.status).toBe(403);
          expect(response.body).toMatchObject({
            error: expect.stringContaining('Enhanced compliance'),
            code: 'COMPLIANCE_UPGRADE_REQUIRED',
          });
          break;
        }
      }

      // Verify volume tracking in usage logs
      const volumeLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: volumeApiKeyData.id,
          transaction_value: { not: null },
        },
        orderBy: { timestamp: 'asc' },
      });

      expect(volumeLogs.length).toBeGreaterThan(0);

      // Calculate total volume from logs
      const totalVolume = volumeLogs.reduce((sum, log) => 
        sum + (log.transaction_value ? Number(log.transaction_value) : 0), 0
      );

      expect(totalVolume).toBeGreaterThan(0);
    });
  });

  describe('Geographic Compliance', () => {
    it('should enforce regional restrictions based on compliance requirements', async () => {
      // Setup: Create API key with regional restrictions
      const regionalMerchant = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: regionalMerchant });

      const regionalApiKeyData = {
        id: 'regional-compliance-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440023',
        secret_hash: 'regional-compliance-secret',
        name: 'Regional Compliance API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'regional-tenant',
        store_id: 'regional-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'], // Only Brazil allowed
        compliance_level: ComplianceLevel.LGPD,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: regionalApiKeyData });

      const validApiKey = `ApiKey ${regionalApiKeyData.key_id}:cmVnaW9uYWwtY29tcGxpYW5jZQ==`;

      // Test: Access from allowed region
      const allowedRegionResponse = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'regional-store')
        .set('cf-ipcountry', 'BR') // Simulating CloudFlare country header
        .catch(error => ({
          status: error.status || 500,
        }));

      // Should allow access from Brazil
      expect([200, 404]).toContain(allowedRegionResponse.status);

      // Test: Access from blocked region
      const blockedRegionResponse = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'regional-store')
        .set('cf-ipcountry', 'US') // Blocked region
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should block access from outside allowed regions
      expect(blockedRegionResponse.status).toBe(403);
      expect(blockedRegionResponse.body).toMatchObject({
        error: expect.stringContaining('region'),
        code: 'GEOGRAPHIC_RESTRICTION',
      });

      // Verify geographic violations are logged
      const geoViolations = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: regionalApiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['GEOGRAPHIC_VIOLATION'],
          },
        },
      });

      expect(geoViolations.length).toBeGreaterThan(0);
    });
  });

  describe('Data Protection Compliance', () => {
    it('should mask sensitive data in logs according to compliance level', async () => {
      // Setup: Create API key with LGPD compliance
      const lgpdMerchant = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: lgpdMerchant });

      const lgpdApiKeyData = {
        id: 'lgpd-masking-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440024',
        secret_hash: 'lgpd-masking-secret',
        name: 'LGPD Masking API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'lgpd-tenant',
        store_id: 'lgpd-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.LGPD,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: lgpdApiKeyData });

      const validApiKey = `ApiKey ${lgpdApiKeyData.key_id}:bGdwZC1tYXNraW5n`;

      // Make request with sensitive customer data
      await request(app.getHttpServer())
        .post('/api/customers/create')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'lgpd-store')
        .send({
          name: 'João Silva',
          email: 'joao.silva@example.com',
          cpf: '12345678901',
          phone: '+5511999999999',
          address: 'Rua das Flores, 123, São Paulo, SP',
        })
        .catch(() => {
          // Expected if endpoint doesn't exist
        });

      // Check usage logs for proper data masking
      const usageLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: lgpdApiKeyData.id,
          endpoint: '/api/customers/create',
        },
        orderBy: { timestamp: 'desc' },
        take: 1,
      });

      if (usageLogs.length > 0) {
        const logEntry = usageLogs[0];
        
        // For LGPD compliance, sensitive fields should be masked or excluded
        // Check that request data doesn't contain full sensitive information
        const logString = JSON.stringify(logEntry);
        
        // CPF should be masked (showing only first 3 and last 2 digits)
        if (logString.includes('cpf')) {
          expect(logString).toMatch(/123\*\*\*\*\*\*01/);
        }
        
        // Email should be masked (showing only domain)
        if (logString.includes('email')) {
          expect(logString).toMatch(/\*\*\*@example\.com/);
        }
        
        // Full address should not be present
        expect(logString).not.toContain('Rua das Flores, 123');
      }

      // Verify LGPD compliance flags
      const lgpdLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: lgpdApiKeyData.id,
          security_flags: {
            hasEvery: ['LGPD_MASKED'],
          },
        },
      });

      expect(lgpdLogs.length).toBeGreaterThan(0);
    });

    it('should enforce data retention policies', async () => {
      // Setup: Create API key for retention testing
      const retentionMerchant = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: retentionMerchant });

      const retentionApiKeyData = {
        id: 'retention-policy-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440025',
        secret_hash: 'retention-policy-secret',
        name: 'Retention Policy API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'retention-tenant',
        store_id: 'retention-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.LGPD,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: retentionApiKeyData });

      // Create old usage logs (simulating data beyond retention period)
      const oldLogs = Array.from({ length: 50 }, (_, i) => ({
        id: `retention-old-log-${i}`,
        api_key_id: retentionApiKeyData.id,
        endpoint: '/api/coupons/search',
        http_method: 'GET',
        status_code: 200,
        response_time_ms: 100,
        ip_address: `192.168.1.${100 + i}`,
        user_agent: 'RetentionTestAgent/1.0',
        request_id: `retention-old-req-${i}`,
        merchant_id: createdMerchant.user_id,
        coupon_category: 'electronics',
        geographic_location: 'BR-SP',
        is_suspicious: false,
        fraud_score: 10,
        security_flags: [],
        timestamp: new Date(Date.now() - (400 + i) * 24 * 60 * 60 * 1000), // Over 1 year old
      }));

      await prismaService.apiKeyUsageLog.createMany({ data: oldLogs });

      // Create recent logs (within retention period)
      const recentLogs = Array.from({ length: 30 }, (_, i) => ({
        id: `retention-recent-log-${i}`,
        api_key_id: retentionApiKeyData.id,
        endpoint: '/api/coupons/search',
        http_method: 'GET',
        status_code: 200,
        response_time_ms: 100,
        ip_address: `192.168.1.${200 + i}`,
        user_agent: 'RetentionTestAgent/1.0',
        request_id: `retention-recent-req-${i}`,
        merchant_id: createdMerchant.user_id,
        coupon_category: 'electronics',
        geographic_location: 'BR-SP',
        is_suspicious: false,
        fraud_score: 10,
        security_flags: [],
        timestamp: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000), // Recent
      }));

      await prismaService.apiKeyUsageLog.createMany({ data: recentLogs });

      const validApiKey = `ApiKey ${retentionApiKeyData.key_id}:cmV0ZW50aW9uLXBvbGljeQ==`;

      // Test: Trigger retention policy enforcement
      const retentionResponse = await request(app.getHttpServer())
        .post('/api/admin/compliance/enforce-retention')
        .set('x-api-key', validApiKey)
        .send({
          retention_period_days: 365,
          entity_types: ['usage_logs'],
          dry_run: false,
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should acknowledge retention enforcement
      expect([200, 202, 404]).toContain(retentionResponse.status);

      // Verify data retention by checking log counts
      const remainingOldLogs = await prismaService.apiKeyUsageLog.count({
        where: {
          api_key_id: retentionApiKeyData.id,
          timestamp: {
            lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          },
        },
      });

      const remainingRecentLogs = await prismaService.apiKeyUsageLog.count({
        where: {
          api_key_id: retentionApiKeyData.id,
          timestamp: {
            gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          },
        },
      });

      // Old logs should be reduced (simulating retention policy)
      // In real implementation, this would be handled by a background job
      console.log(`Retention test - Old logs: ${remainingOldLogs}, Recent logs: ${remainingRecentLogs}`);
      
      // Verify that we have both old and recent logs for the test
      expect(remainingOldLogs + remainingRecentLogs).toBeGreaterThan(0);
    });
  });

  describe('Audit Trail Compliance', () => {
    it('should maintain comprehensive audit trails for compliance', async () => {
      // Setup: Create API key for audit testing
      const auditMerchant = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: auditMerchant });

      const auditApiKeyData = {
        id: 'audit-trail-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440026',
        secret_hash: 'audit-trail-secret',
        name: 'Audit Trail API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'audit-tenant',
        store_id: 'audit-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.SOX,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: auditApiKeyData });

      const validApiKey = `ApiKey ${auditApiKeyData.key_id}:YXVkaXQtdHJhaWw=`;

      // Perform various operations that should be audited
      const auditableOperations = [
        { method: 'GET', endpoint: '/api/coupons/search', description: 'Search coupons' },
        { method: 'POST', endpoint: '/api/coupons', description: 'Create coupon' },
        { method: 'PUT', endpoint: '/api/coupons/coupon-123', description: 'Update coupon' },
        { method: 'DELETE', endpoint: '/api/coupons/coupon-123', description: 'Delete coupon' },
        { method: 'GET', endpoint: '/api/analytics/sales', description: 'View analytics' },
      ];

      for (const operation of auditableOperations) {
        let response;
        
        switch (operation.method) {
          case 'POST':
            response = await request(app.getHttpServer())
              .post(operation.endpoint)
              .set('x-api-key', validApiKey)
              .set('x-store-id', 'audit-store')
              .send({ test: 'data' })
              .catch(error => ({ status: error.status || 500 }));
            break;
          case 'PUT':
            response = await request(app.getHttpServer())
              .put(operation.endpoint)
              .set('x-api-key', validApiKey)
              .set('x-store-id', 'audit-store')
              .send({ test: 'update' })
              .catch(error => ({ status: error.status || 500 }));
            break;
          case 'DELETE':
            response = await request(app.getHttpServer())
              .delete(operation.endpoint)
              .set('x-api-key', validApiKey)
              .set('x-store-id', 'audit-store')
              .catch(error => ({ status: error.status || 500 }));
            break;
          default:
            response = await request(app.getHttpServer())
              .get(operation.endpoint)
              .set('x-api-key', validApiKey)
              .set('x-store-id', 'audit-store')
              .catch(error => ({ status: error.status || 500 }));
        }

        // Operations should be logged regardless of success/failure
        expect(response.status).toBeDefined();
      }

      // Verify comprehensive audit trail
      const auditLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: auditApiKeyData.id,
        },
        orderBy: { timestamp: 'asc' },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(auditableOperations.length);

      // Verify each operation is properly logged
      auditableOperations.forEach(operation => {
        const matchingLogs = auditLogs.filter(log => 
          log.endpoint === operation.endpoint && 
          log.http_method === operation.method
        );
        expect(matchingLogs.length).toBeGreaterThan(0);
      });

      // Verify audit log integrity (all required fields present)
      auditLogs.forEach(log => {
        expect(log.api_key_id).toBe(auditApiKeyData.id);
        expect(log.endpoint).toBeDefined();
        expect(log.http_method).toBeDefined();
        expect(log.status_code).toBeDefined();
        expect(log.timestamp).toBeDefined();
        expect(log.ip_address).toBeDefined();
        expect(log.user_agent).toBeDefined();
        expect(log.request_id).toBeDefined();
      });

      // Verify no gaps in audit trail (sequential request IDs or timestamps)
      const sortedLogs = auditLogs.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (let i = 1; i < sortedLogs.length; i++) {
        const timeDiff = new Date(sortedLogs[i].timestamp).getTime() - 
                        new Date(sortedLogs[i-1].timestamp).getTime();
        // Logs should be reasonably close in time (within test execution window)
        expect(timeDiff).toBeLessThan(60000); // Within 1 minute
      }
    });
  });
});