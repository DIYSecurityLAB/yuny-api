import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ApiKeyUsageLogRepository } from '../../domain/repositories';
import { ApiKeyUsageLogEntity } from '../../domain/entities';

@Injectable()
export class PrismaApiKeyUsageLogRepository implements ApiKeyUsageLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(log: ApiKeyUsageLogEntity): Promise<ApiKeyUsageLogEntity> {
    const created = await this.prisma.apiKeyUsageLog.create({
      data: {
        id: log.id,
        api_key_id: log.apiKeyId,
        endpoint: log.endpoint,
        http_method: log.httpMethod,
        status_code: log.statusCode,
        response_time_ms: log.responseTimeMs,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        request_id: log.requestId,
        transaction_value: log.transactionValue,
        currency: log.currency,
        merchant_id: log.merchantId,
        coupon_category: log.couponCategory,
        geographic_location: log.geographicLocation,
        is_suspicious: log.isSuspicious,
        fraud_score: log.fraudScore,
        security_flags: log.securityFlags,
        timestamp: log.timestamp,
      },
    });

    return this.mapToEntity(created);
  }

  async findById(id: string): Promise<ApiKeyUsageLogEntity | null> {
    const log = await this.prisma.apiKeyUsageLog.findUnique({
      where: { id },
    });

    return log ? this.mapToEntity(log) : null;
  }

  async findByApiKeyId(
    apiKeyId: string,
    startDate: Date,
    endDate: Date,
    offset?: number,
    limit?: number
  ): Promise<{
    data: ApiKeyUsageLogEntity[];
    total: number;
  }> {
    const whereClause = {
      api_key_id: apiKeyId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [logs, total] = await Promise.all([
      this.prisma.apiKeyUsageLog.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.apiKeyUsageLog.count({
        where: whereClause,
      }),
    ]);

    return {
      data: logs.map(this.mapToEntity),
      total,
    };
  }

  async findByMerchantId(
    merchantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ApiKeyUsageLogEntity[]> {
    const logs = await this.prisma.apiKeyUsageLog.findMany({
      where: {
        merchant_id: merchantId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map(this.mapToEntity);
  }

  async countRequestsInTimeWindow(
    apiKeyId: string,
    endpoint: string,
    windowStart: Date,
    windowEnd: Date
  ): Promise<number> {
    return await this.prisma.apiKeyUsageLog.count({
      where: {
        api_key_id: apiKeyId,
        endpoint: {
          startsWith: endpoint,
        },
        timestamp: {
          gte: windowStart,
          lt: windowEnd,
        },
      },
    });
  }

  async findSuspiciousActivity(
    startDate: Date,
    endDate: Date,
    fraudThreshold: number
  ): Promise<ApiKeyUsageLogEntity[]> {
    const logs = await this.prisma.apiKeyUsageLog.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
        OR: [
          { is_suspicious: true },
          { fraud_score: { gte: fraudThreshold } },
        ],
      },
      orderBy: { fraud_score: 'desc' },
    });

    return logs.map(this.mapToEntity);
  }

  async getUsageStats(
    apiKeyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    topEndpoints: { endpoint: string; count: number }[];
  }> {
    const whereClause = {
      api_key_id: apiKeyId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [
      totalRequests,
      successfulRequests,
      failedRequests,
      responseTimeAvg,
      topEndpoints,
    ] = await Promise.all([
      this.prisma.apiKeyUsageLog.count({ where: whereClause }),
      this.prisma.apiKeyUsageLog.count({
        where: { ...whereClause, status_code: { gte: 200, lt: 400 } },
      }),
      this.prisma.apiKeyUsageLog.count({
        where: { ...whereClause, status_code: { gte: 400 } },
      }),
      this.prisma.apiKeyUsageLog.aggregate({
        where: whereClause,
        _avg: { response_time_ms: true },
      }),
      this.prisma.apiKeyUsageLog.groupBy({
        by: ['endpoint'],
        where: whereClause,
        _count: { endpoint: true },
        orderBy: { _count: { endpoint: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimeAvg._avg.response_time_ms || 0,
      topEndpoints: topEndpoints.map(ep => ({
        endpoint: ep.endpoint,
        count: ep._count.endpoint,
      })),
    };
  }

  async getRevenueStats(
    merchantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRevenue: number;
    transactionCount: number;
    averageTransactionValue: number;
    topCategories: { category: string; revenue: number }[];
  }> {
    const whereClause = {
      merchant_id: merchantId,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      transaction_value: { not: null },
    };

    const [revenueSum, transactionCount, topCategories] = await Promise.all([
      this.prisma.apiKeyUsageLog.aggregate({
        where: whereClause,
        _sum: { transaction_value: true },
        _count: { transaction_value: true },
      }),
      this.prisma.apiKeyUsageLog.count({ where: whereClause }),
      this.prisma.apiKeyUsageLog.groupBy({
        by: ['coupon_category'],
        where: {
          ...whereClause,
          coupon_category: { not: null },
        },
        _sum: { transaction_value: true },
        orderBy: { _sum: { transaction_value: 'desc' } },
        take: 10,
      }),
    ]);

    const totalRevenue = Number(revenueSum._sum.transaction_value || 0);
    const avgTransactionValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

    return {
      totalRevenue,
      transactionCount,
      averageTransactionValue: avgTransactionValue,
      topCategories: topCategories.map(cat => ({
        category: cat.coupon_category || 'unknown',
        revenue: Number(cat._sum.transaction_value || 0),
      })),
    };
  }

  async deleteOldLogs(olderThan: Date): Promise<number> {
    const result = await this.prisma.apiKeyUsageLog.deleteMany({
      where: {
        timestamp: { lt: olderThan },
      },
    });

    return result.count;
  }

  async archiveLogs(olderThan: Date): Promise<number> {
    // Implementation would move logs to archive table
    // For now, just return count that would be archived
    const count = await this.prisma.apiKeyUsageLog.count({
      where: {
        timestamp: { lt: olderThan },
      },
    });

    return count;
  }

  private mapToEntity(data: any): ApiKeyUsageLogEntity {
    return new ApiKeyUsageLogEntity(
      data.id,
      data.api_key_id,
      data.endpoint,
      data.http_method,
      data.status_code,
      data.ip_address,
      data.is_suspicious,
      data.security_flags || [],
      data.timestamp,
      data.response_time_ms,
      data.user_agent,
      data.request_id,
      data.transaction_value ? Number(data.transaction_value) : undefined,
      data.currency,
      data.merchant_id,
      data.coupon_category,
      data.geographic_location,
      data.fraud_score,
    );
  }
}