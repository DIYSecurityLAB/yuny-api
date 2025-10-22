import { Order } from '../entities';
import { OrderStatus } from '../enums';

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  findByUserId(userId: string): Promise<Order[]>;
  findByAlfredTransactionId(alfredTransactionId: string): Promise<Order | null>;
  findPendingOrdersByUserId(userId: string): Promise<Order[]>;
  findByStatus(status: OrderStatus): Promise<Order[]>;
  findExpiredOrders(): Promise<Order[]>;
  save(order: Order): Promise<Order>;
  update(order: Order): Promise<Order>;
  delete(id: string): Promise<void>;
}