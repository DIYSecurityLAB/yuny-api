import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../../prisma/prisma.service';
import { IOrderRepository } from '../../domain/repositories';
import { Order } from '../../domain/entities';
import { OrderStatus, PaymentMethod } from '../../domain/enums';

@Injectable()
export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Order | null> {
    const order = await this.prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return null;
    }

    return this.toDomainEntity(order);
  }

  async findByUserId(userId: string): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });

    return orders.map(order => this.toDomainEntity(order));
  }

  async findByAlfredTransactionId(alfredTransactionId: string): Promise<Order | null> {
    const order = await this.prisma.order.findFirst({
      where: { alfred_transaction_id: alfredTransactionId }
    });

    if (!order) {
      return null;
    }

    return this.toDomainEntity(order);
  }

  async findPendingOrdersByUserId(userId: string): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        user_id: userId,
        status: OrderStatus.PENDING
      },
      orderBy: { created_at: 'desc' }
    });

    return orders.map(order => this.toDomainEntity(order));
  }

  async findByStatus(status: OrderStatus): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: { status },
      orderBy: { created_at: 'desc' }
    });

    return orders.map(order => this.toDomainEntity(order));
  }

  async findExpiredOrders(): Promise<Order[]> {
    const now = new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        expires_at: {
          lte: now
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return orders.map(order => this.toDomainEntity(order));
  }

  async save(order: Order): Promise<Order> {
    const created = await this.prisma.order.create({
      data: {
        id: order.id,
        user_id: order.userId,
        requested_amount: order.requestedAmount.toNumber(),
        fee_amount: order.feeAmount.toNumber(),
        total_amount: order.totalAmount.toNumber(),
        points_amount: order.pointsAmount.toNumber(),
        status: order.status,
        payment_method: order.paymentMethod,
        alfred_transaction_id: order.alfredTransactionId,
        qr_code: order.qrCode,
        qr_image_url: order.qrImageUrl,
        expires_at: order.expiresAt,
        metadata: order.metadata as any,
        created_at: order.createdAt,
        updated_at: order.updatedAt
      }
    });

    return this.toDomainEntity(created);
  }

  async update(order: Order): Promise<Order> {
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        requested_amount: order.requestedAmount.toNumber(),
        fee_amount: order.feeAmount.toNumber(),
        total_amount: order.totalAmount.toNumber(),
        points_amount: order.pointsAmount.toNumber(),
        status: order.status,
        payment_method: order.paymentMethod,
        alfred_transaction_id: order.alfredTransactionId,
        qr_code: order.qrCode,
        qr_image_url: order.qrImageUrl,
        expires_at: order.expiresAt,
        metadata: order.metadata as any,
        updated_at: order.updatedAt
      }
    });

    return this.toDomainEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.order.delete({
      where: { id }
    });
  }

  private toDomainEntity(prismaOrder: any): Order {
    return new Order({
      id: prismaOrder.id,
      userId: prismaOrder.user_id,
      requestedAmount: new Decimal(prismaOrder.requested_amount),
      feeAmount: new Decimal(prismaOrder.fee_amount),
      totalAmount: new Decimal(prismaOrder.total_amount),
      pointsAmount: new Decimal(prismaOrder.points_amount),
      status: prismaOrder.status as OrderStatus,
      paymentMethod: prismaOrder.payment_method as PaymentMethod,
      alfredTransactionId: prismaOrder.alfred_transaction_id,
      qrCode: prismaOrder.qr_code,
      qrImageUrl: prismaOrder.qr_image_url,
      expiresAt: prismaOrder.expires_at,
      metadata: prismaOrder.metadata || {},
      createdAt: prismaOrder.created_at,
      updatedAt: prismaOrder.updated_at
    });
  }
}