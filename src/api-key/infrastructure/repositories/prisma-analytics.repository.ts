import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ApiKeyAnalyticsRepository } from '../../domain/repositories';

@Injectable()
export class PrismaApiKeyAnalyticsRepository implements ApiKeyAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getApiKeyMetrics(tenantId?: string): Promise<{
    totalActiveKeys: number;
    totalRequests24h: number;
    totalRevenue24h: number;
    topMerchants: { merchantId: string; requests: number; revenue: number }[];
    errorRate: number;
    averageResponseTime: number;
  }> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const whereClause = tenantId ? { tenant_id: tenantId } : {};
    const logWhereClause = {
      timestamp: { gte: yesterday },
      ...(tenantId && {
        api_key: { tenant_id: tenantId },
      }),
    };

    const [
      totalActiveKeys,
      totalRequests24h,
      successfulRequests24h,
      revenueSum,
      responseTimeAvg,
      topMerchants,
    ] = await Promise.all([
      this.prisma.apiKey.count({
        where: { ...whereClause, status: 'ACTIVE' },
      }),
      this.prisma.apiKeyUsageLog.count({
        where: logWhereClause,
      }),
      this.prisma.apiKeyUsageLog.count({
        where: { ...logWhereClause, status_code: { gte: 200, lt: 400 } },
      }),
      this.prisma.apiKeyUsageLog.aggregate({
        where: { ...logWhereClause, transaction_value: { not: null } },
        _sum: { transaction_value: true },
      }),
      this.prisma.apiKeyUsageLog.aggregate({
        where: { ...logWhereClause, response_time_ms: { not: null } },
        _avg: { response_time_ms: true },
      }),
      this.prisma.apiKeyUsageLog.groupBy({
        by: ['merchant_id'],
        where: {
          ...logWhereClause,
          merchant_id: { not: null },
        },
        _count: { merchant_id: true },
        _sum: { transaction_value: true },
        orderBy: { _count: { merchant_id: 'desc' } },
        take: 10,
      }),
    ]);

    const errorRate = totalRequests24h > 0 
      ? ((totalRequests24h - successfulRequests24h) / totalRequests24h) * 100 
      : 0;

    return {
      totalActiveKeys,
      totalRequests24h,
      totalRevenue24h: Number(revenueSum._sum.transaction_value || 0),
      topMerchants: topMerchants.map(m => ({
        merchantId: m.merchant_id!,
        requests: m._count.merchant_id,
        revenue: Number(m._sum.transaction_value || 0),
      })),
      errorRate,
      averageResponseTime: responseTimeAvg._avg.response_time_ms || 0,
    };
  }

  async getPerformanceMetrics(
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week'
  ): Promise<{
    timestamp: Date;
    requests: number;
    errors: number;
    averageResponseTime: number;
    revenue: number;
  }[]> {
    let dateFormat: string;
    let intervalClause: string;

    switch (granularity) {
      case 'hour':
        dateFormat = 'YYYY-MM-DD HH24:00:00';
        intervalClause = '1 hour';
        break;
      case 'day':
        dateFormat = 'YYYY-MM-DD 00:00:00';
        intervalClause = '1 day';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        intervalClause = '1 week';
        break;
    }

    const result = await this.prisma.$queryRaw<any[]>`
      SELECT 
        DATE_TRUNC(${intervalClause}, timestamp) as timestamp,
        COUNT(*) as requests,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
        AVG(response_time_ms) as average_response_time,
        SUM(COALESCE(transaction_value, 0)) as revenue
      FROM api_key_usage_logs
      WHERE timestamp >= ${startDate} AND timestamp <= ${endDate}
      GROUP BY DATE_TRUNC(${intervalClause}, timestamp)
      ORDER BY timestamp ASC
    `;

    return result.map(row => ({
      timestamp: new Date(row.timestamp),
      requests: Number(row.requests),
      errors: Number(row.errors),
      averageResponseTime: Number(row.average_response_time || 0),
      revenue: Number(row.revenue || 0),
    }));
  }

  async getSecurityMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    suspiciousRequests: number;
    blockedIps: string[];
    fraudulentTransactions: number;
    complianceViolations: number;
  }> {
    const [
      suspiciousRequests,
      blockedIpsResult,
      fraudulentTransactions,
    ] = await Promise.all([
      this.prisma.apiKeyUsageLog.count({
        where: {
          timestamp: { gte: startDate, lte: endDate },
          is_suspicious: true,
        },
      }),
      this.prisma.apiKeyUsageLog.groupBy({
        by: ['ip_address'],
        where: {
          timestamp: { gte: startDate, lte: endDate },
          OR: [
            { is_suspicious: true },
            { fraud_score: { gte: 70 } },
          ],
        },
        _count: { ip_address: true },
        having: {
          ip_address: {
            _count: { gt: 10 },
          },
        },
      }),
      this.prisma.apiKeyUsageLog.count({
        where: {
          timestamp: { gte: startDate, lte: endDate },
          fraud_score: { gte: 80 },
          transaction_value: { not: null },
        },
      }),
    ]);

    return {
      suspiciousRequests,
      blockedIps: blockedIpsResult.map(ip => ip.ip_address),
      fraudulentTransactions,
      complianceViolations: 0, // Would be calculated from compliance audit logs
    };
  }

  async getMerchantInsights(
    merchantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    revenue: number;
    topProducts: { category: string; sales: number }[];
    conversionRate: number;
    averageOrderValue: number;
  }> {
    const whereClause = {
      merchant_id: merchantId,
      timestamp: { gte: startDate, lte: endDate },
    };

    const [
      totalRequests,
      revenueData,
      topProducts,
      transactionCount,
    ] = await Promise.all([
      this.prisma.apiKeyUsageLog.count({ where: whereClause }),
      this.prisma.apiKeyUsageLog.aggregate({
        where: { ...whereClause, transaction_value: { not: null } },
        _sum: { transaction_value: true },
      }),
      this.prisma.apiKeyUsageLog.groupBy({
        by: ['coupon_category'],
        where: {
          ...whereClause,
          coupon_category: { not: null },
          transaction_value: { not: null },
        },
        _count: { coupon_category: true },
        orderBy: { _count: { coupon_category: 'desc' } },
        take: 10,
      }),
      this.prisma.apiKeyUsageLog.count({
        where: { ...whereClause, transaction_value: { not: null } },
      }),
    ]);

    const revenue = Number(revenueData._sum.transaction_value || 0);
    const conversionRate = totalRequests > 0 ? (transactionCount / totalRequests) * 100 : 0;
    const averageOrderValue = transactionCount > 0 ? revenue / transactionCount : 0;

    return {
      totalRequests,
      revenue,
      topProducts: topProducts.map(p => ({
        category: p.coupon_category!,
        sales: p._count.coupon_category,
      })),
      conversionRate,
      averageOrderValue,
    };
  }
}