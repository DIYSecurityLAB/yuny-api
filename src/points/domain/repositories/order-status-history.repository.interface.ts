import { OrderStatusHistory } from '../entities';
import { OrderStatus, ChangedBy } from '../enums';

export interface IOrderStatusHistoryRepository {
  findById(id: string): Promise<OrderStatusHistory | null>;
  findByOrderId(orderId: string): Promise<OrderStatusHistory[]>;
  findByUserId(userId: string): Promise<OrderStatusHistory[]>;
  findByStatus(status: OrderStatus): Promise<OrderStatusHistory[]>;
  findByChangedBy(changedBy: ChangedBy): Promise<OrderStatusHistory[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<OrderStatusHistory[]>;
  findByOrderIdAndDateRange(
    orderId: string,
    startDate: Date,
    endDate: Date
  ): Promise<OrderStatusHistory[]>;
  save(history: OrderStatusHistory): Promise<OrderStatusHistory>;
  delete(id: string): Promise<void>;
}