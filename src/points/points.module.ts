import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// Prisma
import { PrismaModule } from '../prisma/prisma.module';

// Auth
import { AuthModule } from '../auth/auth.module';

// Use Cases
import {
  CreateOrderUseCase,
  CheckOrderStatusUseCase,
  CreditPointsUseCase,
  GetTransactionHistoryUseCase
} from './application/use-cases';

// Repository Implementations
import {
  PrismaUserRepository,
  PrismaUserBalanceRepository,
  PrismaOrderRepository,
  PrismaPointsTransactionRepository,
  PrismaOrderStatusHistoryRepository
} from './infrastructure/repositories';

// Services
import { AlfredPayService } from './infrastructure/services';

// Controllers
import { PointsController } from './presentation/controllers';

// DI Tokens
import {
  USER_REPOSITORY,
  USER_BALANCE_REPOSITORY,
  ORDER_REPOSITORY,
  POINTS_TRANSACTION_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
  ALFRED_PAY_SERVICE
} from './points.tokens';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3
    }),
    ConfigModule,
    PrismaModule,
    AuthModule
  ],
  controllers: [
    PointsController
  ],
  providers: [
    // Use Cases
    CreateOrderUseCase,
    CheckOrderStatusUseCase,
    CreditPointsUseCase,
    GetTransactionHistoryUseCase,

    // Repository Implementations bound to Interfaces
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository
    },
    {
      provide: USER_BALANCE_REPOSITORY,
      useClass: PrismaUserBalanceRepository
    },
    {
      provide: ORDER_REPOSITORY,
      useClass: PrismaOrderRepository
    },
    {
      provide: POINTS_TRANSACTION_REPOSITORY,
      useClass: PrismaPointsTransactionRepository
    },
    {
      provide: ORDER_STATUS_HISTORY_REPOSITORY,
      useClass: PrismaOrderStatusHistoryRepository
    },

    // Service Implementations
    {
      provide: ALFRED_PAY_SERVICE,
      useClass: AlfredPayService
    }
  ],
  exports: [
    // Export use cases for external modules if needed
    CreateOrderUseCase,
    CheckOrderStatusUseCase,
    CreditPointsUseCase,
    GetTransactionHistoryUseCase,

    // Export repository tokens for external modules if needed
    USER_REPOSITORY,
    USER_BALANCE_REPOSITORY,
    ORDER_REPOSITORY,
    POINTS_TRANSACTION_REPOSITORY,
    ORDER_STATUS_HISTORY_REPOSITORY,

    // Export service tokens for external modules if needed
    ALFRED_PAY_SERVICE
  ]
})
export class PointsModule {}