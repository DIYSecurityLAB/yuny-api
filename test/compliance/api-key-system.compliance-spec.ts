import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus } from '../../src/api-key/domain/enums';

// Define compliance-specific enums for testing
enum KycStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

enum AmlStatus {
  CLEAR = 'CLEAR',
  MONITORING = 'MONITORING',
  FLAGGED = 'FLAGGED',
  BLOCKED = 'BLOCKED',
}
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

  describe('KYC (Know Your Customer) Compliance', () => {
    it('should enforce KYC requirements for high-value transactions', async () => {
      // Setup: Create merchant without completed KYC
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      // Simulate KYC status in compliance metadata (using existing schema)
      const kycMetadata = {
        kyc_status: KycStatus.PENDING,
        document_type: 'CPF',
        document_number: merchantUser.cpf,
        verification_level: 'BASIC',
        submitted_at: new Date(),
      };

      const apiKeyData = {
        id: 'kyc-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440010',
        secret_hash: 'kyc-test-secret-hash',
        name: 'KYC Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'kyc-tenant',
        store_id: 'kyc-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      await prismaService.apiKeyPermission.create({
        data: {
          id: 'kyc-perm-1',
          api_key_id: apiKeyData.id,
          permission: 'transaction.create',
          granted_at: new Date(),
        },
      });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:a3ljLXRlc3Qtc2VjcmV0`;

      // Test: Attempt high-value transaction without completed KYC
      const highValueTransactionResponse = await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'kyc-store')
        .send({
          amount: 50000, // R$ 50,000 - above KYC threshold
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should block high-value transaction due to incomplete KYC
      expect(highValueTransactionResponse.status).toBe(403);
      expect(highValueTransactionResponse.body).toMatchObject({
        error: expect.stringContaining('KYC'),
        code: 'KYC_REQUIRED',
      });

      // Test: Low-value transaction should be allowed
      const lowValueTransactionResponse = await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'kyc-store')
        .send({
          amount: 500, // R$ 500 - below KYC threshold
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should allow low-value transaction
      expect([200, 201, 404]).toContain(lowValueTransactionResponse.status); // 404 if endpoint doesn't exist

      // Should log compliance violations in usage logs
      const complianceViolationLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: apiKeyData.id,
          is_suspicious: true,
          security_flags: {
            hasEvery: ['KYC_REQUIRED'],
          },
        },
      });

      expect(complianceViolationLogs.length).toBeGreaterThan(0);

      // Test: Simulate KYC completion by updating API key metadata
      await prismaService.apiKey.update({
        where: { id: apiKeyData.id },
        data: {
          compliance_level: ComplianceLevel.PCI_DSS, // Enhanced compliance after KYC
          updated_at: new Date(),
        },
      });

      const retryHighValueResponse = await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'kyc-store')
        .send({
          amount: 50000,
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
        })
        .catch(error => ({
          status: error.status || 500,
        }));

      // Should allow high-value transaction after KYC completion
      expect([200, 201, 404]).toContain(retryHighValueResponse.status);
    });

    it('should enforce progressive KYC levels based on transaction volume', async () => {
      // Setup: Create merchant with basic KYC
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      await prismaService.kycRecord.create({
        data: {
          id: 'kyc-basic-record',
          user_id: createdMerchant.user_id,
          status: KycStatus.APPROVED,
          document_type: 'CPF',
          document_number: merchantUser.cpf,
          verification_level: 'BASIC',
          submitted_at: new Date(),
          approved_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      const apiKeyData = {
        id: 'progressive-kyc-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440011',
        secret_hash: 'progressive-kyc-secret',
        name: 'Progressive KYC API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'progressive-tenant',
        store_id: 'progressive-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:cHJvZ3Jlc3Npdmuta3lj`;

      // Simulate transaction history to reach volume thresholds
      const transactions = [
        { amount: 10000, description: 'Transaction 1' },
        { amount: 15000, description: 'Transaction 2' },
        { amount: 20000, description: 'Transaction 3' },
        { amount: 25000, description: 'Transaction 4' },
        { amount: 30000, description: 'Transaction 5' },
      ];

      let cumulativeVolume = 0;
      
      for (const [index, transaction] of transactions.entries()) {
        cumulativeVolume += transaction.amount;

        const response = await request(app.getHttpServer())
          .post('/api/transactions/process')
          .set('x-api-key', validApiKey)
          .set('x-store-id', 'progressive-store')
          .send({
            amount: transaction.amount,
            currency: 'BRL',
            customer_id: `customer-${index}`,
            payment_method: 'credit_card',
          })
          .catch(error => ({
            status: error.status || 500,
            body: error.response?.body || {},
          }));

        // Check if enhanced KYC is required based on cumulative volume
        if (cumulativeVolume > 100000) { // R$ 100k threshold
          expect(response.status).toBe(403);
          expect(response.body).toMatchObject({
            error: expect.stringContaining('Enhanced KYC'),
            code: 'ENHANCED_KYC_REQUIRED',
          });
          break;
        }
      }

      // Should create KYC upgrade requirement
      const kycUpgradeRequirements = await prismaService.complianceRequirement.findMany({
        where: {
          user_id: createdMerchant.user_id,
          requirement_type: 'ENHANCED_KYC',
          status: 'PENDING',
        },
      });

      expect(kycUpgradeRequirements.length).toBeGreaterThan(0);
    });

    it('should validate document authenticity and completeness', async () => {
      // Setup: Create merchant for document validation
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      const apiKeyData = {
        id: 'doc-validation-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440012',
        secret_hash: 'doc-validation-secret',
        name: 'Document Validation API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'doc-tenant',
        store_id: 'doc-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:ZG9jLXZhbGlkYXRpb24=`;

      // Test document submission scenarios
      const documentTestCases = [
        {
          name: 'Invalid CPF Format',
          document: {
            type: 'CPF',
            number: '123.456.789-00', // Invalid CPF
            document_front_url: 'https://example.com/cpf_front.jpg',
          },
          expectedResult: 'REJECTED',
        },
        {
          name: 'Valid CPF',
          document: {
            type: 'CPF',
            number: '12345678901', // Valid format (would need real validation in production)
            document_front_url: 'https://example.com/valid_cpf.jpg',
          },
          expectedResult: 'APPROVED',
        },
        {
          name: 'Missing Document Image',
          document: {
            type: 'RG',
            number: '123456789',
            // Missing document_front_url
          },
          expectedResult: 'INCOMPLETE',
        },
        {
          name: 'CNPJ for Business Account',
          document: {
            type: 'CNPJ',
            number: '12345678000195',
            document_front_url: 'https://example.com/cnpj.jpg',
            business_name: 'Test Business Ltda',
          },
          expectedResult: 'PENDING',
        },
      ];

      for (const testCase of documentTestCases) {
        const submitResponse = await request(app.getHttpServer())
          .post('/api/kyc/documents/submit')
          .set('x-api-key', validApiKey)
          .send(testCase.document)
          .catch(error => ({
            status: error.status || 500,
            body: error.response?.body || {},
          }));

        // Should handle different document validation scenarios
        if (testCase.expectedResult === 'REJECTED') {
          expect(submitResponse.status).toBe(400);
          expect(submitResponse.body).toMatchObject({
            error: expect.stringContaining('Invalid'),
          });
        } else if (testCase.expectedResult === 'INCOMPLETE') {
          expect(submitResponse.status).toBe(400);
          expect(submitResponse.body).toMatchObject({
            error: expect.stringContaining('required'),
          });
        } else {
          expect([200, 201, 202, 404]).toContain(submitResponse.status);
        }

        // Should create document validation record
        const validationRecord = await prismaService.documentValidation.findFirst({
          where: {
            user_id: createdMerchant.user_id,
            document_type: testCase.document.type,
          },
          orderBy: { created_at: 'desc' },
        });

        if (testCase.expectedResult !== 'REJECTED' && testCase.expectedResult !== 'INCOMPLETE') {
          expect(validationRecord).toBeDefined();
          expect(validationRecord?.validation_status).toBe(testCase.expectedResult);
        }
      }
    });
  });

  describe('AML (Anti-Money Laundering) Compliance', () => {
    it('should detect and flag suspicious transaction patterns', async () => {
      // Setup: Create merchant for AML testing
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      await prismaService.amlRecord.create({
        data: {
          id: 'aml-test-record',
          user_id: createdMerchant.user_id,
          status: AmlStatus.MONITORING,
          risk_score: 30,
          last_check_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      const apiKeyData = {
        id: 'aml-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440013',
        secret_hash: 'aml-test-secret-hash',
        name: 'AML Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'aml-tenant',
        store_id: 'aml-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:YW1sLXRlc3Qtc2VjcmV0`;

      // Test: Simulate suspicious transaction patterns
      const suspiciousPatterns = [
        {
          name: 'Structured Transactions (Smurfing)',
          transactions: Array.from({ length: 10 }, (_, i) => ({
            amount: 9500, // Just below R$ 10k reporting threshold
            customer_id: `customer-${i}`,
            timestamp: new Date(Date.now() + i * 60000), // 1 minute apart
          })),
        },
        {
          name: 'Rapid High-Value Transactions',
          transactions: [
            { amount: 50000, customer_id: 'customer-rapid-1' },
            { amount: 45000, customer_id: 'customer-rapid-2' },
            { amount: 55000, customer_id: 'customer-rapid-3' },
          ],
        },
        {
          name: 'Round Amount Pattern',
          transactions: [
            { amount: 10000, customer_id: 'customer-round-1' },
            { amount: 20000, customer_id: 'customer-round-2' },
            { amount: 50000, customer_id: 'customer-round-3' },
          ],
        },
      ];

      for (const pattern of suspiciousPatterns) {
        const patternStartTime = Date.now();

        await Promise.all(
          pattern.transactions.map(async (transaction, index) => {
            await request(app.getHttpServer())
              .post('/api/transactions/process')
              .set('x-api-key', validApiKey)
              .set('x-store-id', 'aml-store')
              .send({
                amount: transaction.amount,
                currency: 'BRL',
                customer_id: transaction.customer_id,
                payment_method: 'credit_card',
                transaction_time: transaction.timestamp || new Date(),
              })
              .catch(() => {
                // Expected if endpoint doesn't exist
              });
          })
        );

        // Allow time for AML processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Should detect suspicious patterns
        const amlAlerts = await prismaService.amlAlert.findMany({
          where: {
            user_id: createdMerchant.user_id,
            alert_type: pattern.name.includes('Structured') ? 'STRUCTURING' : 
                       pattern.name.includes('Rapid') ? 'RAPID_TRANSACTIONS' :
                       'ROUND_AMOUNTS',
            created_at: {
              gte: new Date(patternStartTime),
            },
          },
        });

        expect(amlAlerts.length).toBeGreaterThan(0);

        // Should increase risk score
        const updatedAmlRecord = await prismaService.amlRecord.findUnique({
          where: { user_id: createdMerchant.user_id },
        });

        expect(updatedAmlRecord?.risk_score).toBeGreaterThan(30); // Should increase from initial 30
      }

      // Should generate SAR (Suspicious Activity Report) for high-risk patterns
      const sarReports = await prismaService.sarReport.findMany({
        where: {
          user_id: createdMerchant.user_id,
          status: 'PENDING_REVIEW',
        },
      });

      expect(sarReports.length).toBeGreaterThan(0);
    });

    it('should enforce sanctions screening', async () => {
      // Setup: Create users for sanctions testing
      const sanctionedUser = ApiKeyFixtures.createMerchantUser();
      sanctionedUser.user_id = 'sanctioned-user-1';
      sanctionedUser.nome = 'John Sanctioned';
      sanctionedUser.email = 'sanctioned@example.com';
      sanctionedUser.cpf = '98765432101';

      const cleanUser = ApiKeyFixtures.createMerchantUser();
      cleanUser.user_id = 'clean-user-1';
      cleanUser.nome = 'Jane Clean';
      cleanUser.email = 'clean@example.com';
      cleanUser.cpf = '12345678901';

      const [createdSanctioned, createdClean] = await Promise.all([
        prismaService.usuario.create({ data: sanctionedUser }),
        prismaService.usuario.create({ data: cleanUser }),
      ]);

      // Add user to sanctions list
      await prismaService.sanctionsList.create({
        data: {
          id: 'sanction-entry-1',
          entity_type: 'INDIVIDUAL',
          name: 'John Sanctioned',
          document_number: sanctionedUser.cpf,
          country: 'BR',
          sanctions_type: 'FINANCIAL',
          authority: 'BACEN',
          date_added: new Date(),
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // Create API keys for both users
      const sanctionedApiKeyData = {
        id: 'sanctioned-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440014',
        secret_hash: 'sanctioned-secret-hash',
        name: 'Sanctioned API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdSanctioned.user_id,
        tenant_id: 'sanctioned-tenant',
        store_id: 'sanctioned-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const cleanApiKeyData = {
        id: 'clean-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440015',
        secret_hash: 'clean-secret-hash',
        name: 'Clean API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdClean.user_id,
        tenant_id: 'clean-tenant',
        store_id: 'clean-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.createMany({
        data: [sanctionedApiKeyData, cleanApiKeyData],
      });

      const sanctionedApiKey = `ApiKey ${sanctionedApiKeyData.key_id}:c2FuY3Rpb25lZC1zZWNyZXQ=`;
      const cleanApiKey = `ApiKey ${cleanApiKeyData.key_id}:Y2xlYW4tc2VjcmV0`;

      // Test: Sanctioned user should be blocked
      const sanctionedResponse = await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', sanctionedApiKey)
        .set('x-store-id', 'sanctioned-store')
        .send({
          amount: 1000,
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should block sanctioned user
      expect(sanctionedResponse.status).toBe(403);
      expect(sanctionedResponse.body).toMatchObject({
        error: expect.stringContaining('sanctions'),
        code: 'SANCTIONS_VIOLATION',
      });

      // Test: Clean user should be allowed
      const cleanResponse = await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', cleanApiKey)
        .set('x-store-id', 'clean-store')
        .send({
          amount: 1000,
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
        })
        .catch(error => ({
          status: error.status || 500,
        }));

      // Should allow clean user
      expect([200, 201, 404]).toContain(cleanResponse.status);

      // Should log sanctions violation
      const sanctionsLogs = await prismaService.complianceLog.findMany({
        where: {
          user_id: createdSanctioned.user_id,
          violation_type: 'SANCTIONS_VIOLATION',
        },
      });

      expect(sanctionsLogs.length).toBeGreaterThan(0);

      // Should automatically suspend sanctioned API key
      const suspendedApiKey = await prismaService.apiKey.findUnique({
        where: { id: sanctionedApiKeyData.id },
      });

      expect(suspendedApiKey?.status).toBe(ApiKeyStatus.SUSPENDED);
    });
  });

  describe('LGPD (Data Protection) Compliance', () => {
    it('should handle data subject rights requests', async () => {
      // Setup: Create user with personal data
      const dataSubject = ApiKeyFixtures.createConsumerUser();
      const createdUser = await prismaService.usuario.create({ data: dataSubject });

      const apiKeyData = {
        id: 'lgpd-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440016',
        secret_hash: 'lgpd-test-secret-hash',
        name: 'LGPD Test API Key',
        user_type: UserType.CONSUMER,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.BASIC,
        user_id: createdUser.user_id,
        tenant_id: 'lgpd-tenant',
        marketplace_context: 'general',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.LGPD,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      // Generate some usage data
      await prismaService.apiKeyUsageLog.createMany({
        data: [
          {
            id: 'lgpd-log-1',
            api_key_id: apiKeyData.id,
            endpoint: '/api/coupons/search',
            http_method: 'GET',
            status_code: 200,
            response_time_ms: 150,
            ip_address: '192.168.1.100',
            user_agent: 'Mozilla/5.0',
            request_id: 'lgpd-req-1',
            merchant_id: createdUser.user_id,
            coupon_category: 'general',
            geographic_location: 'BR-SP',
            is_suspicious: false,
            fraud_score: 10,
            security_flags: [],
            timestamp: new Date(),
          },
          {
            id: 'lgpd-log-2',
            api_key_id: apiKeyData.id,
            endpoint: '/api/coupons/purchase',
            http_method: 'POST',
            status_code: 201,
            response_time_ms: 200,
            ip_address: '192.168.1.100',
            user_agent: 'Mozilla/5.0',
            request_id: 'lgpd-req-2',
            transaction_value: 100,
            currency: 'BRL',
            merchant_id: createdUser.user_id,
            coupon_category: 'general',
            geographic_location: 'BR-SP',
            is_suspicious: false,
            fraud_score: 5,
            security_flags: [],
            timestamp: new Date(),
          },
        ],
      });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:bGdwZC10ZXN0LXNlY3JldA==`;

      // Test: Data Portability Request
      const dataPortabilityResponse = await request(app.getHttpServer())
        .get('/api/data-subject/export')
        .set('x-api-key', validApiKey)
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should allow data export
      expect([200, 202, 404]).toContain(dataPortabilityResponse.status);

      if (dataPortabilityResponse.status === 200) {
        expect(dataPortabilityResponse.body).toHaveProperty('user_data');
        expect(dataPortabilityResponse.body).toHaveProperty('api_keys');
        expect(dataPortabilityResponse.body).toHaveProperty('usage_logs');
      }

      // Test: Data Rectification Request
      const rectificationResponse = await request(app.getHttpServer())
        .put('/api/data-subject/rectify')
        .set('x-api-key', validApiKey)
        .send({
          field: 'nome',
          old_value: dataSubject.nome,
          new_value: 'Updated Name',
          justification: 'Correction of personal information',
        })
        .catch(error => ({
          status: error.status || 500,
        }));

      // Should allow data rectification
      expect([200, 202, 404]).toContain(rectificationResponse.status);

      // Test: Data Erasure Request (Right to be Forgotten)
      const erasureResponse = await request(app.getHttpServer())
        .delete('/api/data-subject/erase')
        .set('x-api-key', validApiKey)
        .send({
          erasure_reason: 'User requested account deletion',
          confirm_erasure: true,
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should handle erasure request
      expect([200, 202, 404]).toContain(erasureResponse.status);

      // Should log LGPD compliance activities
      const lgpdLogs = await prismaService.dataSubjectRequest.findMany({
        where: {
          user_id: createdUser.user_id,
          request_type: { in: ['PORTABILITY', 'RECTIFICATION', 'ERASURE'] },
        },
      });

      expect(lgpdLogs.length).toBeGreaterThan(0);
    });

    it('should enforce data minimization principles', async () => {
      // Setup: Create merchant for data minimization testing
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      const apiKeyData = {
        id: 'data-min-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440017',
        secret_hash: 'data-min-secret-hash',
        name: 'Data Minimization API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'data-min-tenant',
        store_id: 'data-min-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.LGPD,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: apiKeyData });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:ZGF0YS1taW4tc2VjcmV0`;

      // Test: Attempt to collect excessive customer data
      const excessiveDataResponse = await request(app.getHttpServer())
        .post('/api/customers/profile')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'data-min-store')
        .send({
          name: 'Customer Name', // Necessary
          email: 'customer@example.com', // Necessary
          phone: '+5511999999999', // Necessary
          cpf: '12345678901', // Necessary for transactions
          // Excessive data below
          mothers_name: 'Mother Name', // Not necessary for coupon platform
          fathers_name: 'Father Name', // Not necessary
          medical_conditions: ['diabetes'], // Sensitive and unnecessary
          political_affiliation: 'Party A', // Sensitive and unnecessary
          religious_beliefs: 'Religion X', // Sensitive and unnecessary
          social_security_number: '123456789', // Excessive
          passport_number: 'AB1234567', // Excessive for domestic operations
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should reject excessive data collection
      expect(excessiveDataResponse.status).toBe(400);
      expect(excessiveDataResponse.body).toMatchObject({
        error: expect.stringContaining('data minimization'),
        code: 'EXCESSIVE_DATA_COLLECTION',
        rejected_fields: expect.arrayContaining([
          'mothers_name',
          'medical_conditions',
          'political_affiliation',
          'religious_beliefs',
        ]),
      });

      // Test: Collect only necessary data
      const minimizedDataResponse = await request(app.getHttpServer())
        .post('/api/customers/profile')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'data-min-store')
        .send({
          name: 'Customer Name',
          email: 'customer@example.com',
          phone: '+5511999999999',
          cpf: '12345678901',
        })
        .catch(error => ({
          status: error.status || 500,
        }));

      // Should accept minimized data collection
      expect([200, 201, 404]).toContain(minimizedDataResponse.status);

      // Should log data collection compliance
      const dataCollectionLogs = await prismaService.dataProcessingLog.findMany({
        where: {
          user_id: createdMerchant.user_id,
          processing_type: 'COLLECTION',
          lawful_basis: 'LEGITIMATE_INTEREST',
        },
      });

      expect(dataCollectionLogs.length).toBeGreaterThan(0);
    });

    it('should enforce data retention policies', async () => {
      // Setup: Create historical data for retention testing
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      const apiKeyData = {
        id: 'retention-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440018',
        secret_hash: 'retention-secret-hash',
        name: 'Retention Test API Key',
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

      await prismaService.apiKey.create({ data: apiKeyData });

      // Create old usage logs (beyond retention period)
      const oldLogs = Array.from({ length: 100 }, (_, i) => ({
        id: `old-log-${i}`,
        api_key_id: apiKeyData.id,
        endpoint: '/api/coupons/search',
        http_method: 'GET',
        status_code: 200,
        response_time_ms: 100 + i,
        ip_address: `192.168.1.${100 + (i % 100)}`,
        user_agent: 'RetentionTestAgent/1.0',
        request_id: `old-req-${i}`,
        merchant_id: createdMerchant.user_id,
        coupon_category: 'electronics',
        geographic_location: 'BR-SP',
        is_suspicious: false,
        fraud_score: Math.random() * 20,
        security_flags: [],
        timestamp: new Date(Date.now() - (370 + i) * 24 * 60 * 60 * 1000), // Over 1 year old
      }));

      await prismaService.apiKeyUsageLog.createMany({ data: oldLogs });

      // Create recent logs (within retention period)
      const recentLogs = Array.from({ length: 50 }, (_, i) => ({
        id: `recent-log-${i}`,
        api_key_id: apiKeyData.id,
        endpoint: '/api/coupons/search',
        http_method: 'GET',
        status_code: 200,
        response_time_ms: 100 + i,
        ip_address: `192.168.1.${50 + (i % 50)}`,
        user_agent: 'RetentionTestAgent/1.0',
        request_id: `recent-req-${i}`,
        merchant_id: createdMerchant.user_id,
        coupon_category: 'electronics',
        geographic_location: 'BR-SP',
        is_suspicious: false,
        fraud_score: Math.random() * 20,
        security_flags: [],
        timestamp: new Date(Date.now() - (30 + i) * 24 * 60 * 60 * 1000), // Within last year
      }));

      await prismaService.apiKeyUsageLog.createMany({ data: recentLogs });

      const validApiKey = `ApiKey ${apiKeyData.key_id}:cmV0ZW50aW9uLXNlY3JldA==`;

      // Test: Trigger data retention cleanup
      const retentionCleanupResponse = await request(app.getHttpServer())
        .post('/api/admin/data-retention/cleanup')
        .set('x-api-key', validApiKey)
        .send({
          retention_type: 'USAGE_LOGS',
          retention_period_days: 365,
          dry_run: false,
        })
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should execute retention cleanup
      expect([200, 202, 404]).toContain(retentionCleanupResponse.status);

      // Verify old data is purged and recent data is retained
      const remainingOldLogs = await prismaService.apiKeyUsageLog.count({
        where: {
          api_key_id: apiKeyData.id,
          timestamp: {
            lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          },
        },
      });

      const remainingRecentLogs = await prismaService.apiKeyUsageLog.count({
        where: {
          api_key_id: apiKeyData.id,
          timestamp: {
            gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          },
        },
      });

      // Old logs should be purged (or significantly reduced)
      expect(remainingOldLogs).toBeLessThan(oldLogs.length);
      
      // Recent logs should be retained
      expect(remainingRecentLogs).toBe(recentLogs.length);

      // Should log retention activities
      const retentionLogs = await prismaService.dataRetentionLog.findMany({
        where: {
          entity_type: 'USAGE_LOGS',
          action: 'PURGED',
        },
      });

      expect(retentionLogs.length).toBeGreaterThan(0);
    });
  });

  describe('PCI DSS Compliance', () => {
    it('should enforce secure API key transmission', async () => {
      // Test: Attempt to use API key over insecure connection
      const insecureResponse = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', 'ApiKey test-key:dGVzdC1zZWNyZXQ=')
        .set('x-forwarded-proto', 'http') // Simulate HTTP instead of HTTPS
        .catch(error => ({
          status: error.status || 500,
          body: error.response?.body || {},
        }));

      // Should reject insecure API key transmission for PCI DSS compliance
      expect(insecureResponse.status).toBe(403);
      expect(insecureResponse.body).toMatchObject({
        error: expect.stringContaining('HTTPS required'),
        code: 'INSECURE_TRANSMISSION',
      });

      // Test: Secure transmission should be allowed
      const secureResponse = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', 'ApiKey test-key:dGVzdC1zZWNyZXQ=')
        .set('x-forwarded-proto', 'https') // HTTPS
        .catch(error => ({
          status: error.status || 500,
        }));

      // Should allow secure transmission (may fail for other reasons like invalid key)
      expect([200, 401, 404]).toContain(secureResponse.status);
    });

    it('should mask sensitive data in logs', async () => {
      // Setup: Create API key for logging test
      const merchantUser = ApiKeyFixtures.createMerchantUser();
      const createdMerchant = await prismaService.usuario.create({ data: merchantUser });

      const pciApiKeyData = {
        id: 'pci-logging-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440019',
        secret_hash: 'pci-logging-secret-hash',
        name: 'PCI Logging API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.PREMIUM,
        user_id: createdMerchant.user_id,
        tenant_id: 'pci-tenant',
        store_id: 'pci-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await prismaService.apiKey.create({ data: pciApiKeyData });

      const validApiKey = `ApiKey ${pciApiKeyData.key_id}:cGNpLWxvZ2dpbmctc2VjcmV0`;

      // Make request with sensitive data
      await request(app.getHttpServer())
        .post('/api/transactions/process')
        .set('x-api-key', validApiKey)
        .set('x-store-id', 'pci-store')
        .send({
          amount: 1000,
          currency: 'BRL',
          customer_id: 'customer-123',
          payment_method: 'credit_card',
          card_number: '4111111111111111', // Test credit card number
          cardholder_name: 'John Doe',
          expiry_date: '12/25',
          cvv: '123',
        })
        .catch(() => {
          // Expected if endpoint doesn't exist
        });

      // Check that sensitive data is masked in logs
      const usageLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key_id: pciApiKeyData.id,
          endpoint: '/api/transactions/process',
        },
        orderBy: { timestamp: 'desc' },
        take: 1,
      });

      if (usageLogs.length > 0) {
        const logEntry = usageLogs[0];
        
        // Sensitive data should be masked or not present in logs
        const logString = JSON.stringify(logEntry);
        expect(logString).not.toContain('4111111111111111'); // Card number
        expect(logString).not.toContain('123'); // CVV
        
        // Should contain masked versions if logging is required
        if (logString.includes('card_number')) {
          expect(logString).toMatch(/\*{12}\d{4}/); // Masked card number pattern
        }
      }

      // Should log PCI compliance activities
      const pciComplianceLogs = await prismaService.complianceLog.findMany({
        where: {
          user_id: createdMerchant.user_id,
          compliance_type: 'PCI_DSS',
          activity_type: 'DATA_MASKING',
        },
      });

      expect(pciComplianceLogs.length).toBeGreaterThan(0);
    });
  });
});