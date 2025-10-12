import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';

// Domain Services
import {
  ApiKeyDomainService,
  PermissionDomainService,
  FraudDetectionService,
} from './domain/services';

// Infrastructure Repositories


// Presentation Controllers
import {
  ApiKeyManagementController,
  MerchantApiKeyController,
  ConsumerApiKeyController,
} from './presentation/controllers/api-key-management.controller';

import {
  MarketplaceCouponsController,
  MarketplaceAnalyticsController,
  MarketplaceConsumerController,
  WebhookController,
  ElectronicsController,
} from './presentation/controllers/marketplace-example.controller';
import { PrismaApiKeyRepository } from './infrastructure/repositories/prisma-api-key.repository';
import { ApiKeyValidationService, ApiKeyManagementService, RateLimitService } from './application/services';
import { ApiKeyAuthGuard, ApiKeyPermissionGuard, RateLimitGuard } from './infrastructure/guards';
import { PrismaApiKeyUsageLogRepository, PrismaApiKeyRateLimitRepository, PrismaApiKeyAnalyticsRepository } from './infrastructure/repositories';

// Repository providers with interfaces
const repositoryProviders = [
  {
    provide: 'ApiKeyRepository',
    useClass: PrismaApiKeyRepository,
  },
  {
    provide: 'ApiKeyUsageLogRepository',
    useClass: PrismaApiKeyUsageLogRepository,
  },
  {
    provide: 'ApiKeyRateLimitRepository',
    useClass: PrismaApiKeyRateLimitRepository,
  },
  {
    provide: 'ApiKeyAnalyticsRepository',
    useClass: PrismaApiKeyAnalyticsRepository,
  },
];

@Module({
  imports: [PrismaModule],
  providers: [
    // Domain Services
    ApiKeyDomainService,
    PermissionDomainService,
    FraudDetectionService,

    // Repository Providers
    ...repositoryProviders,

    // Application Services
    {
      provide: ApiKeyValidationService,
      useFactory: (
        apiKeyRepo: any,
        usageLogRepo: any,
        apiKeyDomainService: ApiKeyDomainService,
        fraudDetectionService: FraudDetectionService,
      ) => {
        return new ApiKeyValidationService(
          apiKeyRepo,
          usageLogRepo,
          apiKeyDomainService,
          fraudDetectionService,
        );
      },
      inject: [
        'ApiKeyRepository',
        'ApiKeyUsageLogRepository',
        ApiKeyDomainService,
        FraudDetectionService,
      ],
    },
    {
      provide: ApiKeyManagementService,
      useFactory: (
        apiKeyRepo: any,
        rateLimitRepo: any,
        apiKeyDomainService: ApiKeyDomainService,
        permissionDomainService: PermissionDomainService,
      ) => {
        return new ApiKeyManagementService(
          apiKeyRepo,
          rateLimitRepo,
          apiKeyDomainService,
          permissionDomainService,
        );
      },
      inject: [
        'ApiKeyRepository',
        'ApiKeyRateLimitRepository',
        ApiKeyDomainService,
        PermissionDomainService,
      ],
    },
    {
      provide: RateLimitService,
      useFactory: (
        usageLogRepo: any,
        rateLimitRepo: any,
      ) => {
        return new RateLimitService(usageLogRepo, rateLimitRepo);
      },
      inject: ['ApiKeyUsageLogRepository', 'ApiKeyRateLimitRepository'],
    },

    // Guards
    ApiKeyAuthGuard,
    ApiKeyPermissionGuard,
    RateLimitGuard,
  ],
  controllers: [
    // Management Controllers
    ApiKeyManagementController,
    MerchantApiKeyController,
    ConsumerApiKeyController,

    // Example Marketplace Controllers
    MarketplaceCouponsController,
    MarketplaceAnalyticsController,
    MarketplaceConsumerController,
    WebhookController,
    ElectronicsController,
  ],
  exports: [
    // Export services for use in other modules
    ApiKeyValidationService,
    ApiKeyManagementService,
    RateLimitService,
    ApiKeyDomainService,
    PermissionDomainService,
    FraudDetectionService,

    // Export guards for use in other modules
    ApiKeyAuthGuard,
    ApiKeyPermissionGuard,
    RateLimitGuard,
  ],
})
export class ApiKeyModule {}