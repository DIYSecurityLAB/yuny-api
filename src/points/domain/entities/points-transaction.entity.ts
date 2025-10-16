import { Decimal } from 'decimal.js';
import { PointsTransactionType } from '../enums';

export class PointsTransaction {
  public readonly id: string;
  public readonly userId: string;
  public readonly orderId: string | null;
  public readonly type: PointsTransactionType;
  public readonly amount: Decimal;
  public readonly description: string;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: {
    id: string;
    userId: string;
    orderId?: string | null;
    type: PointsTransactionType;
    amount: Decimal;
    description: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.orderId = props.orderId || null;
    this.type = props.type;
    this.amount = props.amount;
    this.description = props.description;
    this.metadata = props.metadata || {};
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;

    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new Error('PointsTransaction ID is required');
    }

    if (!this.userId) {
      throw new Error('User ID is required');
    }

    if (this.amount.lessThanOrEqualTo(0)) {
      throw new Error('Transaction amount must be positive');
    }

    if (!this.description || this.description.trim().length === 0) {
      throw new Error('Transaction description is required');
    }
  }

  public updateType(newType: PointsTransactionType, metadata?: Record<string, unknown>): PointsTransaction {
    return new PointsTransaction({
      ...this,
      type: newType,
      metadata: { ...this.metadata, ...metadata },
      updatedAt: new Date()
    });
  }

  public isPending(): boolean {
    return this.type === PointsTransactionType.PENDING;
  }

  public isCredit(): boolean {
    return this.type === PointsTransactionType.CREDIT;
  }

  public isDebit(): boolean {
    return this.type === PointsTransactionType.DEBIT;
  }

  public isRefund(): boolean {
    return this.type === PointsTransactionType.REFUND;
  }

  public canBeProcessed(): boolean {
    return this.type === PointsTransactionType.PENDING;
  }
}