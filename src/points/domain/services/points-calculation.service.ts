import { Decimal } from 'decimal.js';

export class PointsCalculationService {
  private static readonly FEE_PERCENTAGE = new Decimal(0.05); // 5%
  private static readonly MIN_PURCHASE_AMOUNT = new Decimal(1); // R$ 1,00
  private static readonly MAX_PURCHASE_AMOUNT = new Decimal(10000); // R$ 10,000.00

  public static calculateFee(requestedAmount: Decimal): Decimal {
    if (requestedAmount.lessThanOrEqualTo(0)) {
      throw new Error('Requested amount must be positive');
    }

    return requestedAmount.mul(this.FEE_PERCENTAGE);
  }

  public static calculateTotalAmount(requestedAmount: Decimal): Decimal {
    if (requestedAmount.lessThanOrEqualTo(0)) {
      throw new Error('Requested amount must be positive');
    }

    const fee = this.calculateFee(requestedAmount);
    return requestedAmount.plus(fee);
  }

  public static calculatePointsAmount(requestedAmount: Decimal): Decimal {
    if (requestedAmount.lessThanOrEqualTo(0)) {
      throw new Error('Requested amount must be positive');
    }

    // Conversão 1:1 - pontos equivalem ao valor solicitado (sem taxa)
    return requestedAmount;
  }

  public static validatePurchaseAmount(amount: Decimal): void {
    if (amount.lessThan(this.MIN_PURCHASE_AMOUNT)) {
      throw new Error(`Minimum purchase amount is R$ ${this.MIN_PURCHASE_AMOUNT.toString()}`);
    }

    if (amount.greaterThan(this.MAX_PURCHASE_AMOUNT)) {
      throw new Error(`Maximum purchase amount is R$ ${this.MAX_PURCHASE_AMOUNT.toString()}`);
    }
  }

  public static calculatePurchaseDetails(requestedAmount: Decimal): {
    requestedAmount: Decimal;
    feeAmount: Decimal;
    totalAmount: Decimal;
    pointsAmount: Decimal;
    feePercentage: Decimal;
  } {
    this.validatePurchaseAmount(requestedAmount);

    const feeAmount = this.calculateFee(requestedAmount);
    const totalAmount = this.calculateTotalAmount(requestedAmount);
    const pointsAmount = this.calculatePointsAmount(requestedAmount);

    return {
      requestedAmount,
      feeAmount,
      totalAmount,
      pointsAmount,
      feePercentage: this.FEE_PERCENTAGE
    };
  }

  public static getMinPurchaseAmount(): Decimal {
    return this.MIN_PURCHASE_AMOUNT;
  }

  public static getMaxPurchaseAmount(): Decimal {
    return this.MAX_PURCHASE_AMOUNT;
  }

  public static getFeePercentage(): Decimal {
    return this.FEE_PERCENTAGE;
  }
}