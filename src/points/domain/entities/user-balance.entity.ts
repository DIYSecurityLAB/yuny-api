import Decimal from "decimal.js";


export class UserBalance {
  public readonly id: string;
  public readonly userId: string;
  public readonly availablePoints: Decimal;
  public readonly pendingPoints: Decimal;
  public readonly totalPoints: Decimal;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: {
    id: string;
    userId: string;
    availablePoints: Decimal;
    pendingPoints: Decimal;
    totalPoints: Decimal;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.availablePoints = props.availablePoints;
    this.pendingPoints = props.pendingPoints;
    this.totalPoints = props.totalPoints;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;

    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new Error('UserBalance ID is required');
    }

    if (!this.userId) {
      throw new Error('User ID is required');
    }

    if (this.availablePoints.lessThan(0)) {
      throw new Error('Available points cannot be negative');
    }

    if (this.pendingPoints.lessThan(0)) {
      throw new Error('Pending points cannot be negative');
    }

    if (this.totalPoints.lessThan(0)) {
      throw new Error('Total points cannot be negative');
    }

    const calculatedTotal = this.availablePoints.plus(this.pendingPoints);
    if (!calculatedTotal.equals(this.totalPoints)) {
      throw new Error('Total points must equal available plus pending points');
    }
  }

  public creditPoints(amount: Decimal): UserBalance {
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error('Credit amount must be positive');
    }

    return new UserBalance({
      ...this,
      availablePoints: this.availablePoints.plus(amount),
      totalPoints: this.totalPoints.plus(amount),
      updatedAt: new Date()
    });
  }

  public addPendingPoints(amount: Decimal): UserBalance {
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error('Pending amount must be positive');
    }

    return new UserBalance({
      ...this,
      pendingPoints: this.pendingPoints.plus(amount),
      totalPoints: this.totalPoints.plus(amount),
      updatedAt: new Date()
    });
  }

  public convertPendingToAvailable(amount: Decimal): UserBalance {
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error('Conversion amount must be positive');
    }

    if (amount.greaterThan(this.pendingPoints)) {
      throw new Error('Cannot convert more than available pending points');
    }

    return new UserBalance({
      ...this,
      availablePoints: this.availablePoints.plus(amount),
      pendingPoints: this.pendingPoints.minus(amount),
      updatedAt: new Date()
    });
  }

  public debitPoints(amount: Decimal): UserBalance {
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error('Debit amount must be positive');
    }

    if (amount.greaterThan(this.availablePoints)) {
      throw new Error('Insufficient available points');
    }

    return new UserBalance({
      ...this,
      availablePoints: this.availablePoints.minus(amount),
      totalPoints: this.totalPoints.minus(amount),
      updatedAt: new Date()
    });
  }
}