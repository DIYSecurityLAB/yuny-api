import { WebhookLog } from '../entities';

export interface IWebhookLogRepository {
  /**
   * Busca log de webhook por ID
   */
  findById(id: string): Promise<WebhookLog | null>;

  /**
   * Busca logs por transactionId
   */
  findByTransactionId(transactionId: string): Promise<WebhookLog[]>;

  /**
   * Busca log por webhookId específico
   */
  findByWebhookId(webhookId: string): Promise<WebhookLog | null>;

  /**
   * Busca logs por externalId (orderId)
   */
  findByExternalId(externalId: string): Promise<WebhookLog[]>;

  /**
   * Busca último webhook válido processado para uma transação
   */
  findLastValidWebhookByTransactionId(transactionId: string): Promise<WebhookLog | null>;

  /**
   * Busca último webhook válido processado para uma ordem externa
   */
  findLastValidWebhookByExternalId(externalId: string): Promise<WebhookLog | null>;

  /**
   * Verifica se um webhook já foi processado
   */
  isWebhookAlreadyProcessed(transactionId: string, webhookId?: string): Promise<boolean>;

  /**
   * Busca logs por período de tempo
   */
  findByDateRange(startDate: Date, endDate: Date): Promise<WebhookLog[]>;

  /**
   * Busca logs com erro para debugging
   */
  findFailedWebhooks(limit?: number): Promise<WebhookLog[]>;

  /**
   * Busca logs recentes (últimas N horas)
   */
  findRecentWebhooks(hoursAgo: number, limit?: number): Promise<WebhookLog[]>;

  /**
   * Salva um novo log de webhook
   */
  save(webhookLog: WebhookLog): Promise<WebhookLog>;

  /**
   * Atualiza um log existente
   */
  update(webhookLog: WebhookLog): Promise<WebhookLog>;

  /**
   * Remove logs antigos (limpeza de dados)
   */
  deleteOlderThan(days: number): Promise<number>;

  /**
   * Conta webhooks por status
   */
  countByStatus(status: string, startDate?: Date, endDate?: Date): Promise<number>;

  /**
   * Conta webhooks válidos vs inválidos
   */
  getValidationStats(startDate?: Date, endDate?: Date): Promise<{
    valid: number;
    invalid: number;
    total: number;
  }>;
}