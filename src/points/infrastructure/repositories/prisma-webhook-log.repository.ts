import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IWebhookLogRepository } from '../../domain/repositories';
import { WebhookLog } from '../../domain/entities';

@Injectable()
export class PrismaWebhookLogRepository implements IWebhookLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<WebhookLog | null> {
    const webhookLog = await this.prisma.webhookLog.findUnique({
      where: { id }
    });

    if (!webhookLog) return null;
    return this.toDomainEntity(webhookLog);
  }

  async findByTransactionId(transactionId: string): Promise<WebhookLog[]> {
    const webhookLogs = await this.prisma.webhookLog.findMany({
      where: { transaction_id: transactionId },
      orderBy: { created_at: 'desc' }
    });

    return webhookLogs.map(log => this.toDomainEntity(log));
  }

  async findByWebhookId(webhookId: string): Promise<WebhookLog | null> {
    const webhookLog = await this.prisma.webhookLog.findFirst({
      where: { webhook_id: webhookId }
    });

    if (!webhookLog) return null;
    return this.toDomainEntity(webhookLog);
  }

  async findByExternalId(externalId: string): Promise<WebhookLog[]> {
    const webhookLogs = await this.prisma.webhookLog.findMany({
      where: { external_id: externalId },
      orderBy: { created_at: 'desc' }
    });

    return webhookLogs.map(log => this.toDomainEntity(log));
  }

  async findLastValidWebhookByTransactionId(transactionId: string): Promise<WebhookLog | null> {
    const webhookLog = await this.prisma.webhookLog.findFirst({
      where: {
        transaction_id: transactionId,
        is_valid: true
      },
      orderBy: { processed_at: 'desc' }
    });

    if (!webhookLog) return null;
    return this.toDomainEntity(webhookLog);
  }

  async findLastValidWebhookByExternalId(externalId: string): Promise<WebhookLog | null> {
    const webhookLog = await this.prisma.webhookLog.findFirst({
      where: {
        external_id: externalId,
        is_valid: true
      },
      orderBy: { processed_at: 'desc' }
    });

    if (!webhookLog) return null;
    return this.toDomainEntity(webhookLog);
  }

  async isWebhookAlreadyProcessed(transactionId: string, webhookId?: string): Promise<boolean> {
    const where: any = { transaction_id: transactionId, is_valid: true };
    
    if (webhookId) {
      where.webhook_id = webhookId;
    }

    const count = await this.prisma.webhookLog.count({ where });
    return count > 0;
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<WebhookLog[]> {
    const webhookLogs = await this.prisma.webhookLog.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return webhookLogs.map(log => this.toDomainEntity(log));
  }

  async findFailedWebhooks(limit: number = 100): Promise<WebhookLog[]> {
    const webhookLogs = await this.prisma.webhookLog.findMany({
      where: {
        OR: [
          { is_valid: false },
          { error_message: { not: null } }
        ]
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    return webhookLogs.map(log => this.toDomainEntity(log));
  }

  async findRecentWebhooks(hoursAgo: number, limit: number = 100): Promise<WebhookLog[]> {
    const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    const webhookLogs = await this.prisma.webhookLog.findMany({
      where: {
        created_at: { gte: cutoffDate }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    return webhookLogs.map(log => this.toDomainEntity(log));
  }

  async save(webhookLog: WebhookLog): Promise<WebhookLog> {
    const data = {
      id: webhookLog.id,
      webhook_id: webhookLog.webhookId,
      transaction_id: webhookLog.transactionId,
      external_id: webhookLog.externalId,
      status: webhookLog.status,
      previous_status: webhookLog.previousStatus,
      payload: webhookLog.payload,
      signature: webhookLog.signature,
      processed_at: webhookLog.processedAt,
      is_valid: webhookLog.isValid,
      error_message: webhookLog.errorMessage,
      processing_time_ms: webhookLog.processingTimeMs,
      created_at: webhookLog.createdAt
    };

    const created = await this.prisma.webhookLog.create({ data });
    return this.toDomainEntity(created);
  }

  async update(webhookLog: WebhookLog): Promise<WebhookLog> {
    const data = {
      webhook_id: webhookLog.webhookId,
      transaction_id: webhookLog.transactionId,
      external_id: webhookLog.externalId,
      status: webhookLog.status,
      previous_status: webhookLog.previousStatus,
      payload: webhookLog.payload,
      signature: webhookLog.signature,
      processed_at: webhookLog.processedAt,
      is_valid: webhookLog.isValid,
      error_message: webhookLog.errorMessage,
      processing_time_ms: webhookLog.processingTimeMs
    };

    const updated = await this.prisma.webhookLog.update({
      where: { id: webhookLog.id },
      data
    });

    return this.toDomainEntity(updated);
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.webhookLog.deleteMany({
      where: {
        created_at: { lt: cutoffDate }
      }
    });

    return result.count;
  }

  async countByStatus(status: string, startDate?: Date, endDate?: Date): Promise<number> {
    const where: any = { status };

    if (startDate && endDate) {
      where.created_at = {
        gte: startDate,
        lte: endDate
      };
    }

    return await this.prisma.webhookLog.count({ where });
  }

  async getValidationStats(startDate?: Date, endDate?: Date): Promise<{
    valid: number;
    invalid: number;
    total: number;
  }> {
    const where: any = {};

    if (startDate && endDate) {
      where.created_at = {
        gte: startDate,
        lte: endDate
      };
    }

    const [valid, invalid, total] = await Promise.all([
      this.prisma.webhookLog.count({ where: { ...where, is_valid: true } }),
      this.prisma.webhookLog.count({ where: { ...where, is_valid: false } }),
      this.prisma.webhookLog.count({ where })
    ]);

    return { valid, invalid, total };
  }

  private toDomainEntity(prismaWebhookLog: any): WebhookLog {
    return new WebhookLog({
      id: prismaWebhookLog.id,
      webhookId: prismaWebhookLog.webhook_id,
      transactionId: prismaWebhookLog.transaction_id,
      externalId: prismaWebhookLog.external_id,
      status: prismaWebhookLog.status,
      previousStatus: prismaWebhookLog.previous_status,
      payload: prismaWebhookLog.payload,
      signature: prismaWebhookLog.signature,
      processedAt: prismaWebhookLog.processed_at,
      isValid: prismaWebhookLog.is_valid,
      errorMessage: prismaWebhookLog.error_message,
      processingTimeMs: prismaWebhookLog.processing_time_ms,
      createdAt: prismaWebhookLog.created_at
    });
  }
}