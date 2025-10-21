import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

import {
  IUserRepository,
  IOrderRepository,
  IPointsTransactionRepository,
  IOrderStatusHistoryRepository,
  IUserBalanceRepository
} from '../../domain/repositories';
import {
  USER_REPOSITORY,
  USER_BALANCE_REPOSITORY,
  ORDER_REPOSITORY,
  POINTS_TRANSACTION_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
  ALFRED_PAY_SERVICE
} from '../../points.tokens';
import {
  Order,
  PointsTransaction,
  OrderStatusHistory,
  UserBalance
} from '../../domain/entities';
import {
  OrderStatus,
  PointsTransactionType,
  ChangedBy,
  PaymentMethod
} from '../../domain/enums';
import { PointsCalculationService } from '../../domain/services';
import { IAlfredPayService } from '../../infrastructure/services/alfred-pay-service.interface';
import { CreateOrderRequest, CreateOrderResponse } from '../dto';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(POINTS_TRANSACTION_REPOSITORY) private readonly pointsTransactionRepository: IPointsTransactionRepository,
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY) private readonly orderStatusHistoryRepository: IOrderStatusHistoryRepository,
    @Inject(USER_BALANCE_REPOSITORY) private readonly userBalanceRepository: IUserBalanceRepository,
    @Inject(ALFRED_PAY_SERVICE) private readonly alfredPayService: IAlfredPayService,
    private readonly configService: ConfigService
  ) {}

  async execute(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    // 1. Validar usuário
    const user = await this.userRepository.findById(request.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isActiveUser()) {
      throw new Error('User is not active');
    }

    // 2. Calcular valores
    const calculationDetails = PointsCalculationService.calculatePurchaseDetails(request.requestedAmount);

    // 3. Criar ordem
    const orderId = uuidv4();
    const now = new Date();

    const order = new Order({
      id: orderId,
      userId: request.userId,
      requestedAmount: calculationDetails.requestedAmount,
      feeAmount: calculationDetails.feeAmount,
      totalAmount: calculationDetails.totalAmount,
      pointsAmount: calculationDetails.pointsAmount,
      status: OrderStatus.PENDING,
      paymentMethod: request.paymentMethod,
      metadata: {
        description: request.description || 'Purchase of YunY Points'
      },
      createdAt: now,
      updatedAt: now
    });

    // 4. Criar transação de pontos pendente
    const transactionId = uuidv4();
    const pointsTransaction = new PointsTransaction({
      id: transactionId,
      userId: request.userId,
      orderId: orderId,
      type: PointsTransactionType.PENDING,
      amount: calculationDetails.pointsAmount,
      description: `Purchase of ${calculationDetails.pointsAmount.toString()} YunY Points`,
      metadata: {
        orderId: orderId,
        requestedAmount: calculationDetails.requestedAmount.toString(),
        feeAmount: calculationDetails.feeAmount.toString(),
        totalAmount: calculationDetails.totalAmount.toString()
      },
      createdAt: now,
      updatedAt: now
    });

    // 5. Garantir que o usuário tem balance criado
    let userBalance = await this.userBalanceRepository.findByUserId(request.userId);
    if (!userBalance) {
      userBalance = new UserBalance({
        id: uuidv4(),
        userId: request.userId,
        availablePoints: new Decimal(0),
        pendingPoints: new Decimal(0),
        totalPoints: new Decimal(0),
        createdAt: now,
        updatedAt: now
      });
      await this.userBalanceRepository.save(userBalance);
    }

    // 6. Adicionar pontos pendentes
    const updatedBalance = userBalance.addPendingPoints(calculationDetails.pointsAmount);

    // 7. Salvar no banco de dados
    const savedOrder = await this.orderRepository.save(order);
    await this.pointsTransactionRepository.save(pointsTransaction);
    await this.userBalanceRepository.update(updatedBalance);

    // 8. Registrar histórico inicial
    const initialHistory = new OrderStatusHistory({
      id: uuidv4(),
      orderId: orderId,
      previousStatus: null,
      newStatus: OrderStatus.PENDING,
      changedBy: ChangedBy.SYSTEM,
      reason: 'Order created by user',
      metadata: {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        ...calculationDetails
      },
      createdAt: now
    });

    await this.orderStatusHistoryRepository.save(initialHistory);

    // 10. Integrar com AlfredPay se for PIX
    let alfredResponse = null;
    if (request.paymentMethod === PaymentMethod.PIX) {
      try {
        alfredResponse = await this.alfredPayService.createTransaction({
          amount: calculationDetails.totalAmount,
          amountType: 'BRL',
          cryptoType: 'DEPIX',
          cryptoAmount: calculationDetails.pointsAmount,
          paymentMethod: 'PIX',
          type: 'BUY',
          walletAddress: this.configService.get<string>('YUNY_INTERNAL_WALLET'), // Carteira interna do YunY
          network: 'onchain',
          externalId: orderId
        });

        // 11. Atualizar ordem com dados do Alfred
        const orderWithAlfredData = savedOrder.setAlfredData(
          alfredResponse.transactionId,
          alfredResponse.qrCopyPaste,
          alfredResponse.qrImageUrl
        );

        await this.orderRepository.update(orderWithAlfredData);

        // 12. Registrar histórico da integração com Alfred
        const alfredHistory = new OrderStatusHistory({
          id: uuidv4(),
          orderId: orderId,
          previousStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.PENDING,
          changedBy: ChangedBy.SYSTEM,
          reason: 'Alfred PIX transaction created successfully',
          metadata: {
            alfredTransactionId: alfredResponse.transactionId,
            qrCode: alfredResponse.qrCopyPaste,
            qrImageUrl: alfredResponse.qrImageUrl,
            expiresAt: orderWithAlfredData.expiresAt
          },
          createdAt: new Date()
        });

        await this.orderStatusHistoryRepository.save(alfredHistory);

        return {
          orderId: savedOrder.id,
          userId: savedOrder.userId,
          requestedAmount: savedOrder.requestedAmount,
          feeAmount: savedOrder.feeAmount,
          totalAmount: savedOrder.totalAmount,
          pointsAmount: savedOrder.pointsAmount,
          qrCode: alfredResponse.qrCopyPaste,
          qrImageUrl: alfredResponse.qrImageUrl,
          expiresAt: orderWithAlfredData.expiresAt,
          alfredTransactionId: alfredResponse.transactionId
        };

      } catch (error) {
        // Se falhar a integração com Alfred, registrar no histórico
        const errorHistory = new OrderStatusHistory({
          id: uuidv4(),
          orderId: orderId,
          previousStatus: OrderStatus.PENDING,
          newStatus: OrderStatus.FAILED,
          changedBy: ChangedBy.SYSTEM,
          reason: 'Failed to create Alfred PIX transaction',
          metadata: {
            error: error.message
          },
          createdAt: new Date()
        });

        await this.orderStatusHistoryRepository.save(errorHistory);

        // Atualizar status da ordem para FAILED
        const failedOrder = savedOrder.updateStatus(OrderStatus.FAILED, {
          failureReason: 'Alfred integration failure',
          error: error.message
        });

        await this.orderRepository.update(failedOrder);

        throw new Error(`Failed to create PIX transaction: ${error.message}`);
      }
    }

    return {
      orderId: savedOrder.id,
      userId: savedOrder.userId,
      requestedAmount: savedOrder.requestedAmount,
      feeAmount: savedOrder.feeAmount,
      totalAmount: savedOrder.totalAmount,
      pointsAmount: savedOrder.pointsAmount,
      qrCode: savedOrder.qrCode,
      qrImageUrl: savedOrder.qrImageUrl,
      expiresAt: savedOrder.expiresAt,
      alfredTransactionId: savedOrder.alfredTransactionId
    };
  }
}