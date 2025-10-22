import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import {
  IOrderRepository,
  IOrderStatusHistoryRepository,
  IWebhookLogRepository
} from '../../domain/repositories';
import {
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
  WEBHOOK_LOG_REPOSITORY,
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
    @Inject(WEBHOOK_LOG_REPOSITORY) private readonly webhookLogRepository: IWebhookLogRepository,
    @Inject(ALFRED_PAY_SERVICE) private readonly alfredPayService: IAlfredPayService,
    private readonly configService: ConfigService
  ) {}

  async execute(request: CheckOrderStatusRequest): Promise<CheckOrderStatusResponse> {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('[CheckOrderStatus] 🔍 CHECKING ORDER STATUS');
    console.log('═══════════════════════════════════════════════════════════');
    
    // 1. Buscar ordem
    const order = await this.orderRepository.findById(request.orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    console.log('Order found:', {
      ourOrderId: order.id,
      alfredTransactionId: order.alfredTransactionId,
      alfredProviderId: order.alfredProviderId,
      currentStatus: order.status,
      createdAt: order.createdAt
    });

    let statusChanged = false;
    let updatedOrder = order;
    const currentStatus = order.status;

    // 2. Verificar se webhook recente foi processado (fallback logic)
    const webhookFallbackEnabled = this.configService.get<boolean>('WEBHOOK_FALLBACK_ENABLED', true);
    
    if (webhookFallbackEnabled && order.alfredTransactionId) {
      const recentWebhook = await this.webhookLogRepository.findLastValidWebhookByExternalId(order.id);
      
      if (recentWebhook && recentWebhook.isProcessedRecently(5)) { // 5 minutos
        console.info('[CheckOrderStatus] Skipping polling - recent webhook found', {
          orderId: order.id,
          webhookProcessedAt: recentWebhook.processedAt,
          webhookStatus: recentWebhook.status
        });
        
        return {
          orderId: order.id,
          currentStatus: order.status,
          status: order.status,
          alfredTransactionId: order.alfredTransactionId,
          statusChanged: false,
          pointsAmount: order.pointsAmount,
          requestedAmount: order.requestedAmount,
          totalAmount: order.totalAmount,
          updatedAt: order.updatedAt,
          lastWebhookAt: recentWebhook.processedAt
        };
      }
    }

    // 3. Se a ordem tem transação no Alfred, consultar status
    if (order.alfredTransactionId) {
      try {
        console.log('[CheckOrderStatus] Querying AlfredPay transaction status:', {
          orderId: order.id,
          alfredTransactionId: order.alfredTransactionId,
          alfredProviderId: order.alfredProviderId,
          note: 'Using alfredTransactionId (from AlfredPay) to query status'
        });

        const alfredStatus = await this.alfredPayService.getTransactionStatus(order.alfredTransactionId);
        
        console.log('[CheckOrderStatus] AlfredPay status received:', {
          orderId: order.id,
          alfredTransactionId: order.alfredTransactionId,
          status: alfredStatus.status,
          currentOrderStatus: order.status,
          willUpdate: alfredStatus.status !== order.status
        });

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
        // 7. Tratar erro "Transaction not found" de forma especial
        const isTransactionNotFound = error.message?.includes('Transaction not found') || 
                                      error.message?.includes('not found') ||
                                      error.status === 404;

        if (isTransactionNotFound) {
          // Se a transação não foi encontrada no AlfredPay, pode ser um problema de sincronização
          // Não registrar no histórico repetidamente para evitar spam de logs
          const recentErrorCheck = await this.orderStatusHistoryRepository.findRecentByOrderId(order.id, 1);
          const hasRecentNotFoundError = recentErrorCheck.some(
            h => typeof h.metadata?.error === 'string' && h.metadata.error.includes('Transaction not found') && 
            ((new Date().getTime() - h.createdAt.getTime()) < 60000) // menos de 1 minuto atrás
          );

          if (!hasRecentNotFoundError) {
            console.warn(`[CheckOrderStatus] ⚠️  AlfredPay transaction NOT FOUND`);
            console.warn({
              orderId: order.id,
              alfredTransactionId: order.alfredTransactionId,
              alfredProviderId: order.alfredProviderId,
              orderCreatedAt: order.createdAt,
              secondsSinceCreation: Math.floor((Date.now() - order.createdAt.getTime()) / 1000),
              note: 'Transaction not found in AlfredPay. Possible reasons:',
              reasons: [
                '1. AlfredPay needs more time to register (wait 10+ seconds)',
                '2. Transaction was not created successfully',
                '3. Wrong API key or environment (sandbox vs production)',
                '4. TransactionId mismatch or corruption'
              ]
            });
            
            const errorHistory = new OrderStatusHistory({
              id: uuidv4(),
              orderId: order.id,
              previousStatus: currentStatus,
              newStatus: currentStatus,
              changedBy: ChangedBy.POLLING_SERVICE,
              reason: 'Alfred transaction not found (may need time to sync)',
              metadata: {
                error: 'Transaction not found in AlfredPay',
                alfredTransactionId: order.alfredTransactionId,
                attemptedAt: new Date().toISOString(),
                note: 'AlfredPay may need a few seconds to register the transaction'
              },
              createdAt: new Date()
            });

            await this.orderStatusHistoryRepository.save(errorHistory);
          }
        } else {
          // Outros erros (timeout, conexão, etc)
          const errorHistory = new OrderStatusHistory({
            id: uuidv4(),
            orderId: order.id,
            previousStatus: currentStatus,
            newStatus: currentStatus,
            changedBy: ChangedBy.POLLING_SERVICE,
            reason: 'Failed to check Alfred transaction status',
            metadata: {
              error: error.message,
              errorStatus: error.status,
              alfredTransactionId: order.alfredTransactionId,
              attemptedAt: new Date().toISOString()
            },
            createdAt: new Date()
          });

          await this.orderStatusHistoryRepository.save(errorHistory);
          console.error(`[CheckOrderStatus] Error checking Alfred status for order ${order.id}:`, error.message);
        }
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

    console.log('[CheckOrderStatus] ✅ Status check completed');
    console.log({
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      statusChanged,
      alfredTransactionId: updatedOrder.alfredTransactionId
    });
    console.log('═══════════════════════════════════════════════════════════');

    return {
      orderId: updatedOrder.id,
      currentStatus: updatedOrder.status,
      status: updatedOrder.status,
      statusChanged,
      alfredTransactionId: updatedOrder.alfredTransactionId,
      pointsAmount: updatedOrder.pointsAmount,
      requestedAmount: updatedOrder.requestedAmount,
      totalAmount: updatedOrder.totalAmount,
      updatedAt: updatedOrder.updatedAt
    };
  }

  private mapAlfredStatusToOrderStatus(alfredStatus: string): OrderStatus {
    // AlfredPay retorna status em lowercase
    const status = alfredStatus.toLowerCase();
    
    switch (status) {
      case 'pending':
        return OrderStatus.PENDING;
      case 'awaiting_confirmation':
        return OrderStatus.PROCESSING;
      case 'paid':
      case 'complete':
        return OrderStatus.COMPLETED;
      case 'review':
        return OrderStatus.PROCESSING;
      case 'expired':
        return OrderStatus.EXPIRED;
      case 'refunded':
      case 'canceled':
        return OrderStatus.CANCELLED;
      default:
        console.warn(`[CheckOrderStatus] Unknown AlfredPay status: ${alfredStatus}`);
        return OrderStatus.PENDING; // Default para status desconhecidos
    }
  }
}