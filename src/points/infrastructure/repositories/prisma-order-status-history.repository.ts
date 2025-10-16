import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IOrderStatusHistoryRepository } from '../../domain/repositories';
import { OrderStatusHistory } from '../../domain/entities';
import { OrderStatus, ChangedBy } from '../../domain/enums';

@Injectable()
export class PrismaOrderStatusHistoryRepository implements IOrderStatusHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<OrderStatusHistory | null> {
    const history = await this.prisma.orderStatusHistory.findUnique({
      where: { id }
    });

    if (!history) {
      return null;
    }

    return this.toDomainEntity(history);
  }

  async findByOrderId(orderId: string): Promise<OrderStatusHistory[]> {
    const histories = await this.prisma.orderStatusHistory.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'asc' }
    });

    return histories.map(history => this.toDomainEntity(history));
  }

  async findByUserId(userId: string): Promise<OrderStatusHistory[]> {
    // Precisa fazer join com a tabela de orders para buscar por userId
    const histories = await this.prisma.orderStatusHistory.findMany({
      where: {
        order: {
          user_id: userId
        }
      },
      include: {
        order: true
      },
      orderBy: { created_at: 'desc' }
    });

    return histories.map(history => this.toDomainEntity(history));
  }

  async findByStatus(status: OrderStatus): Promise<OrderStatusHistory[]> {
    const histories = await this.prisma.orderStatusHistory.findMany({
      where: { new_status: status },
      orderBy: { created_at: 'desc' }
    });

    return histories.map(history => this.toDomainEntity(history));
  }

  async findByChangedBy(changedBy: ChangedBy): Promise<OrderStatusHistory[]> {
    const histories = await this.prisma.orderStatusHistory.findMany({
      where: { changed_by: changedBy },
      orderBy: { created_at: 'desc' }
    });

    return histories.map(history => this.toDomainEntity(history));
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<OrderStatusHistory[]> {
    const histories = await this.prisma.orderStatusHistory.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return histories.map(history => this.toDomainEntity(history));
  }

  async findByOrderIdAndDateRange(
    orderId: string,
    startDate: Date,
    endDate: Date
  ): Promise<OrderStatusHistory[]> {
    const histories = await this.prisma.orderStatusHistory.findMany({
      where: {
        order_id: orderId,
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { created_at: 'asc' }
    });

    return histories.map(history => this.toDomainEntity(history));
  }

  async save(history: OrderStatusHistory): Promise<OrderStatusHistory> {
    const created = await this.prisma.orderStatusHistory.create({
      data: {
        id: history.id,
        order_id: history.orderId,
        previous_status: history.previousStatus,
        new_status: history.newStatus,
        changed_by: history.changedBy,
        reason: history.reason,
        metadata: history.metadata as any,
        created_at: history.createdAt
      }
    });

    return this.toDomainEntity(created);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.orderStatusHistory.delete({
      where: { id }
    });
  }

  private toDomainEntity(prismaHistory: any): OrderStatusHistory {
    return new OrderStatusHistory({
      id: prismaHistory.id,
      orderId: prismaHistory.order_id,
      previousStatus: prismaHistory.previous_status as OrderStatus | null,
      newStatus: prismaHistory.new_status as OrderStatus,
      changedBy: prismaHistory.changed_by as ChangedBy,
      reason: prismaHistory.reason,
      metadata: prismaHistory.metadata || {},
      createdAt: prismaHistory.created_at
    });
  }
}