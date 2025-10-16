import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import {
  IOrderRepository,
  IPointsTransactionRepository,
  IOrderStatusHistoryRepository,
  IUserBalanceRepository
} from '../../domain/repositories';
import {
  ORDER_REPOSITORY,
  POINTS_TRANSACTION_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
  USER_BALANCE_REPOSITORY
} from '../../points.tokens';
import { OrderStatusHistory } from '../../domain/entities';
import { OrderStatus, PointsTransactionType, ChangedBy } from '../../domain/enums';
import { CreditPointsRequest, CreditPointsResponse } from '../dto';

@Injectable()
export class CreditPointsUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(POINTS_TRANSACTION_REPOSITORY) private readonly pointsTransactionRepository: IPointsTransactionRepository,
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY) private readonly orderStatusHistoryRepository: IOrderStatusHistoryRepository,
    @Inject(USER_BALANCE_REPOSITORY) private readonly userBalanceRepository: IUserBalanceRepository
  ) {}

  async execute(request: CreditPointsRequest): Promise<CreditPointsResponse> {
    // 1. Buscar ordem
    const order = await this.orderRepository.findById(request.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // 2. Validar se a ordem pode ser completada
    if (!order.canBeCompleted()) {
      throw new Error(`Order cannot be completed. Current status: ${order.status}`);
    }

    // 3. Validar transação do Alfred se fornecida
    if (request.alfredTransactionId && order.alfredTransactionId !== request.alfredTransactionId) {
      throw new Error('Alfred transaction ID mismatch');
    }

    // 4. Buscar transação de pontos relacionada à ordem
    const pointsTransactions = await this.pointsTransactionRepository.findByOrderId(order.id);
    const pendingTransaction = pointsTransactions.find(t => t.isPending());
    
    if (!pendingTransaction) {
      throw new Error('No pending points transaction found for this order');
    }

    // 5. Buscar saldo do usuário
    const userBalance = await this.userBalanceRepository.findByUserId(order.userId);
    if (!userBalance) {
      throw new Error('User balance not found');
    }

    // 6. Converter pontos pendentes para disponíveis (operação thread-safe)
    try {
      const updatedBalance = await this.userBalanceRepository.convertPendingToAvailable(
        order.userId,
        order.pointsAmount
      );

      // 7. Atualizar transação de pontos para CREDIT
      const creditedTransaction = pendingTransaction.updateType(PointsTransactionType.CREDIT, {
        creditedAt: new Date().toISOString(),
        alfredTransactionId: request.alfredTransactionId,
        orderId: order.id,
        ...request.metadata
      });

      await this.pointsTransactionRepository.update(creditedTransaction);

      // 8. Atualizar status da ordem para COMPLETED
      const completedOrder = order.updateStatus(OrderStatus.COMPLETED, {
        completedAt: new Date().toISOString(),
        alfredTransactionId: request.alfredTransactionId,
        pointsCredited: order.pointsAmount.toString(),
        transactionId: creditedTransaction.id,
        ...request.metadata
      });

      await this.orderRepository.update(completedOrder);

      // 9. Registrar histórico da conclusão
      const completionHistory = new OrderStatusHistory({
        id: uuidv4(),
        orderId: order.id,
        previousStatus: order.status,
        newStatus: OrderStatus.COMPLETED,
        changedBy: ChangedBy.SYSTEM,
        reason: 'Points credited successfully after payment confirmation',
        metadata: {
          pointsAmount: order.pointsAmount.toString(),
          transactionId: creditedTransaction.id,
          alfredTransactionId: request.alfredTransactionId,
          previousAvailableBalance: userBalance.availablePoints.toString(),
          newAvailableBalance: updatedBalance.availablePoints.toString(),
          previousPendingBalance: userBalance.pendingPoints.toString(),
          newPendingBalance: updatedBalance.pendingPoints.toString(),
          creditedAt: new Date().toISOString(),
          ...request.metadata
        },
        createdAt: new Date()
      });

      await this.orderStatusHistoryRepository.save(completionHistory);

      return {
        success: true,
        userId: order.userId,
        pointsAmount: order.pointsAmount,
        newAvailableBalance: updatedBalance.availablePoints,
        transactionId: creditedTransaction.id
      };

    } catch (error) {
      // 10. Registrar falha no histórico
      const failureHistory = new OrderStatusHistory({
        id: uuidv4(),
        orderId: order.id,
        previousStatus: order.status,
        newStatus: OrderStatus.FAILED,
        changedBy: ChangedBy.SYSTEM,
        reason: 'Failed to credit points',
        metadata: {
          error: error.message,
          alfredTransactionId: request.alfredTransactionId,
          failedAt: new Date().toISOString(),
          ...request.metadata
        },
        createdAt: new Date()
      });

      await this.orderStatusHistoryRepository.save(failureHistory);

      // Atualizar ordem para FAILED
      const failedOrder = order.updateStatus(OrderStatus.FAILED, {
        failedAt: new Date().toISOString(),
        failureReason: 'Credit points operation failed',
        error: error.message
      });

      await this.orderRepository.update(failedOrder);

      throw new Error(`Failed to credit points: ${error.message}`);
    }
  }
}