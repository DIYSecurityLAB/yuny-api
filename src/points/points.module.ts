import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import {
  CreateOrderUseCase,
  CheckOrderStatusUseCase,
  CreditPointsUseCase,
  GetTransactionHistoryUseCase
} from './application/use-cases';
import {
  PrismaUserRepository,
  PrismaUserBalanceRepository,
  PrismaOrderRepository,
  PrismaPointsTransactionRepository,
  PrismaOrderStatusHistoryRepository
} from './infrastructure/repositories';
import { AlfredPayService } from './infrastructure/services';
import { PointsController } from './presentation/controllers';
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
    AuthModule,
    ApiKeyModule
  ],
  controllers: [
    PointsController
  ],
  providers: [
    CreateOrderUseCase,
    CheckOrderStatusUseCase,
    CreditPointsUseCase,
    GetTransactionHistoryUseCase,
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
    {
      provide: ALFRED_PAY_SERVICE,
      useClass: AlfredPayService
    }
  ],
  exports: [
    CreateOrderUseCase,
    CheckOrderStatusUseCase,
    CreditPointsUseCase,
    GetTransactionHistoryUseCase,
    USER_REPOSITORY,
    USER_BALANCE_REPOSITORY,
    ORDER_REPOSITORY,
    POINTS_TRANSACTION_REPOSITORY,
    ORDER_STATUS_HISTORY_REPOSITORY,
    ALFRED_PAY_SERVICE
  ]
})
export class PointsModule {}