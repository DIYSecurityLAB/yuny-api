import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UserType, RateLimitTier, ComplianceLevel, ApiKeyStatus } from '../../src/api-key/domain/enums';
import { ApiKeyFixtures } from '../fixtures/api-key-fixtures';
import { TestHelper } from '../helpers/test-helper';

describe('API Key System Performance Tests', () => {
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

  describe('Load Testing - High Volume Operations', () => {
    it('should handle 1000 concurrent API key validations within performance limits', async () => {
      // Setup: Create test user and API key
      const testUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: testUser });

      const apiKeyData = {
        id: 'perf-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440000',
        secret_hash: 'performance-test-secret-hash',
        name: 'Performance Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.ENTERPRISE,
        user_id: createdUser.user_id,
        tenant_id: 'perf-tenant',
        store_id: 'perf-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const createdApiKey = await prismaService.apiKey.create({ data: apiKeyData });

      // Add permissions
      await prismaService.apiKeyPermission.create({
        data: {
          id: 'perf-perm-1',
          api_key_id: createdApiKey.id,
          permission: 'coupon.create',
          granted_at: new Date(),
        },
      });

      const apiKeyCredentials = `ApiKey ${apiKeyData.key_id}:cGVyZm9ybWFuY2UtdGVzdC1zZWNyZXQ=`;

      // Performance Test: 1000 concurrent requests
      const startTime = Date.now();
      const concurrentRequests = 1000;
      
      const requestPromises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app.getHttpServer())
          .get('/api/coupons/search')
          .set('x-api-key', apiKeyCredentials)
          .set('x-store-id', 'perf-store')
          .query({ page: 1, limit: 10 })
          .then(response => ({
            status: response.status,
            responseTime: Date.now() - startTime,
            requestIndex: i,
          }))
          .catch(error => ({
            status: error.status || 500,
            responseTime: Date.now() - startTime,
            requestIndex: i,
            error: error.message,
          }))
      );

      const results = await Promise.all(requestPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Performance Assertions
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds

      const successfulRequests = results.filter(r => r.status === 200);
      const failedRequests = results.filter(r => r.status !== 200);
      const rateLimitedRequests = results.filter(r => r.status === 429);

      console.log(`Performance Test Results:
        - Total Requests: ${concurrentRequests}
        - Successful: ${successfulRequests.length}
        - Failed: ${failedRequests.length}
        - Rate Limited: ${rateLimitedRequests.length}
        - Total Time: ${totalTime}ms
        - Average Time per Request: ${totalTime / concurrentRequests}ms
        - Requests per Second: ${(concurrentRequests / totalTime) * 1000}
      `);

      // Assertions
      expect(successfulRequests.length).toBeGreaterThan(concurrentRequests * 0.8); // At least 80% success
      expect(totalTime / concurrentRequests).toBeLessThan(200); // Average < 200ms per request

      // Verify usage logs were created efficiently
      const usageLogsCount = await prismaService.apiKeyUsageLog.count({
        where: { api_key_id: createdApiKey.id },
      });

      expect(usageLogsCount).toBeGreaterThan(0);
    });

    it('should maintain database performance under heavy load', async () => {
      // Create multiple users and API keys for comprehensive testing
      const userCount = 100;
      const apiKeysPerUser = 3;

      const users = Array.from({ length: userCount }, (_, i) => ({
        user_id: `user-${i}`,
        nome: `User ${i}`,
        cpf: `${i.toString().padStart(11, '0')}`,
        email: `user${i}@test.com`,
        telefone: `+551199999${i.toString().padStart(4, '0')}`,
        senhaHash: '$2b$10$hashedpassword',
      }));

      // Batch insert users
      const startUserCreation = Date.now();
      await prismaService.usuario.createMany({ data: users });
      const userCreationTime = Date.now() - startUserCreation;

      console.log(`User creation time: ${userCreationTime}ms for ${userCount} users`);
      expect(userCreationTime).toBeLessThan(5000); // Should create 100 users in < 5 seconds

      // Create API keys for each user
      const apiKeys: any[] = [];
      users.forEach((user, userIndex) => {
        for (let keyIndex = 0; keyIndex < apiKeysPerUser; keyIndex++) {
          apiKeys.push({
            id: `api-key-${userIndex}-${keyIndex}`,
            key_id: `key-${userIndex}-${keyIndex}`,
            secret_hash: `hash-${userIndex}-${keyIndex}`,
            name: `API Key ${keyIndex} for User ${userIndex}`,
            user_type: userIndex % 2 === 0 ? UserType.MERCHANT : UserType.CONSUMER,
            status: ApiKeyStatus.ACTIVE,
            rate_limit_tier: RateLimitTier.PREMIUM,
            user_id: user.user_id,
            tenant_id: `tenant-${userIndex}`,
            marketplace_context: 'general',
            allowed_regions: ['BR'],
            compliance_level: ComplianceLevel.BASIC,
            allowed_ips: [],
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      });

      const startApiKeyCreation = Date.now();
      await prismaService.apiKey.createMany({ data: apiKeys });
      const apiKeyCreationTime = Date.now() - startApiKeyCreation;

      console.log(`API key creation time: ${apiKeyCreationTime}ms for ${apiKeys.length} keys`);
      expect(apiKeyCreationTime).toBeLessThan(10000); // Should create 300 API keys in < 10 seconds

      // Test query performance
      const startQueryTime = Date.now();
      
      const queryPromises = [
        // Test different query patterns
        prismaService.apiKey.findMany({
          where: { user_type: UserType.MERCHANT },
          include: { usuario: true },
        }),
        prismaService.apiKey.groupBy({
          by: ['user_type', 'rate_limit_tier'],
          _count: { id: true },
        }),
        prismaService.usuario.findMany({
          include: {
            apiKeys: {
              select: { id: true, name: true, status: true },
            },
          },
        }),
        prismaService.apiKey.findMany({
          where: {
            created_at: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          orderBy: { created_at: 'desc' },
          take: 50,
        }),
      ];

      const queryResults = await Promise.all(queryPromises);
      const queryTime = Date.now() - startQueryTime;

      console.log(`Complex queries time: ${queryTime}ms`);
      expect(queryTime).toBeLessThan(3000); // Complex queries should complete in < 3 seconds

      // Verify data integrity
      expect(queryResults[0].length).toBeGreaterThan(0); // Merchants found
      expect(queryResults[1].length).toBeGreaterThan(0); // Grouping worked
      expect(queryResults[2].length).toBe(userCount); // All users with API keys
      expect(queryResults[3].length).toBeGreaterThan(0); // Recent API keys found
    });

    it('should handle bulk usage log insertion efficiently', async () => {
      // Setup: Create API key
      const testUser = ApiKeyFixtures.createMerchantUser();
      const createdUser = await prismaService.usuario.create({ data: testUser });

      const apiKeyData = {
        id: 'bulk-log-test-api-key',
        key_id: '550e8400-e29b-41d4-a716-446655440001',
        secret_hash: 'bulk-log-test-secret',
        name: 'Bulk Log Test API Key',
        user_type: UserType.MERCHANT,
        status: ApiKeyStatus.ACTIVE,
        rate_limit_tier: RateLimitTier.ENTERPRISE,
        user_id: createdUser.user_id,
        tenant_id: 'bulk-tenant',
        store_id: 'bulk-store',
        marketplace_context: 'electronics',
        allowed_regions: ['BR'],
        compliance_level: ComplianceLevel.PCI_DSS,
        allowed_ips: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const createdApiKey = await prismaService.apiKey.create({ data: apiKeyData });

      // Generate bulk usage logs
      const logCount = 10000;
      const usageLogs = Array.from({ length: logCount }, (_, i) => ({
        id: `bulk-log-${i}`,
        api_key_id: createdApiKey.id,
        endpoint: i % 2 === 0 ? '/api/coupons' : '/api/analytics',
        http_method: i % 3 === 0 ? 'POST' : 'GET',
        status_code: i % 20 === 0 ? 429 : 200, // 5% rate limited
        response_time_ms: 50 + Math.floor(Math.random() * 200),
        ip_address: `192.168.1.${(i % 254) + 1}`,
        user_agent: i % 10 === 0 ? 'curl/7.68.0' : 'Mozilla/5.0',
        request_id: `req-bulk-${i}`,
        transaction_value: i % 5 === 0 ? Math.random() * 1000 : null,
        currency: i % 5 === 0 ? 'BRL' : null,
        merchant_id: createdUser.user_id,
        coupon_category: 'electronics',
        geographic_location: 'BR-SP',
        is_suspicious: i % 50 === 0, // 2% suspicious
        fraud_score: i % 50 === 0 ? Math.random() * 100 : Math.random() * 30,
        security_flags: i % 50 === 0 ? ['HIGH_FRAUD_SCORE'] : [],
        timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Random within last 24h
      }));

      // Test bulk insertion performance
      const startBulkInsert = Date.now();
      
      // Insert in batches to avoid memory issues
      const batchSize = 1000;
      const batches = [];
      for (let i = 0; i < usageLogs.length; i += batchSize) {
        batches.push(usageLogs.slice(i, i + batchSize));
      }

      const batchPromises = batches.map(batch =>
        prismaService.apiKeyUsageLog.createMany({ data: batch })
      );

      await Promise.all(batchPromises);
      const bulkInsertTime = Date.now() - startBulkInsert;

      console.log(`Bulk insert time: ${bulkInsertTime}ms for ${logCount} records`);
      expect(bulkInsertTime).toBeLessThan(30000); // Should insert 10k records in < 30 seconds

      // Test query performance on large dataset
      const startAnalyticsQuery = Date.now();

      const analyticsQueries = await Promise.all([
        // Hourly aggregation
        prismaService.$queryRaw`
          SELECT 
            DATE_TRUNC('hour', timestamp) as hour,
            COUNT(*) as request_count,
            AVG(response_time_ms) as avg_response_time,
            COUNT(CASE WHEN is_suspicious = true THEN 1 END) as suspicious_count
          FROM api_key_usage_logs 
          WHERE api_key_id = ${createdApiKey.id}
          GROUP BY DATE_TRUNC('hour', timestamp)
          ORDER BY hour DESC
          LIMIT 24
        `,
        
        // Top endpoints
        prismaService.apiKeyUsageLog.groupBy({
          by: ['endpoint'],
          where: { api_key_id: createdApiKey.id },
          _count: { id: true },
          _avg: { response_time_ms: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        }),

        // Suspicious activity analysis
        prismaService.apiKeyUsageLog.findMany({
          where: {
            api_key_id: createdApiKey.id,
            is_suspicious: true,
          },
          orderBy: { fraud_score: 'desc' },
          take: 100,
        }),
      ]);

      const analyticsQueryTime = Date.now() - startAnalyticsQuery;

      console.log(`Analytics queries time: ${analyticsQueryTime}ms`);
      expect(analyticsQueryTime).toBeLessThan(5000); // Analytics should complete in < 5 seconds

      // Verify data integrity
      expect(analyticsQueries[0]).toBeDefined(); // Hourly aggregation
      expect(analyticsQueries[1].length).toBeGreaterThan(0); // Top endpoints
      expect(analyticsQueries[2].length).toBeGreaterThan(0); // Suspicious activities

      // Test cleanup performance
      const startCleanup = Date.now();
      const deletedCount = await prismaService.apiKeyUsageLog.deleteMany({
        where: {
          api_key_id: createdApiKey.id,
          timestamp: {
            lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Older than 7 days
          },
        },
      });
      const cleanupTime = Date.now() - startCleanup;

      console.log(`Cleanup time: ${cleanupTime}ms, deleted: ${deletedCount.count} records`);
      expect(cleanupTime).toBeLessThan(10000); // Cleanup should complete in < 10 seconds
    });
  });

  describe('Stress Testing - Resource Limits', () => {
    it('should handle memory efficiently with large datasets', async () => {
      const initialMemory = process.memoryUsage();
      console.log('Initial memory usage:', initialMemory);

      // Create a large number of API keys and usage logs
      const userCount = 50;
      const apiKeysPerUser = 5;
      const logsPerApiKey = 1000;

      // Monitor memory during creation
      const users = Array.from({ length: userCount }, (_, i) => ({
        user_id: `stress-user-${i}`,
        nome: `Stress User ${i}`,
        cpf: `${(i + 10000000000).toString()}`,
        email: `stress${i}@test.com`,
        telefone: `+55119999${i.toString().padStart(4, '0')}`,
        senhaHash: '$2b$10$stresshash',
      }));

      await prismaService.usuario.createMany({ data: users });

      const memoryAfterUsers = process.memoryUsage();
      console.log('Memory after users:', memoryAfterUsers);

      // Create API keys
      const apiKeys: any[] = [];
      users.forEach((user, userIndex) => {
        for (let keyIndex = 0; keyIndex < apiKeysPerUser; keyIndex++) {
          apiKeys.push({
            id: `stress-key-${userIndex}-${keyIndex}`,
            key_id: `stress-${userIndex}-${keyIndex}`,
            secret_hash: `stress-hash-${userIndex}-${keyIndex}`,
            name: `Stress API Key ${keyIndex} for User ${userIndex}`,
            user_type: UserType.MERCHANT,
            status: ApiKeyStatus.ACTIVE,
            rate_limit_tier: RateLimitTier.PREMIUM,
            user_id: user.user_id,
            tenant_id: `stress-tenant-${userIndex}`,
            marketplace_context: 'stress-test',
            allowed_regions: ['BR'],
            compliance_level: ComplianceLevel.BASIC,
            allowed_ips: [],
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      });

      await prismaService.apiKey.createMany({ data: apiKeys });

      const memoryAfterApiKeys = process.memoryUsage();
      console.log('Memory after API keys:', memoryAfterApiKeys);

      // Create usage logs in batches to control memory
      const totalLogs = apiKeys.length * logsPerApiKey;
      const batchSize = 500;
      let processedLogs = 0;

      for (const apiKey of apiKeys) {
        const logs = Array.from({ length: logsPerApiKey }, (_, i) => ({
          id: `stress-log-${apiKey.id}-${i}`,
          api_key_id: apiKey.id,
          endpoint: '/api/stress-test',
          http_method: 'GET',
          status_code: 200,
          response_time_ms: Math.floor(Math.random() * 500),
          ip_address: `10.0.${Math.floor(i / 255)}.${i % 255}`,
          user_agent: 'StressTestAgent/1.0',
          request_id: `stress-req-${apiKey.id}-${i}`,
          transaction_value: null,
          currency: null,
          merchant_id: apiKey.user_id,
          coupon_category: 'stress-test',
          geographic_location: 'BR-SP',
          is_suspicious: false,
          fraud_score: Math.random() * 20,
          security_flags: [],
          timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        }));

        // Insert in smaller batches
        for (let i = 0; i < logs.length; i += batchSize) {
          const batch = logs.slice(i, i + batchSize);
          await prismaService.apiKeyUsageLog.createMany({ data: batch });
          processedLogs += batch.length;

          // Monitor memory every 10 batches
          if (processedLogs % (batchSize * 10) === 0) {
            const currentMemory = process.memoryUsage();
            console.log(`Processed ${processedLogs}/${totalLogs} logs. Memory:`, currentMemory);
            
            // Memory should not grow excessively
            expect(currentMemory.heapUsed).toBeLessThan(initialMemory.heapUsed * 5);
          }
        }
      }

      const finalMemory = process.memoryUsage();
      console.log('Final memory usage:', finalMemory);

      // Test query performance on stressed database
      const startStressQuery = Date.now();

      const stressQueryResults = await Promise.all([
        prismaService.apiKey.count(),
        prismaService.apiKeyUsageLog.count(),
        prismaService.apiKeyUsageLog.aggregate({
          _avg: { response_time_ms: true },
          _max: { timestamp: true },
          _min: { timestamp: true },
        }),
        prismaService.apiKey.findMany({
          include: {
            usuario: { select: { nome: true, email: true } },
            _count: { select: { usage_logs: true } },
          },
          take: 10,
        }),
      ]);

      const stressQueryTime = Date.now() - startStressQuery;

      console.log(`Stress query time: ${stressQueryTime}ms`);
      console.log(`Total API keys: ${stressQueryResults[0]}`);
      console.log(`Total usage logs: ${stressQueryResults[1]}`);

      expect(stressQueryTime).toBeLessThan(10000); // Queries should still be fast
      expect(stressQueryResults[0]).toBe(userCount * apiKeysPerUser);
      expect(stressQueryResults[1]).toBe(totalLogs);

      // Cleanup to prevent memory leaks in other tests
      const stressApiKeys = await prismaService.apiKey.findMany({
        where: { name: { contains: 'Stress API Key' } },
        select: { id: true },
      });
      
      if (stressApiKeys.length > 0) {
        await prismaService.apiKeyUsageLog.deleteMany({
          where: { api_key_id: { in: stressApiKeys.map(k => k.id) } },
        });
        await prismaService.apiKey.deleteMany({
          where: { id: { in: stressApiKeys.map(k => k.id) } },
        });
      }
      
      await prismaService.usuario.deleteMany({
        where: { nome: { contains: 'Stress User' } },
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    });

    it('should maintain response times under concurrent load', async () => {
      // Setup multiple API keys for concurrent testing
      const concurrentUsers = 10;
      const requestsPerUser = 100;

      const users = await Promise.all(
        Array.from({ length: concurrentUsers }, async (_, i) => {
          const userData = {
            user_id: `concurrent-user-${i}`,
            nome: `Concurrent User ${i}`,
            cpf: `${(i + 20000000000).toString()}`,
            email: `concurrent${i}@test.com`,
            telefone: `+55119998${i.toString().padStart(4, '0')}`,
            senhaHash: '$2b$10$concurrenthash',
          };

          return prismaService.usuario.create({ data: userData });
        })
      );

      const apiKeys = await Promise.all(
        users.map(async (user, i) => {
          const apiKeyData = {
            id: `concurrent-key-${i}`,
            key_id: `concurrent-${i}`,
            secret_hash: `concurrent-hash-${i}`,
            name: `Concurrent API Key ${i}`,
            user_type: UserType.MERCHANT,
            status: ApiKeyStatus.ACTIVE,
            rate_limit_tier: RateLimitTier.ENTERPRISE,
            user_id: user.user_id,
            tenant_id: `concurrent-tenant-${i}`,
            marketplace_context: 'concurrent-test',
            allowed_regions: ['BR'],
            compliance_level: ComplianceLevel.BASIC,
            allowed_ips: [],
            created_at: new Date(),
            updated_at: new Date(),
          };

          return prismaService.apiKey.create({ data: apiKeyData });
        })
      );

      // Add permissions to all API keys
      await Promise.all(
        apiKeys.map(apiKey =>
          prismaService.apiKeyPermission.create({
            data: {
              id: `concurrent-perm-${apiKey.id}`,
              api_key_id: apiKey.id,
              permission: 'coupon.create',
              granted_at: new Date(),
            },
          })
        )
      );

      // Execute concurrent requests
      const allRequestPromises: Promise<any>[] = [];

      apiKeys.forEach((apiKey, userIndex) => {
        const userRequests = Array.from({ length: requestsPerUser }, (_, requestIndex) => {
          const apiKeyCredentials = `ApiKey ${apiKey.key_id}:Y29uY3VycmVudC10ZXN0LXNlY3JldA==`;
          
          return request(app.getHttpServer())
            .get('/api/coupons/search')
            .set('x-api-key', apiKeyCredentials)
            .set('x-store-id', `concurrent-store-${userIndex}`)
            .query({ page: 1, limit: 10 })
            .then(response => ({
              userIndex,
              requestIndex,
              status: response.status,
              responseTime: response.get('X-Response-Time') || 0,
              timestamp: Date.now(),
            }))
            .catch(error => ({
              userIndex,
              requestIndex,
              status: error.status || 500,
              responseTime: 0,
              timestamp: Date.now(),
              error: error.message,
            }));
        });

        allRequestPromises.push(...userRequests);
      });

      const startConcurrentTest = Date.now();
      const results = await Promise.all(allRequestPromises);
      const totalConcurrentTime = Date.now() - startConcurrentTest;

      // Analyze results
      const successfulRequests = results.filter(r => r.status === 200);
      const failedRequests = results.filter(r => r.status !== 200);
      const responseTimes = successfulRequests
        .map(r => r.responseTime)
        .filter(rt => rt > 0)
        .sort((a, b) => a - b);

      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length 
        : 0;
      
      const p95ResponseTime = responseTimes.length > 0 
        ? responseTimes[Math.floor(responseTimes.length * 0.95)] 
        : 0;
      
      const p99ResponseTime = responseTimes.length > 0 
        ? responseTimes[Math.floor(responseTimes.length * 0.99)] 
        : 0;

      console.log(`Concurrent Load Test Results:
        - Total Requests: ${results.length}
        - Successful: ${successfulRequests.length}
        - Failed: ${failedRequests.length}
        - Total Time: ${totalConcurrentTime}ms
        - Requests/Second: ${(results.length / totalConcurrentTime) * 1000}
        - Average Response Time: ${avgResponseTime}ms
        - P95 Response Time: ${p95ResponseTime}ms
        - P99 Response Time: ${p99ResponseTime}ms
      `);

      // Performance assertions
      expect(successfulRequests.length).toBeGreaterThan(results.length * 0.95); // 95% success rate
      expect(avgResponseTime).toBeLessThan(200); // Average response time < 200ms
      expect(p95ResponseTime).toBeLessThan(500); // 95th percentile < 500ms
      expect(p99ResponseTime).toBeLessThan(1000); // 99th percentile < 1000ms
      expect((results.length / totalConcurrentTime) * 1000).toBeGreaterThan(50); // At least 50 RPS
    });
  });

  describe('Scalability Testing', () => {
    it('should scale database operations linearly', async () => {
      const testSizes = [100, 500, 1000];
      const results: Array<{ size: number; insertTime: number; queryTime: number }> = [];

      for (const size of testSizes) {
        // Create test data
        const users = Array.from({ length: size }, (_, i) => ({
          user_id: `scale-user-${size}-${i}`,
          nome: `Scale User ${i}`,
          cpf: `${(i + size * 1000000000).toString().padEnd(11, '0')}`,
          email: `scale${size}-${i}@test.com`,
          telefone: `+55119997${i.toString().padStart(4, '0')}`,
          senhaHash: '$2b$10$scalehash',
        }));

        // Measure insert time
        const insertStart = Date.now();
        await prismaService.usuario.createMany({ data: users });
        const insertTime = Date.now() - insertStart;

        // Measure query time
        const queryStart = Date.now();
        const queryResult = await prismaService.usuario.findMany({
          where: { nome: { contains: `Scale User` } },
          include: { apiKeys: true },
        });
        const queryTime = Date.now() - queryStart;

        results.push({ size, insertTime, queryTime });

        expect(queryResult.length).toBe(size);

        console.log(`Scale test for ${size} records: Insert ${insertTime}ms, Query ${queryTime}ms`);

        // Cleanup
        await prismaService.usuario.deleteMany({
          where: { nome: { contains: `Scale User` } },
        });
      }

      // Analyze scalability
      for (let i = 1; i < results.length; i++) {
        const current = results[i];
        const previous = results[i - 1];
        
        const sizeRatio = current.size / previous.size;
        const insertTimeRatio = current.insertTime / previous.insertTime;
        const queryTimeRatio = current.queryTime / previous.queryTime;

        console.log(`Scalability ratios for ${previous.size} to ${current.size}:
          - Size ratio: ${sizeRatio}x
          - Insert time ratio: ${insertTimeRatio}x
          - Query time ratio: ${queryTimeRatio}x
        `);

        // Insert time should scale roughly linearly (not worse than quadratic)
        expect(insertTimeRatio).toBeLessThan(sizeRatio * 2);
        
        // Query time should scale roughly linearly for simple queries
        expect(queryTimeRatio).toBeLessThan(sizeRatio * 1.5);
      }
    });
  });
});