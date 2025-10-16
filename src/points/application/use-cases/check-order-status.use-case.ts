import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import {
  IOrderRepository,
  IOrderStatusHistoryRepository
} from '../../domain/repositories';
import {
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
  ALFRED_PAY_SERVICE
} from '../../points.tokens';
import { OrderStatusHistory } from '../../domain/entities';
import { OrderStatus, ChangedBy } from '../../domain/enums';
import { IAlfredPayService } from '../../infrastructure/services/alfred-pay-service.interface';
import { CheckOrderStatusRequest, CheckOrderStatusResponse } from '../dto';

@Injectable()
export class CheckOrderStatusUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY) private readonly orderStatusHistoryRepository: IOrderStatusHistoryRepository,
    @Inject(ALFRED_PAY_SERVICE) private readonly alfredPayService: IAlfredPayService
  ) {}

  async execute(request: CheckOrderStatusRequest): Promise<CheckOrderStatusResponse> {
    // 1. Buscar ordem
    const order = await this.orderRepository.findById(request.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    let statusChanged = false;
    let updatedOrder = order;
    const currentStatus = order.status;

    // 2. Se a ordem tem transação no Alfred, consultar status
    if (order.alfredTransactionId) {
      try {
        const alfredStatus = await this.alfredPayService.getTransactionStatus(order.alfredTransactionId);
        
        // 3. Mapear status do Alfred para status interno
        const mappedStatus = this.mapAlfredStatusToOrderStatus(alfredStatus.status);
        
        // 4. Se status mudou, atualizar ordem e registrar histórico
        if (mappedStatus !== order.status) {
          statusChanged = true;
          
          updatedOrder = order.updateStatus(mappedStatus, {
            alfredStatus: alfredStatus.status,
            alfredUpdatedAt: alfredStatus.updatedAt,
            txid: alfredStatus.txid,
            lastCheckedAt: new Date().toISOString()
          });

          // 5. Salvar ordem atualizada
          await this.orderRepository.update(updatedOrder);

          // 6. Registrar histórico da mudança
          const statusHistory = new OrderStatusHistory({
            id: uuidv4(),
            orderId: order.id,
            previousStatus: currentStatus,
            newStatus: mappedStatus,
            changedBy: ChangedBy.POLLING_SERVICE,
            reason: `Status updated from Alfred: ${alfredStatus.status}`,
            metadata: {
              alfredTransactionId: order.alfredTransactionId,
              alfredStatus: alfredStatus.status,
              alfredUpdatedAt: alfredStatus.updatedAt,
              txid: alfredStatus.txid,
              cryptoAmount: alfredStatus.cryptoAmount,
              cryptoType: alfredStatus.cryptoType,
              network: alfredStatus.network
            },
            createdAt: new Date()
          });

          await this.orderStatusHistoryRepository.save(statusHistory);
        }

      } catch (error) {
        // 7. Registrar erro de consulta no histórico
        const errorHistory = new OrderStatusHistory({
          id: uuidv4(),
          orderId: order.id,
          previousStatus: currentStatus,
          newStatus: currentStatus, // Mantém o status atual
          changedBy: ChangedBy.POLLING_SERVICE,
          reason: 'Failed to check Alfred transaction status',
          metadata: {
            error: error.message,
            alfredTransactionId: order.alfredTransactionId,
            attemptedAt: new Date().toISOString()
          },
          createdAt: new Date()
        });

        await this.orderStatusHistoryRepository.save(errorHistory);

        // Não falha o caso de uso, apenas registra o erro
        console.error(`Failed to check Alfred status for order ${order.id}:`, error.message);
      }
    }

    // 8. Verificar se a ordem expirou
    if (updatedOrder.status === OrderStatus.PENDING && updatedOrder.isExpired()) {
      statusChanged = true;
      
      updatedOrder = updatedOrder.updateStatus(OrderStatus.EXPIRED, {
        expiredAt: new Date().toISOString(),
        reason: 'Order expired after 20 minutes'
      });

      await this.orderRepository.update(updatedOrder);

      // Registrar expiração no histórico
      const expiredHistory = new OrderStatusHistory({
        id: uuidv4(),
        orderId: order.id,
        previousStatus: currentStatus,
        newStatus: OrderStatus.EXPIRED,
        changedBy: ChangedBy.SYSTEM,
        reason: 'Order expired - 20 minutes timeout reached',
        metadata: {
          expiresAt: order.expiresAt?.toISOString(),
          expiredAt: new Date().toISOString()
        },
        createdAt: new Date()
      });

      await this.orderStatusHistoryRepository.save(expiredHistory);
    }

    return {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      statusChanged,
      alfredTransactionId: updatedOrder.alfredTransactionId,
      pointsAmount: updatedOrder.pointsAmount,
      requestedAmount: updatedOrder.requestedAmount,
      totalAmount: updatedOrder.totalAmount
    };
  }

  private mapAlfredStatusToOrderStatus(alfredStatus: string): OrderStatus {
    switch (alfredStatus) {
      case 'PENDING':
        return OrderStatus.PENDING;
      case 'PROCESSING':
        return OrderStatus.PROCESSING;
      case 'COMPLETED':
        return OrderStatus.COMPLETED;
      case 'FAILED':
        return OrderStatus.FAILED;
      case 'CANCELLED':
        return OrderStatus.CANCELLED;
      case 'EXPIRED':
        return OrderStatus.EXPIRED;
      default:
        return OrderStatus.PENDING; // Default para status desconhecidos
    }
  }
}