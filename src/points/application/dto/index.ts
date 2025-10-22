import { Decimal } from 'decimal.js';
import { PaymentMethod } from '../../domain/enums';

export interface CreateOrderRequest {
  userId: string;
  requestedAmount: Decimal;
  paymentMethod: PaymentMethod;
  description?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  userId: string;
  requestedAmount: Decimal;
  feeAmount: Decimal;
  totalAmount: Decimal;
  pointsAmount: Decimal;
  qrCode: string | null;
  qrImageUrl: string | null;
  expiresAt: Date | null;
  alfredTransactionId: string | null;
}

export interface CheckOrderStatusRequest {
  orderId: string;
}

export interface CheckOrderStatusResponse {
  orderId: string;
  currentStatus: string;
  status: string;
  statusChanged: boolean;
  alfredTransactionId: string | null;
  pointsAmount: Decimal;
  requestedAmount: Decimal;
  totalAmount: Decimal;
  updatedAt: Date;
  lastWebhookAt?: Date;
}

export interface CreditPointsRequest {
  orderId: string;
  alfredTransactionId: string;
  metadata?: Record<string, unknown>;
}

export interface CreditPointsResponse {
  success: boolean;
  userId: string;
  pointsAmount: Decimal;
  newAvailableBalance: Decimal;
  transactionId: string;
}

export interface GetTransactionHistoryRequest {
  userId?: string;
  orderId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface TransactionHistoryItem {
  id: string;
  orderId: string;
  previousStatus: string | null;
  newStatus: string;
  changedBy: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface GetTransactionHistoryResponse {
  items: TransactionHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}