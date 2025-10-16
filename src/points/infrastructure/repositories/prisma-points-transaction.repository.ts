import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../../prisma/prisma.service';
import { IPointsTransactionRepository } from '../../domain/repositories';
import { PointsTransaction } from '../../domain/entities';
import { PointsTransactionType } from '../../domain/enums';

@Injectable()
export class PrismaPointsTransactionRepository implements IPointsTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PointsTransaction | null> {
    const transaction = await this.prisma.pointsTransaction.findUnique({
      where: { id }
    });

    if (!transaction) {
      return null;
    }

    return this.toDomainEntity(transaction);
  }

  async findByUserId(userId: string): Promise<PointsTransaction[]> {
    const transactions = await this.prisma.pointsTransaction.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });

    return transactions.map(transaction => this.toDomainEntity(transaction));
  }

  async findByOrderId(orderId: string): Promise<PointsTransaction[]> {
    const transactions = await this.prisma.pointsTransaction.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'desc' }
    });

    return transactions.map(transaction => this.toDomainEntity(transaction));
  }

  async findByType(type: PointsTransactionType): Promise<PointsTransaction[]> {
    const transactions = await this.prisma.pointsTransaction.findMany({
      where: { type },
      orderBy: { created_at: 'desc' }
    });

    return transactions.map(transaction => this.toDomainEntity(transaction));
  }

  async findByUserIdAndDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PointsTransaction[]> {
    const transactions = await this.prisma.pointsTransaction.findMany({
      where: {
        user_id: userId,
        created_at: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return transactions.map(transaction => this.toDomainEntity(transaction));
  }

  async save(transaction: PointsTransaction): Promise<PointsTransaction> {
    const created = await this.prisma.pointsTransaction.create({
      data: {
        id: transaction.id,
        user_id: transaction.userId,
        order_id: transaction.orderId,
        type: transaction.type,
        amount: transaction.amount.toNumber(),
        description: transaction.description,
        metadata: transaction.metadata as any,
        created_at: transaction.createdAt,
        updated_at: transaction.updatedAt
      }
    });

    return this.toDomainEntity(created);
  }

  async update(transaction: PointsTransaction): Promise<PointsTransaction> {
    const updated = await this.prisma.pointsTransaction.update({
      where: { id: transaction.id },
      data: {
        type: transaction.type,
        amount: transaction.amount.toNumber(),
        description: transaction.description,
        metadata: transaction.metadata as any,
        updated_at: transaction.updatedAt
      }
    });

    return this.toDomainEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.pointsTransaction.delete({
      where: { id }
    });
  }

  private toDomainEntity(prismaTransaction: any): PointsTransaction {
    return new PointsTransaction({
      id: prismaTransaction.id,
      userId: prismaTransaction.user_id,
      orderId: prismaTransaction.order_id,
      type: prismaTransaction.type as PointsTransactionType,
      amount: new Decimal(prismaTransaction.amount),
      description: prismaTransaction.description,
      metadata: prismaTransaction.metadata || {},
      createdAt: prismaTransaction.created_at,
      updatedAt: prismaTransaction.updated_at
    });
  }
}