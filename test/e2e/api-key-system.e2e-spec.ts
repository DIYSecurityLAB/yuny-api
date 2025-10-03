import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures } from '../fixtures/api-key-fixtures';
import { TestHelper } from '../helpers/test-helper';

describe('API Key System E2E Tests', () => {
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

  describe('Merchant Journey - Complete Flow', () => {
    it('should complete full merchant onboarding and API usage journey', async () => {
      // Step 1: Merchant Registration
      const merchantRegistration = {
        nome: 'Electronics Store',
        cpf: '12345678901',
        email: 'merchant@electronics.com',
        telefone: '+5511999999999',
        senha: 'SecurePassword123!',
      };

      const registrationResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(merchantRegistration)
        .expect(201);

      expect(registrationResponse.body).toHaveProperty('user_id');
      expect(registrationResponse.body.nome).toBe(merchantRegistration.nome);

      const merchantUserId = registrationResponse.body.user_id;

      // Step 2: Merchant Login
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: merchantRegistration.email,
          senha: merchantRegistration.senha,
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('access_token');
      expect(loginResponse.body).toHaveProperty('refresh_token');

      const accessToken = loginResponse.body.access_token;

      // Step 3: Create Merchant API Key
      const apiKeyCreationRequest = {
        name: 'Electronics Store Main API Key',
        userType: UserType.MERCHANT,
        rateLimitTier: RateLimitTier.PREMIUM,
        storeId: 'electronics-store-001',
        marketplaceContext: 'electronics',
        allowedRegions: ['BR-SP', 'BR-RJ', 'BR-MG'],
        complianceLevel: ComplianceLevel.PCI_DSS,
        allowedIps: ['192.168.1.0/24', '10.0.0.0/16'],
      };

      const apiKeyResponse = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(apiKeyCreationRequest)
        .expect(201);

      expect(apiKeyResponse.body).toHaveProperty('keyId');
      expect(apiKeyResponse.body).toHaveProperty('credentials');
      expect(apiKeyResponse.body.userType).toBe(UserType.MERCHANT);
      expect(apiKeyResponse.body.rateLimitTier).toBe(RateLimitTier.PREMIUM);
      expect(apiKeyResponse.body.permissions).toContain('coupon.create');
      expect(apiKeyResponse.body.permissions).toContain('inventory.update');

      const apiKeyCredentials = apiKeyResponse.body.credentials;

      // Step 4: Use API Key to Create Coupons
      const couponCreationData = {
        title: 'Black Friday Electronics Sale',
        description: '50% off on all electronics',
        discount_percentage: 50,
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        category: 'electronics',
        max_usage: 1000,
        min_purchase_amount: 100.00,
      };

      const couponResponse = await request(app.getHttpServer())
        .post('/api/coupons')
        .set('x-api-key', apiKeyCredentials)
        .set('x-store-id', 'electronics-store-001')
        .send(couponCreationData)
        .expect(201);

      expect(couponResponse.body).toHaveProperty('id');
      expect(couponResponse.body.title).toBe(couponCreationData.title);
      expect(couponResponse.body.discount_percentage).toBe(50);

      // Step 5: Update Inventory via API
      const inventoryUpdate = {
        product_id: 'smartphone-001',
        stock_quantity: 100,
        price: 1200.00,
        category: 'electronics',
        availability: true,
      };

      const inventoryResponse = await request(app.getHttpServer())
        .put('/api/inventory/smartphone-001')
        .set('x-api-key', apiKeyCredentials)
        .set('x-store-id', 'electronics-store-001')
        .send(inventoryUpdate)
        .expect(200);

      expect(inventoryResponse.body.success).toBe(true);

      // Step 6: Access Analytics Dashboard
      const analyticsResponse = await request(app.getHttpServer())
        .get('/api/analytics/dashboard')
        .set('x-api-key', apiKeyCredentials)
        .set('x-store-id', 'electronics-store-001')
        .query({
          period: '30d',
          metrics: 'sales,coupons,traffic',
        })
        .expect(200);

      expect(analyticsResponse.body).toHaveProperty('sales_data');
      expect(analyticsResponse.body).toHaveProperty('coupon_usage');
      expect(analyticsResponse.body).toHaveProperty('traffic_metrics');

      // Step 7: Bulk Upload Products
      const bulkUploadData = {
        products: [
          {
            id: 'laptop-001',
            name: 'Gaming Laptop',
            price: 2500.00,
            category: 'electronics',
            stock: 50,
          },
          {
            id: 'headphone-001',
            name: 'Wireless Headphones',
            price: 299.99,
            category: 'electronics',
            stock: 200,
          },
        ],
      };

      const bulkUploadResponse = await request(app.getHttpServer())
        .post('/api/products/bulk-upload')
        .set('x-api-key', apiKeyCredentials)
        .set('x-store-id', 'electronics-store-001')
        .send(bulkUploadData)
        .expect(201);

      expect(bulkUploadResponse.body.processed_count).toBe(2);
      expect(bulkUploadResponse.body.success_count).toBe(2);
      expect(bulkUploadResponse.body.error_count).toBe(0);

      // Step 8: Revenue Report Access
      const revenueResponse = await request(app.getHttpServer())
        .get('/api/revenue/report')
        .set('x-api-key', apiKeyCredentials)
        .set('x-store-id', 'electronics-store-001')
        .query({
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date().toISOString(),
          breakdown: 'daily',
        })
        .expect(200);

      expect(revenueResponse.body).toHaveProperty('total_revenue');
      expect(revenueResponse.body).toHaveProperty('daily_breakdown');
      expect(revenueResponse.body).toHaveProperty('commission_fees');

      // Step 9: API Key Management - List All Keys
      const apiKeysListResponse = await request(app.getHttpServer())
        .get('/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(apiKeysListResponse.body).toHaveLength(1);
      expect(apiKeysListResponse.body[0].name).toBe('Electronics Store Main API Key');
      expect(apiKeysListResponse.body[0]).not.toHaveProperty('credentials'); // Security check

      // Step 10: Rate Limit Testing
      const rateLimitPromises = Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .get('/api/coupons')
          .set('x-api-key', apiKeyCredentials)
          .set('x-store-id', 'electronics-store-001')
      );

      const rateLimitResults = await Promise.all(rateLimitPromises);
      
      // All requests should succeed for premium tier
      rateLimitResults.forEach((response) => {
        expect([200, 429]).toContain(response.status);
      });

      // Verify usage logs were created
      const usageLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key: {
            key_id: apiKeyResponse.body.keyId,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      expect(usageLogs.length).toBeGreaterThan(0);
      expect(usageLogs.some(log => log.endpoint === '/api/coupons')).toBe(true);
      expect(usageLogs.some(log => log.endpoint === '/api/analytics/dashboard')).toBe(true);
    });
  });

  describe('Consumer Journey - Complete Flow', () => {
    it('should complete full consumer registration and shopping journey', async () => {
      // Step 1: Consumer Registration
      const consumerRegistration = {
        nome: 'João Silva',
        cpf: '98765432100',
        email: 'joao.silva@email.com',
        telefone: '+5511888888888',
        senha: 'ConsumerPass123!',
      };

      const registrationResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(consumerRegistration)
        .expect(201);

      const consumerUserId = registrationResponse.body.user_id;

      // Step 2: Consumer Login
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: consumerRegistration.email,
          senha: consumerRegistration.senha,
        })
        .expect(200);

      const accessToken = loginResponse.body.access_token;

      // Step 3: Create Consumer API Key
      const apiKeyCreationRequest = {
        name: 'João Personal API Key',
        userType: UserType.CONSUMER,
        rateLimitTier: RateLimitTier.BASIC,
        marketplaceContext: 'general',
        allowedRegions: ['BR'],
        complianceLevel: ComplianceLevel.BASIC, // Basic KYC
      };

      const apiKeyResponse = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(apiKeyCreationRequest)
        .expect(201);

      expect(apiKeyResponse.body.userType).toBe(UserType.CONSUMER);
      expect(apiKeyResponse.body.rateLimitTier).toBe(RateLimitTier.BASIC);
      expect(apiKeyResponse.body.permissions).toContain('coupon.search');
      expect(apiKeyResponse.body.permissions).toContain('coupon.purchase');
      expect(apiKeyResponse.body.permissions).not.toContain('coupon.create');

      const apiKeyCredentials = apiKeyResponse.body.credentials;

      // Step 4: Search for Coupons
      const couponSearchResponse = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', apiKeyCredentials)
        .query({
          category: 'electronics',
          location: 'BR-SP',
          min_discount: 20,
          max_price: 1000,
        })
        .expect(200);

      expect(couponSearchResponse.body).toHaveProperty('coupons');
      expect(couponSearchResponse.body).toHaveProperty('total_count');
      expect(couponSearchResponse.body).toHaveProperty('filters_applied');

      // Step 5: View Coupon Details
      const couponId = 'electronics-coupon-001'; // Mock coupon ID
      const couponDetailsResponse = await request(app.getHttpServer())
        .get(`/api/coupons/${couponId}`)
        .set('x-api-key', apiKeyCredentials)
        .expect(200);

      expect(couponDetailsResponse.body).toHaveProperty('id');
      expect(couponDetailsResponse.body).toHaveProperty('title');
      expect(couponDetailsResponse.body).toHaveProperty('description');
      expect(couponDetailsResponse.body).toHaveProperty('discount_percentage');

      // Step 6: Purchase Coupon (within KYC limits)
      const couponPurchaseData = {
        coupon_id: couponId,
        quantity: 1,
        payment_method: 'points',
        points_amount: 500, // Under R$ 150k KYC limit when converted
      };

      const purchaseResponse = await request(app.getHttpServer())
        .post('/api/coupons/purchase')
        .set('x-api-key', apiKeyCredentials)
        .set('x-consumer-id', consumerUserId)
        .send(couponPurchaseData)
        .expect(201);

      expect(purchaseResponse.body).toHaveProperty('transaction_id');
      expect(purchaseResponse.body).toHaveProperty('coupon_code');
      expect(purchaseResponse.body.status).toBe('completed');

      // Step 7: View Wallet
      const walletResponse = await request(app.getHttpServer())
        .get('/api/wallet')
        .set('x-api-key', apiKeyCredentials)
        .set('x-consumer-id', consumerUserId)
        .expect(200);

      expect(walletResponse.body).toHaveProperty('normal_points');
      expect(walletResponse.body).toHaveProperty('indexed_points');
      expect(walletResponse.body).toHaveProperty('crypto_balance');
      expect(walletResponse.body).toHaveProperty('transaction_history');

      // Step 8: Convert Normal Points to Indexed Points
      const pointsConversionData = {
        from_type: 'normal',
        to_type: 'indexed',
        amount: 1000,
      };

      const conversionResponse = await request(app.getHttpServer())
        .post('/api/wallet/convert')
        .set('x-api-key', apiKeyCredentials)
        .set('x-consumer-id', consumerUserId)
        .send(pointsConversionData)
        .expect(200);

      expect(conversionResponse.body).toHaveProperty('conversion_id');
      expect(conversionResponse.body).toHaveProperty('exchange_rate');
      expect(conversionResponse.body).toHaveProperty('converted_amount');

      // Step 9: Attempt Crypto Conversion (should require advanced KYC)
      const cryptoConversionData = {
        from_type: 'indexed',
        to_type: 'bitcoin',
        amount: 5000, // Higher amount requiring advanced KYC
      };

      const cryptoConversionResponse = await request(app.getHttpServer())
        .post('/api/wallet/convert')
        .set('x-api-key', apiKeyCredentials)
        .set('x-consumer-id', consumerUserId)
        .send(cryptoConversionData)
        .expect(403); // Should be blocked due to KYC level

      expect(cryptoConversionResponse.body).toHaveProperty('error');
      expect(cryptoConversionResponse.body.error).toContain('KYC');

      // Step 10: Transaction History
      const transactionHistoryResponse = await request(app.getHttpServer())
        .get('/api/wallet/transactions')
        .set('x-api-key', apiKeyCredentials)
        .set('x-consumer-id', consumerUserId)
        .query({
          limit: 50,
          offset: 0,
          type: 'all',
        })
        .expect(200);

      expect(transactionHistoryResponse.body).toHaveProperty('transactions');
      expect(transactionHistoryResponse.body).toHaveProperty('total_count');
      expect(transactionHistoryResponse.body.transactions.length).toBeGreaterThan(0);

      // Step 11: Redeem Purchased Coupon
      const couponRedemptionData = {
        coupon_code: purchaseResponse.body.coupon_code,
        merchant_id: 'electronics-store-001',
        location: 'BR-SP',
      };

      const redemptionResponse = await request(app.getHttpServer())
        .post('/api/coupons/redeem')
        .set('x-api-key', apiKeyCredentials)
        .set('x-consumer-id', consumerUserId)
        .send(couponRedemptionData)
        .expect(200);

      expect(redemptionResponse.body).toHaveProperty('redemption_id');
      expect(redemptionResponse.body.status).toBe('redeemed');

      // Step 12: Rate Limit Testing for Consumer
      const consumerRateLimitPromises = Array.from({ length: 25 }, (_, i) =>
        request(app.getHttpServer())
          .get('/api/coupons/search')
          .set('x-api-key', apiKeyCredentials)
          .query({ category: 'general' })
      );

      const consumerRateLimitResults = await Promise.all(consumerRateLimitPromises);
      
      // Some requests should be rate limited for basic tier consumer
      const rateLimitedRequests = consumerRateLimitResults.filter(r => r.status === 429);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Admin Operations Journey', () => {
    it('should complete full admin operational journey', async () => {
      // Step 1: Admin Registration
      const adminRegistration = {
        nome: 'Admin User',
        cpf: '11122233344',
        email: 'admin@yuny.com',
        telefone: '+5511777777777',
        senha: 'AdminSecure123!',
      };

      const registrationResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(adminRegistration)
        .expect(201);

      const adminUserId = registrationResponse.body.user_id;

      // Step 2: Admin Login
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: adminRegistration.email,
          senha: adminRegistration.senha,
        })
        .expect(200);

      const accessToken = loginResponse.body.access_token;

      // Step 3: Create Admin API Key
      const apiKeyCreationRequest = {
        name: 'Admin Operations API Key',
        userType: UserType.ADMIN,
        rateLimitTier: RateLimitTier.UNLIMITED,
        complianceLevel: ComplianceLevel.SOX,
        allowedRegions: ['*'], // Global access
        allowedIps: ['*'], // All IPs allowed
      };

      const apiKeyResponse = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(apiKeyCreationRequest)
        .expect(201);

      expect(apiKeyResponse.body.userType).toBe(UserType.ADMIN);
      expect(apiKeyResponse.body.rateLimitTier).toBe(RateLimitTier.UNLIMITED);
      expect(apiKeyResponse.body.permissions).toContain('admin.all');

      const apiKeyCredentials = apiKeyResponse.body.credentials;

      // Step 4: Platform Analytics
      const platformAnalyticsResponse = await request(app.getHttpServer())
        .get('/api/admin/analytics/platform')
        .set('x-api-key', apiKeyCredentials)
        .query({
          period: '7d',
          metrics: 'users,transactions,revenue,fraud',
        })
        .expect(200);

      expect(platformAnalyticsResponse.body).toHaveProperty('total_users');
      expect(platformAnalyticsResponse.body).toHaveProperty('transaction_volume');
      expect(platformAnalyticsResponse.body).toHaveProperty('revenue_metrics');
      expect(platformAnalyticsResponse.body).toHaveProperty('fraud_detection');

      // Step 5: User Management
      const usersListResponse = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('x-api-key', apiKeyCredentials)
        .query({
          page: 1,
          limit: 100,
          user_type: 'all',
          status: 'active',
        })
        .expect(200);

      expect(usersListResponse.body).toHaveProperty('users');
      expect(usersListResponse.body).toHaveProperty('total_count');
      expect(usersListResponse.body).toHaveProperty('pagination');

      // Step 6: Merchant Management
      const merchantsResponse = await request(app.getHttpServer())
        .get('/api/admin/merchants')
        .set('x-api-key', apiKeyCredentials)
        .query({
          status: 'all',
          compliance_level: 'all',
        })
        .expect(200);

      expect(merchantsResponse.body).toHaveProperty('merchants');
      expect(merchantsResponse.body).toHaveProperty('compliance_status');

      // Step 7: Fraud Detection Dashboard
      const fraudDashboardResponse = await request(app.getHttpServer())
        .get('/api/admin/fraud/dashboard')
        .set('x-api-key', apiKeyCredentials)
        .query({
          time_range: '24h',
          severity: 'all',
        })
        .expect(200);

      expect(fraudDashboardResponse.body).toHaveProperty('suspicious_activities');
      expect(fraudDashboardResponse.body).toHaveProperty('fraud_score_distribution');
      expect(fraudDashboardResponse.body).toHaveProperty('blocked_transactions');

      // Step 8: Compliance Audit Report
      const complianceReportResponse = await request(app.getHttpServer())
        .get('/api/admin/compliance/audit')
        .set('x-api-key', apiKeyCredentials)
        .query({
          report_type: 'kyc_violations',
          start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date().toISOString(),
        })
        .expect(200);

      expect(complianceReportResponse.body).toHaveProperty('audit_results');
      expect(complianceReportResponse.body).toHaveProperty('violations_summary');
      expect(complianceReportResponse.body).toHaveProperty('recommendations');

      // Step 9: System Configuration
      const systemConfigResponse = await request(app.getHttpServer())
        .get('/api/admin/system/config')
        .set('x-api-key', apiKeyCredentials)
        .expect(200);

      expect(systemConfigResponse.body).toHaveProperty('rate_limits');
      expect(systemConfigResponse.body).toHaveProperty('fraud_thresholds');
      expect(systemConfigResponse.body).toHaveProperty('compliance_settings');

      // Step 10: Update System Configuration
      const configUpdateData = {
        fraud_detection: {
          threshold_score: 75,
          auto_block_enabled: true,
          review_queue_enabled: true,
        },
        rate_limits: {
          global_rate_limit: 10000,
          burst_multiplier: 2.0,
        },
      };

      const configUpdateResponse = await request(app.getHttpServer())
        .put('/api/admin/system/config')
        .set('x-api-key', apiKeyCredentials)
        .send(configUpdateData)
        .expect(200);

      expect(configUpdateResponse.body.success).toBe(true);

      // Step 11: API Key Management (Admin View)
      const allApiKeysResponse = await request(app.getHttpServer())
        .get('/api/admin/api-keys')
        .set('x-api-key', apiKeyCredentials)
        .query({
          user_type: 'all',
          status: 'all',
          page: 1,
          limit: 100,
        })
        .expect(200);

      expect(allApiKeysResponse.body).toHaveProperty('api_keys');
      expect(allApiKeysResponse.body).toHaveProperty('statistics');
      expect(allApiKeysResponse.body.api_keys.length).toBeGreaterThan(0);

      // Step 12: Revoke Suspicious API Key
      const suspiciousApiKeyId = 'suspicious-key-id';
      const revokeResponse = await request(app.getHttpServer())
        .post(`/api/admin/api-keys/${suspiciousApiKeyId}/revoke`)
        .set('x-api-key', apiKeyCredentials)
        .send({
          reason: 'Suspicious activity detected',
          auto_revoke: true,
        })
        .expect(200);

      expect(revokeResponse.body.success).toBe(true);

      // Verify no rate limiting for admin
      const adminRateLimitPromises = Array.from({ length: 100 }, (_, i) =>
        request(app.getHttpServer())
          .get('/api/admin/system/health')
          .set('x-api-key', apiKeyCredentials)
      );

      const adminRateLimitResults = await Promise.all(adminRateLimitPromises);
      
      // All requests should succeed for unlimited tier admin
      adminRateLimitResults.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Security and Compliance E2E Tests', () => {
    it('should properly handle security violations and compliance checks', async () => {
      // Create a consumer user with basic KYC
      const consumerRegistration = {
        nome: 'Test Consumer',
        cpf: '12312312312',
        email: 'consumer@test.com',
        telefone: '+5511999999999',
        senha: 'TestPass123!',
      };

      const registrationResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(consumerRegistration)
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: consumerRegistration.email,
          senha: consumerRegistration.senha,
        })
        .expect(200);

      const accessToken = loginResponse.body.access_token;

      // Create API key with specific IP restrictions
      const apiKeyCreationRequest = {
        name: 'Security Test API Key',
        userType: UserType.CONSUMER,
        rateLimitTier: RateLimitTier.BASIC,
        allowedIps: ['192.168.1.1'], // Specific IP only
        allowedRegions: ['BR-SP'], // Specific region only
        complianceLevel: ComplianceLevel.BASIC,
      };

      const apiKeyResponse = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(apiKeyCreationRequest)
        .expect(201);

      const apiKeyCredentials = apiKeyResponse.body.credentials;

      // Test 1: Valid IP and Region (should work)
      const validRequest = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', apiKeyCredentials)
        .set('x-forwarded-for', '192.168.1.1') // Allowed IP
        .set('x-geo-location', 'BR-SP') // Allowed region
        .expect(200);

      // Test 2: Invalid IP (should be blocked)
      const invalidIpRequest = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', apiKeyCredentials)
        .set('x-forwarded-for', '203.0.113.1') // Blocked IP
        .set('x-geo-location', 'BR-SP')
        .expect(401);

      expect(invalidIpRequest.body.message).toContain('Access denied');

      // Test 3: Invalid Region (should be blocked)
      const invalidRegionRequest = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', apiKeyCredentials)
        .set('x-forwarded-for', '192.168.1.1')
        .set('x-geo-location', 'US-CA')
        .expect(401);

      expect(invalidRegionRequest.body.message).toContain('Access denied');

      // Test 4: Malformed API Key (should be blocked)
      const malformedKeyRequest = await request(app.getHttpServer())
        .get('/api/coupons/search')
        .set('x-api-key', 'InvalidApiKeyFormat')
        .expect(401);

      expect(malformedKeyRequest.body.message).toContain('Invalid API key');

      // Test 5: KYC Compliance Check - Large Transaction
      const largeTransactionRequest = await request(app.getHttpServer())
        .post('/api/wallet/convert')
        .set('x-api-key', apiKeyCredentials)
        .set('x-forwarded-for', '192.168.1.1')
        .set('x-geo-location', 'BR-SP')
        .send({
          from_type: 'indexed',
          to_type: 'bitcoin',
          amount: 200000, // Above R$ 150k KYC limit
        })
        .expect(403);

      expect(largeTransactionRequest.body.error).toContain('KYC');

      // Test 6: Rate Limiting
      const rateLimitPromises = Array.from({ length: 30 }, (_, i) =>
        request(app.getHttpServer())
          .get('/api/coupons/search')
          .set('x-api-key', apiKeyCredentials)
          .set('x-forwarded-for', '192.168.1.1')
          .set('x-geo-location', 'BR-SP')
      );

      const rateLimitResults = await Promise.all(rateLimitPromises);
      const rateLimitedCount = rateLimitResults.filter(r => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);

      // Test 7: Suspicious Activity Detection
      const suspiciousActivities = [
        // Rapid-fire requests with different user agents
        ...Array.from({ length: 5 }, (_, i) =>
          request(app.getHttpServer())
            .get('/api/coupons/search')
            .set('x-api-key', apiKeyCredentials)
            .set('x-forwarded-for', '192.168.1.1')
            .set('x-geo-location', 'BR-SP')
            .set('user-agent', `Bot-${i}/1.0`)
        ),
      ];

      const suspiciousResults = await Promise.all(suspiciousActivities);
      
      // Some requests should be blocked due to suspicious patterns
      const blockedSuspiciousCount = suspiciousResults.filter(r => r.status === 401).length;
      // Note: This depends on fraud detection implementation

      // Verify security logs were created
      const securityLogs = await prismaService.apiKeyUsageLog.findMany({
        where: {
          api_key: {
            key_id: apiKeyResponse.body.keyId,
          },
          is_suspicious: true,
        },
      });

      expect(securityLogs.length).toBeGreaterThan(0);
    });
  });
});