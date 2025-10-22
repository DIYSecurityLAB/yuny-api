import { Injectable, Inject } from '@nestjs/common';

import { IOrderStatusHistoryRepository } from '../../domain/repositories';
import { ORDER_STATUS_HISTORY_REPOSITORY } from '../../points.tokens';
import { 
  GetTransactionHistoryRequest, 
  GetTransactionHistoryResponse, 
  TransactionHistoryItem 
} from '../dto';

@Injectable()
export class GetTransactionHistoryUseCase {
  constructor(
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY) private readonly orderStatusHistoryRepository: IOrderStatusHistoryRepository
  ) {}

  async execute(request: GetTransactionHistoryRequest): Promise<GetTransactionHistoryResponse> {
    const page = request.page || 1;
    const limit = request.limit || 20;
    
    // Validar parâmetros de paginação
    if (page < 1) {
      throw new Error('Page must be greater than 0');
    }
    
    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    let historyRecords = [];

    // 1. Buscar histórico baseado nos filtros fornecidos
    if (request.orderId) {
      // Buscar por ordem específica
      if (request.startDate && request.endDate) {
        historyRecords = await this.orderStatusHistoryRepository.findByOrderIdAndDateRange(
          request.orderId,
          request.startDate,
          request.endDate
        );
      } else {
        historyRecords = await this.orderStatusHistoryRepository.findByOrderId(request.orderId);
      }
    } else if (request.userId) {
      // Buscar por usuário específico
      historyRecords = await this.orderStatusHistoryRepository.findByUserId(request.userId);
      
      // Aplicar filtro de data se fornecido
      if (request.startDate && request.endDate) {
        historyRecords = historyRecords.filter(record => 
          record.createdAt >= request.startDate && record.createdAt <= request.endDate
        );
      }
    } else if (request.startDate && request.endDate) {
      // Buscar por range de datas
      historyRecords = await this.orderStatusHistoryRepository.findByDateRange(
        request.startDate,
        request.endDate
      );
    } else {
      throw new Error('At least one filter (orderId, userId, or date range) must be provided');
    }

    // 2. Ordenar por data de criação (mais recente primeiro)
    historyRecords.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 3. Aplicar paginação
    const total = historyRecords.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRecords = historyRecords.slice(startIndex, endIndex);

    // 4. Mapear para o formato de resposta
    const items: TransactionHistoryItem[] = paginatedRecords.map(record => ({
      id: record.id,
      orderId: record.orderId,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      changedBy: record.changedBy,
      reason: record.reason,
      metadata: record.metadata,
      createdAt: record.createdAt
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages
    };
  }

  async getOrderCompleteHistory(orderId: string): Promise<TransactionHistoryItem[]> {
    const historyRecords = await this.orderStatusHistoryRepository.findByOrderId(orderId);
    
    // Ordenar por data de criação (mais antigo primeiro para mostrar a evolução)
    historyRecords.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return historyRecords.map(record => ({
      id: record.id,
      orderId: record.orderId,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      changedBy: record.changedBy,
      reason: record.reason,
      metadata: record.metadata,
      createdAt: record.createdAt
    }));
  }

  async getUserTransactionHistory(
    userId: string, 
    startDate?: Date, 
    endDate?: Date
  ): Promise<TransactionHistoryItem[]> {
    let historyRecords = await this.orderStatusHistoryRepository.findByUserId(userId);
    
    // Aplicar filtro de data se fornecido
    if (startDate && endDate) {
      historyRecords = historyRecords.filter(record => 
        record.createdAt >= startDate && record.createdAt <= endDate
      );
    }

    // Ordenar por data de criação (mais recente primeiro)
    historyRecords.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return historyRecords.map(record => ({
      id: record.id,
      orderId: record.orderId,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      changedBy: record.changedBy,
      reason: record.reason,
      metadata: record.metadata,
      createdAt: record.createdAt
    }));
  }
}