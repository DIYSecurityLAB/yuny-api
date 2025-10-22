import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  IOrderRepository, 
  IPointsTransactionRepository,
  IOrderStatusHistoryRepository,
  IWebhookLogRepository
} from '../../domain/repositories';
import {
  ORDER_REPOSITORY,
  POINTS_TRANSACTION_REPOSITORY, 
  ORDER_STATUS_HISTORY_REPOSITORY,
  WEBHOOK_LOG_REPOSITORY
} from '../../points.tokens';
import { OrderStatus, PointsTransactionType, ChangedBy } from '../../domain/enums';
import { OrderStatusHistory, WebhookLog } from '../../domain/entities';
import { CreditPointsUseCase } from './credit-points.use-case';
import { ValidateWebhookSignatureUseCase } from './validate-webhook-signature.use-case';
import { AlfredWebhookDto, ProcessWebhookResponse } from '../../presentation/dto/webhook.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProcessAlfredWebhookUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(POINTS_TRANSACTION_REPOSITORY) private readonly pointsTransactionRepository: IPointsTransactionRepository,
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY) private readonly orderStatusHistoryRepository: IOrderStatusHistoryRepository,
    @Inject(WEBHOOK_LOG_REPOSITORY) private readonly webhookLogRepository: IWebhookLogRepository,
    private readonly creditPointsUseCase: CreditPointsUseCase,
    private readonly validateSignatureUseCase: ValidateWebhookSignatureUseCase,
    private readonly configService: ConfigService
  ) {}

  async execute(
    webhookData: AlfredWebhookDto, 
    rawBody: string, 
    headers: Record<string, string> = {}
  ): Promise<ProcessWebhookResponse> {
    const startTime = Date.now();
    let webhookLogId: string | undefined;

    try {
      console.info('[ProcessAlfredWebhook] Starting webhook processing', {
        transactionId: webhookData.transactionId,
        externalId: webhookData.externalId,
        status: webhookData.status,
        webhookId: webhookData.webhookId
      });

      // 1. Validar se webhooks estão habilitados
      const webhooksEnabled = this.configService.get<boolean>('WEBHOOK_ENABLED', true);
      if (!webhooksEnabled) {
        console.warn('[ProcessAlfredWebhook] Webhooks disabled by configuration');
        return {
          success: false,
          message: 'Webhooks are disabled',
          processed: false
        };
      }

      // 2. Verificar idempotência ANTES da validação (performance)
      const alreadyProcessed = await this.checkIdempotency(webhookData);
      if (alreadyProcessed) {
        console.info('[ProcessAlfredWebhook] Webhook already processed', {
          transactionId: webhookData.transactionId,
          webhookId: webhookData.webhookId
        });

        return {
          success: true,
          message: 'Webhook already processed',
          orderId: webhookData.externalId,
          processed: false,
          processingTimeMs: Date.now() - startTime
        };
      }

      // 3. Validar assinatura do webhook
      const signatureValidation = this.validateSignatureUseCase.execute({
        rawBody,
        signature: webhookData.signature,
        headers
      });

      // 4. Criar log do webhook (sempre, mesmo se inválido)
      const webhookLog = signatureValidation.isValid
        ? WebhookLog.createValid(
            webhookData.transactionId,
            webhookData.externalId,
            webhookData.status,
            { ...webhookData, headers },
            webhookData.signature,
            {
              webhookId: webhookData.webhookId,
              previousStatus: webhookData.previousStatus
            }
          )
        : WebhookLog.createInvalid(
            webhookData.transactionId,
            webhookData.externalId,
            webhookData.status,
            { ...webhookData, headers },
            webhookData.signature,
            signatureValidation.reason || 'Invalid signature',
            {
              webhookId: webhookData.webhookId,
              previousStatus: webhookData.previousStatus
            }
          );

      const savedWebhookLog = await this.webhookLogRepository.save(webhookLog);
      webhookLogId = savedWebhookLog.id;

      // 5. Rejeitar se assinatura inválida
      if (!signatureValidation.isValid) {
        console.error('[ProcessAlfredWebhook] Invalid webhook signature', {
          transactionId: webhookData.transactionId,
          reason: signatureValidation.reason,
          webhookLogId
        });
        
        return {
          success: false,
          message: `Invalid signature: ${signatureValidation.reason}`,
          processed: false,
          processingTimeMs: Date.now() - startTime,
          webhookLogId
        };
      }

      // 6. Buscar ordem pelo externalId
      const order = await this.orderRepository.findById(webhookData.externalId);
      if (!order) {
        const errorMessage = 'Order not found';
        console.warn('[ProcessAlfredWebhook] Order not found', {
          externalId: webhookData.externalId,
          transactionId: webhookData.transactionId,
          webhookLogId
        });

        // Atualizar log com erro
        const updatedLog = savedWebhookLog.markAsInvalid(errorMessage);
        await this.webhookLogRepository.update(updatedLog);
        
        return {
          success: false,
          message: errorMessage,
          processed: false,
          processingTimeMs: Date.now() - startTime,
          webhookLogId
        };
      }

      // 7. Verificar consistência alfredTransactionId
      if (order.alfredTransactionId !== webhookData.transactionId) {
        const errorMessage = 'Transaction ID mismatch';
        console.error('[ProcessAlfredWebhook] Transaction ID mismatch', {
          orderAlfredId: order.alfredTransactionId,
          webhookTransactionId: webhookData.transactionId,
          orderId: order.id,
          webhookLogId
        });

        // Atualizar log com erro
        const updatedLog = savedWebhookLog.markAsInvalid(errorMessage);
        await this.webhookLogRepository.update(updatedLog);
        
        return {
          success: false,
          message: errorMessage,
          processed: false,
          processingTimeMs: Date.now() - startTime,
          webhookLogId
        };
      }

      // 8. Mapear status do Alfred para nosso enum
      const newStatus = this.mapAlfredStatusToOrderStatus(webhookData.status);
      
      // 9. Verificar se status realmente mudou
      if (order.status === newStatus) {
        console.info('[ProcessAlfredWebhook] Status unchanged', {
          orderId: order.id,
          currentStatus: order.status,
          webhookStatus: webhookData.status,
          webhookLogId
        });
        
        // Atualizar log com tempo de processamento
        const updatedLog = savedWebhookLog.setProcessingTime(Date.now() - startTime);
        await this.webhookLogRepository.update(updatedLog);
        
        return {
          success: true,
          message: 'Status unchanged - no processing needed',
          orderId: order.id,
          processed: false,
          processingTimeMs: Date.now() - startTime,
          webhookLogId
        };
      }

      // 10. Registrar mudança no histórico
      const previousStatus = order.status;
      const historyRecord = new OrderStatusHistory({
        id: uuidv4(),
        orderId: order.id,
        previousStatus: previousStatus,
        newStatus: newStatus,
        changedBy: ChangedBy.ALFRED_WEBHOOK,
        reason: `Webhook received: ${webhookData.status}${webhookData.previousStatus ? ` (from ${webhookData.previousStatus})` : ''}`,
        metadata: {
          alfredTransactionId: webhookData.transactionId,
          alfredStatus: webhookData.status,
          alfredPreviousStatus: webhookData.previousStatus,
          updatedAt: webhookData.updatedAt,
          txHash: webhookData.txHash,
          webhookId: webhookData.webhookId,
          webhookLogId: savedWebhookLog.id,
          webhookMetadata: webhookData.metadata,
          processingStartedAt: new Date(startTime).toISOString()
        },
        createdAt: new Date()
      });

      await this.orderStatusHistoryRepository.save(historyRecord);

      // 11. Processar baseado no novo status
      let processingResult = await this.processStatusChange(order.id, newStatus, webhookData);

      // 12. Atualizar log com resultado final
      const finalLog = savedWebhookLog.setProcessingTime(Date.now() - startTime);
      await this.webhookLogRepository.update(finalLog);

      console.info('[ProcessAlfredWebhook] Webhook processed successfully', {
        orderId: order.id,
        previousStatus,
        newStatus,
        alfredTransactionId: webhookData.transactionId,
        processingTimeMs: Date.now() - startTime,
        result: processingResult.success,
        webhookLogId
      });

      return {
        success: processingResult.success,
        message: processingResult.message,
        orderId: order.id,
        processed: true,
        processingTimeMs: Date.now() - startTime,
        webhookLogId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error('[ProcessAlfredWebhook] Unexpected error processing webhook', {
        transactionId: webhookData.transactionId,
        externalId: webhookData.externalId,
        error: error.message,
        stack: error.stack,
        processingTimeMs: processingTime,
        webhookLogId
      });

      // Tentar atualizar log com erro se possível
      if (webhookLogId) {
        try {
          const existingLog = await this.webhookLogRepository.findById(webhookLogId);
          if (existingLog) {
            const errorLog = existingLog
              .markAsInvalid(`Processing error: ${error.message}`)
              .setProcessingTime(processingTime);
            await this.webhookLogRepository.update(errorLog);
          }
        } catch (logError) {
          console.error('[ProcessAlfredWebhook] Failed to update error log', {
            logError: logError.message,
            originalError: error.message
          });
        }
      }

      return {
        success: false,
        message: `Processing error: ${error.message}`,
        processed: false,
        processingTimeMs: processingTime,
        webhookLogId
      };
    }
  }

  private async checkIdempotency(webhookData: AlfredWebhookDto): Promise<boolean> {
    // Verificar por webhookId se fornecido
    if (webhookData.webhookId) {
      const existing = await this.webhookLogRepository.findByWebhookId(webhookData.webhookId);
      if (existing) {
        return true;
      }
    }

    // Verificar por transactionId + status como fallback
    const recentWebhooks = await this.webhookLogRepository.findByTransactionId(webhookData.transactionId);
    
    return recentWebhooks.some(log => 
      log.status === webhookData.status && 
      log.isValid &&
      log.isProcessedRecently(60) // 60 minutos para ser considerado "recente"
    );
  }

  private async processStatusChange(
    orderId: string, 
    newStatus: OrderStatus, 
    webhookData: AlfredWebhookDto
  ): Promise<{ success: boolean; message: string }> {
    
    switch (newStatus) {
      case OrderStatus.COMPLETED:
        // Creditar pontos automaticamente
        try {
          await this.creditPointsUseCase.execute({
            orderId: orderId,
            alfredTransactionId: webhookData.transactionId,
            metadata: {
              txHash: webhookData.txHash,
              webhookId: webhookData.webhookId,
              processedAt: new Date().toISOString(),
              updatedAt: webhookData.updatedAt,
              source: 'alfred_webhook'
            }
          });
          
          return { 
            success: true, 
            message: 'Payment confirmed and points credited automatically' 
          };
        } catch (error) {
          console.error('[ProcessAlfredWebhook] Failed to credit points', {
            orderId,
            error: error.message
          });
          
          return { 
            success: false, 
            message: `Failed to credit points: ${error.message}` 
          };
        }

      case OrderStatus.FAILED:
      case OrderStatus.CANCELLED:
      case OrderStatus.EXPIRED:
        // Para status de falha, atualizar ordem e potencialmente reverter pontos pendentes
        try {
          const order = await this.orderRepository.findById(orderId);
          if (order) {
            const updatedOrder = order.updateStatus(newStatus, {
              reason: `Transaction ${webhookData.status.toLowerCase()} via AlfredPay webhook`,
              alfredStatus: webhookData.status,
              processedAt: new Date().toISOString(),
              webhookId: webhookData.webhookId,
              txHash: webhookData.txHash
            });
            
            await this.orderRepository.update(updatedOrder);
          }
          
          return { 
            success: true, 
            message: `Order status updated to ${newStatus.toLowerCase()}` 
          };
        } catch (error) {
          console.error('[ProcessAlfredWebhook] Failed to update order status', {
            orderId,
            newStatus,
            error: error.message
          });
          
          return { 
            success: false, 
            message: `Failed to update order: ${error.message}` 
          };
        }

      default:
        // Para outros status (PENDING, PROCESSING, etc.), apenas atualizar
        try {
          const order = await this.orderRepository.findById(orderId);
          if (order) {
            const updatedOrder = order.updateStatus(newStatus, {
              reason: `Status updated via AlfredPay webhook`,
              alfredStatus: webhookData.status,
              processedAt: new Date().toISOString(),
              webhookId: webhookData.webhookId
            });
            
            await this.orderRepository.update(updatedOrder);
          }
          
          return { 
            success: true, 
            message: `Status updated to ${newStatus}` 
          };
        } catch (error) {
          console.error('[ProcessAlfredWebhook] Failed to update order status', {
            orderId,
            newStatus,
            error: error.message
          });
          
          return { 
            success: false, 
            message: `Failed to update order: ${error.message}` 
          };
        }
    }
  }

  private mapAlfredStatusToOrderStatus(alfredStatus: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      'PENDING': OrderStatus.PENDING,
      'PROCESSING': OrderStatus.PENDING, // Mapear PROCESSING para PENDING
      'COMPLETED': OrderStatus.COMPLETED,
      'FAILED': OrderStatus.FAILED,
      'EXPIRED': OrderStatus.EXPIRED,
      'CANCELLED': OrderStatus.CANCELLED
    };

    const mapped = statusMap[alfredStatus];
    if (!mapped) {
      console.warn('[ProcessAlfredWebhook] Unknown Alfred status, defaulting to PENDING', {
        alfredStatus
      });
      return OrderStatus.PENDING;
    }

    return mapped;
  }
}