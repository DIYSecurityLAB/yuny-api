import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../../prisma/prisma.service';
import { IUserBalanceRepository } from '../../domain/repositories';
import { UserBalance } from '../../domain/entities';

@Injectable()
export class PrismaUserBalanceRepository implements IUserBalanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<UserBalance | null> {
    const balance = await this.prisma.userBalance.findUnique({
      where: { user_id: userId }
    });

    if (!balance) {
      return null;
    }

    return this.toDomainEntity(balance);
  }

  async save(userBalance: UserBalance): Promise<UserBalance> {
    const created = await this.prisma.userBalance.create({
      data: {
        id: userBalance.id,
        user_id: userBalance.userId,
        available_points: userBalance.availablePoints.toNumber(),
        pending_points: userBalance.pendingPoints.toNumber(),
        total_points: userBalance.totalPoints.toNumber(),
        created_at: userBalance.createdAt,
        updated_at: userBalance.updatedAt
      }
    });

    return this.toDomainEntity(created);
  }

  async update(userBalance: UserBalance): Promise<UserBalance> {
    const updated = await this.prisma.userBalance.update({
      where: { id: userBalance.id },
      data: {
        available_points: userBalance.availablePoints.toNumber(),
        pending_points: userBalance.pendingPoints.toNumber(),
        total_points: userBalance.totalPoints.toNumber(),
        updated_at: userBalance.updatedAt
      }
    });

    return this.toDomainEntity(updated);
  }

  async creditPoints(userId: string, amount: Decimal): Promise<UserBalance> {
    // Usa transação para garantir atomicidade
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.userBalance.findUnique({
        where: { user_id: userId }
      });

      if (!current) {
        throw new Error('User balance not found');
      }

      const currentBalance = this.toDomainEntity(current);
      const updatedBalance = currentBalance.creditPoints(amount);

      const updated = await tx.userBalance.update({
        where: { user_id: userId },
        data: {
          available_points: updatedBalance.availablePoints.toNumber(),
          total_points: updatedBalance.totalPoints.toNumber(),
          updated_at: updatedBalance.updatedAt
        }
      });

      return updated;
    });

    return this.toDomainEntity(result);
  }

  async debitPoints(userId: string, amount: Decimal): Promise<UserBalance> {
    // Usa transação para garantir atomicidade
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.userBalance.findUnique({
        where: { user_id: userId }
      });

      if (!current) {
        throw new Error('User balance not found');
      }

      const currentBalance = this.toDomainEntity(current);
      const updatedBalance = currentBalance.debitPoints(amount);

      const updated = await tx.userBalance.update({
        where: { user_id: userId },
        data: {
          available_points: updatedBalance.availablePoints.toNumber(),
          total_points: updatedBalance.totalPoints.toNumber(),
          updated_at: updatedBalance.updatedAt
        }
      });

      return updated;
    });

    return this.toDomainEntity(result);
  }

  async convertPendingToAvailable(userId: string, amount: Decimal): Promise<UserBalance> {
    // Usa transação para garantir atomicidade e consistência
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.userBalance.findUnique({
        where: { user_id: userId }
      });

      if (!current) {
        throw new Error('User balance not found');
      }

      const currentBalance = this.toDomainEntity(current);
      const updatedBalance = currentBalance.convertPendingToAvailable(amount);

      const updated = await tx.userBalance.update({
        where: { user_id: userId },
        data: {
          available_points: updatedBalance.availablePoints.toNumber(),
          pending_points: updatedBalance.pendingPoints.toNumber(),
          total_points: updatedBalance.totalPoints.toNumber(),
          updated_at: updatedBalance.updatedAt
        }
      });

      return updated;
    });

    return this.toDomainEntity(result);
  }

  async addPendingPoints(userId: string, amount: Decimal): Promise<UserBalance> {
    // Usa transação para garantir atomicidade
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.userBalance.findUnique({
        where: { user_id: userId }
      });

      if (!current) {
        throw new Error('User balance not found');
      }

      const currentBalance = this.toDomainEntity(current);
      const updatedBalance = currentBalance.addPendingPoints(amount);

      const updated = await tx.userBalance.update({
        where: { user_id: userId },
        data: {
          pending_points: updatedBalance.pendingPoints.toNumber(),
          total_points: updatedBalance.totalPoints.toNumber(),
          updated_at: updatedBalance.updatedAt
        }
      });

      return updated;
    });

    return this.toDomainEntity(result);
  }

  private toDomainEntity(prismaBalance: any): UserBalance {
    return new UserBalance({
      id: prismaBalance.id,
      userId: prismaBalance.user_id,
      availablePoints: new Decimal(prismaBalance.available_points),
      pendingPoints: new Decimal(prismaBalance.pending_points),
      totalPoints: new Decimal(prismaBalance.total_points),
      createdAt: prismaBalance.created_at,
      updatedAt: prismaBalance.updated_at
    });
  }
}