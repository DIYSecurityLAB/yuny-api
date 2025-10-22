import { Decimal } from 'decimal.js';

export interface AlfredCreateTransactionRequest {
  amount: Decimal;
  amountType: 'BRL' | 'USDT';
  cryptoType: 'BITCOIN' | 'USDT' | 'DEPIX';
  cryptoAmount: Decimal;
  paymentMethod: 'PIX' | 'CARD' | 'BANK_TRANSFER' | 'CRYPTO' | 'WISE' | 'TICKET' | 'USDT' | 'PAYPAL' | 'SWIFT' | 'NOMAD';
  type: 'SELL' | 'BUY';
  walletAddress: string;
  network: 'lightning' | 'liquid' | 'onchain' | 'tron' | 'polygon';
  providerId?: string;
  couponCode?: string;
  description?: string;
  externalId?: string;
}

export interface AlfredCreateTransactionResponse {
  success: boolean;
  transactionId: string;
  qrCopyPaste: string;
  qrImageUrl: string;
  providerId: string;
  amount: number;
  amountType: string;
  cryptoAmount: number;
  cryptoType: string;
  paymentMethod: string;
  type: string;
  network: string;
  walletAddress: string;
  externalId?: string;
  message: string;
}

export interface AlfredTransactionStatusResponse {
  transactionId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  cryptoAmount: number;
  cryptoType: string;
  network: string;
  walletAddress: string;
  txid: string | null;
  providerId: string;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IAlfredPayService {
  createTransaction(request: AlfredCreateTransactionRequest): Promise<AlfredCreateTransactionResponse>;
  getTransactionStatus(transactionId: string): Promise<AlfredTransactionStatusResponse>;
}