import { Decimal } from 'decimal.js';
import { OrderStatus, PaymentMethod } from '../enums';

export class Order {
  public readonly id: string;
  public readonly userId: string;
  public readonly requestedAmount: Decimal;
  public readonly feeAmount: Decimal;
  public readonly totalAmount: Decimal;
  public readonly pointsAmount: Decimal;
  public readonly status: OrderStatus;
  public readonly paymentMethod: PaymentMethod;
  public readonly alfredTransactionId: string | null;
  public readonly qrCode: string | null;
  public readonly qrImageUrl: string | null;
  public readonly expiresAt: Date | null;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: {
    id: string;
    userId: string;
    requestedAmount: Decimal;
    feeAmount: Decimal;
    totalAmount: Decimal;
    pointsAmount: Decimal;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    alfredTransactionId?: string | null;
    qrCode?: string | null;
    qrImageUrl?: string | null;
    expiresAt?: Date | null;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.requestedAmount = props.requestedAmount;
    this.feeAmount = props.feeAmount;
    this.totalAmount = props.totalAmount;
    this.pointsAmount = props.pointsAmount;
    this.status = props.status;
    this.paymentMethod = props.paymentMethod;
    this.alfredTransactionId = props.alfredTransactionId || null;
    this.qrCode = props.qrCode || null;
    this.qrImageUrl = props.qrImageUrl || null;
    this.expiresAt = props.expiresAt || null;
    this.metadata = props.metadata || {};
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;

    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new Error('Order ID is required');
    }

    if (!this.userId) {
      throw new Error('User ID is required');
    }

    if (this.requestedAmount.lessThanOrEqualTo(0)) {
      throw new Error('Requested amount must be positive');
    }

    if (this.feeAmount.lessThan(0)) {
      throw new Error('Fee amount cannot be negative');
    }

    if (this.totalAmount.lessThanOrEqualTo(0)) {
      throw new Error('Total amount must be positive');
    }

    if (this.pointsAmount.lessThanOrEqualTo(0)) {
      throw new Error('Points amount must be positive');
    }

    const calculatedTotal = this.requestedAmount.plus(this.feeAmount);
    if (!calculatedTotal.equals(this.totalAmount)) {
      throw new Error('Total amount must equal requested amount plus fee');
    }

    if (!this.pointsAmount.equals(this.requestedAmount)) {
      throw new Error('Points amount must equal requested amount (1:1 conversion)');
    }
  }

  public updateStatus(newStatus: OrderStatus, metadata?: Record<string, unknown>): Order {
    return new Order({
      ...this,
      status: newStatus,
      metadata: { ...this.metadata, ...metadata },
      updatedAt: new Date()
    });
  }

  public setAlfredData(transactionId: string, qrCode: string, qrImageUrl: string): Order {
    return new Order({
      ...this,
      alfredTransactionId: transactionId,
      qrCode,
      qrImageUrl,
      expiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes
      updatedAt: new Date()
    });
  }

  public isExpired(): boolean {
    if (!this.expiresAt) {
      return false;
    }
    return new Date() > this.expiresAt;
  }

  public canBeProcessed(): boolean {
    return this.status === OrderStatus.PENDING && !this.isExpired();
  }

  public canBeCompleted(): boolean {
    return [OrderStatus.PENDING, OrderStatus.PROCESSING].includes(this.status) && !this.isExpired();
  }

  public canBeCancelled(): boolean {
    return [OrderStatus.PENDING, OrderStatus.PROCESSING].includes(this.status);
  }
}