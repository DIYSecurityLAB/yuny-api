import { ChangedBy, OrderStatus } from '../enums';

export class OrderStatusHistory {
  public readonly id: string;
  public readonly orderId: string;
  public readonly previousStatus: OrderStatus | null;
  public readonly newStatus: OrderStatus;
  public readonly changedBy: ChangedBy;
  public readonly reason: string;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;

  constructor(props: {
    id: string;
    orderId: string;
    previousStatus?: OrderStatus | null;
    newStatus: OrderStatus;
    changedBy: ChangedBy;
    reason: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.previousStatus = props.previousStatus || null;
    this.newStatus = props.newStatus;
    this.changedBy = props.changedBy;
    this.reason = props.reason;
    this.metadata = props.metadata || {};
    this.createdAt = props.createdAt;

    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new Error('OrderStatusHistory ID is required');
    }

    if (!this.orderId) {
      throw new Error('Order ID is required');
    }

    if (!this.reason || this.reason.trim().length === 0) {
      throw new Error('Reason for status change is required');
    }
  }

  public isInitialStatus(): boolean {
    return this.previousStatus === null;
  }

  public isStatusChange(): boolean {
    return this.previousStatus !== null && this.previousStatus !== this.newStatus;
  }

  public wasChangedBySystem(): boolean {
    return [ChangedBy.SYSTEM, ChangedBy.ALFRED_WEBHOOK, ChangedBy.POLLING_SERVICE].includes(this.changedBy);
  }

  public wasChangedByUser(): boolean {
    return [ChangedBy.USER, ChangedBy.ADMIN].includes(this.changedBy);
  }
}