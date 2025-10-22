import { PointsTransaction } from '../entities';
import { PointsTransactionType } from '../enums';

export interface IPointsTransactionRepository {
  findById(id: string): Promise<PointsTransaction | null>;
  findByUserId(userId: string): Promise<PointsTransaction[]>;
  findByOrderId(orderId: string): Promise<PointsTransaction[]>;
  findByType(type: PointsTransactionType): Promise<PointsTransaction[]>;
  findByUserIdAndDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<PointsTransaction[]>;
  save(transaction: PointsTransaction): Promise<PointsTransaction>;
  update(transaction: PointsTransaction): Promise<PointsTransaction>;
  delete(id: string): Promise<void>;
}