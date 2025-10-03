import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiKeyProtected,
  MerchantOnly,
  ConsumerOnly,
  AnalyticsAccess,
  HighValueTransaction,
  BulkOperation,
  FinancialDataAccess,
} from '../../infrastructure/decorators/api-key.decorators';
import { MarketplacePermission } from '../../domain/enums';

// Example marketplace controllers demonstrating API Key protection

@Controller('marketplace/coupons')
export class MarketplaceCouponsController {
  
  @Get()
  @ConsumerOnly()
  async searchCoupons(
    @Query() searchParams: any,
    @Request() req: any,
  ) {
    // Available to consumers with coupon.search permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Coupons search results',
      data: {
        coupons: [],
        context: {
          userType: apiKeyContext.userType,
          tenantId: apiKeyContext.tenantId,
          consumerId: apiKeyContext.consumerId,
        },
      },
    };
  }

  @Post()
  @MerchantOnly()
  async createCoupon(
    @Body() couponData: any,
    @Request() req: any,
  ) {
    // Available to merchants with coupon.create permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Coupon created successfully',
      data: {
        couponId: 'generated-id',
        storeId: apiKeyContext.storeId,
        merchantId: apiKeyContext.userId,
      },
    };
  }

  @Put(':id')
  @MerchantOnly()
  async updateCoupon(
    @Param('id') couponId: string,
    @Body() updateData: any,
    @Request() req: any,
  ) {
    // Available to merchants with coupon.manage permission
    const { apiKeyContext } = req;
    
    // Ensure merchant can only update their own coupons
    // This would be implemented in service layer
    
    return {
      message: 'Coupon updated successfully',
      data: { couponId, storeId: apiKeyContext.storeId },
    };
  }

  @Post('bulk-upload')
  @BulkOperation()
  async bulkUploadCoupons(
    @Body() couponsData: any,
    @Request() req: any,
  ) {
    // Available to merchants with bulk.upload permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Bulk upload initiated',
      data: {
        batchId: 'batch-123',
        storeId: apiKeyContext.storeId,
        couponCount: couponsData.coupons?.length || 0,
      },
    };
  }

  @Post(':id/purchase')
  @HighValueTransaction()
  async purchaseCoupon(
    @Param('id') couponId: string,
    @Body() purchaseData: { amount: number; currency: string },
    @Request() req: any,
  ) {
    // Available to consumers with coupon.purchase permission
    // Has enhanced rate limiting and fraud detection
    const { apiKeyContext } = req;
    
    return {
      message: 'Coupon purchased successfully',
      data: {
        transactionId: 'txn-123',
        couponId,
        consumerId: apiKeyContext.consumerId,
        amount: purchaseData.amount,
        currency: purchaseData.currency,
      },
    };
  }
}

@Controller('marketplace/analytics')
export class MarketplaceAnalyticsController {
  
  @Get('merchant/dashboard')
  @AnalyticsAccess()
  async getMerchantDashboard(
    @Request() req: any,
  ) {
    // Available to merchants with analytics.view permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Merchant dashboard data',
      data: {
        storeId: apiKeyContext.storeId,
        metrics: {
          totalSales: 1000,
          totalCoupons: 50,
          conversionRate: 15.5,
        },
      },
    };
  }

  @Get('revenue')
  @FinancialDataAccess()
  async getRevenueData(
    @Query('period') period: string,
    @Request() req: any,
  ) {
    // Available to merchants with revenue.read permission
    // Requires compliance-level access
    const { apiKeyContext } = req;
    
    return {
      message: 'Revenue data retrieved',
      data: {
        period,
        storeId: apiKeyContext.storeId,
        revenue: {
          total: 50000,
          breakdown: [],
        },
      },
    };
  }

  @Get('platform/overview')
  @ApiKeyProtected([MarketplacePermission.MARKETPLACE_ANALYTICS])
  async getPlatformOverview(
    @Request() req: any,
  ) {
    // Available to platform users with marketplace.analytics permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Platform overview data',
      data: {
        tenantId: apiKeyContext.tenantId,
        overview: {
          totalMerchants: 150,
          totalConsumers: 5000,
          totalTransactions: 25000,
          totalRevenue: 1000000,
        },
      },
    };
  }
}

@Controller('marketplace/consumer')
export class MarketplaceConsumerController {
  
  @Get('wallet')
  @ApiKeyProtected([MarketplacePermission.WALLET_VIEW])
  async getWallet(
    @Request() req: any,
  ) {
    // Available to consumers with wallet.view permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Wallet information',
      data: {
        consumerId: apiKeyContext.consumerId,
        balance: 150.00,
        currency: 'BRL',
        coupons: [],
      },
    };
  }

  @Get('transaction-history')
  @ApiKeyProtected([MarketplacePermission.TRANSACTION_HISTORY])
  async getTransactionHistory(
    @Query('limit') limit: number = 10,
    @Request() req: any,
  ) {
    // Available to consumers with transaction.history permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Transaction history',
      data: {
        consumerId: apiKeyContext.consumerId,
        transactions: [],
        pagination: {
          limit,
          total: 0,
        },
      },
    };
  }

  @Post('redeem/:couponId')
  @ApiKeyProtected([MarketplacePermission.COUPON_REDEEM])
  async redeemCoupon(
    @Param('couponId') couponId: string,
    @Body() redeemData: any,
    @Request() req: any,
  ) {
    // Available to consumers with coupon.redeem permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Coupon redeemed successfully',
      data: {
        couponId,
        consumerId: apiKeyContext.consumerId,
        redemptionId: 'redeem-123',
        redeemedAt: new Date(),
      },
    };
  }
}

@Controller('webhooks')
export class WebhookController {
  
  @Post('payment-confirmation')
  @ApiKeyProtected([MarketplacePermission.WEBHOOK_RECEIVE])
  async handlePaymentConfirmation(
    @Body() payload: any,
    @Request() req: any,
  ) {
    // Available to webhook users with webhook.receive permission
    // Would include webhook signature validation
    const { apiKeyContext } = req;
    
    return {
      message: 'Webhook processed',
      data: {
        eventId: payload.eventId,
        processed: true,
        timestamp: new Date(),
      },
    };
  }

  @Post('merchant-notification')
  @ApiKeyProtected([MarketplacePermission.NOTIFICATION_SEND])
  async sendMerchantNotification(
    @Body() notification: any,
    @Request() req: any,
  ) {
    // Available to platform/webhook users with notification.send permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Notification sent',
      data: {
        notificationId: 'notif-123',
        merchantId: notification.merchantId,
        sentAt: new Date(),
      },
    };
  }
}

// Category-specific controller example
@Controller('marketplace/electronics')
export class ElectronicsController {
  
  @Get()
  @ApiKeyProtected([MarketplacePermission.ELECTRONICS_READ], 'electronics')
  async getElectronicsCoupons(
    @Request() req: any,
  ) {
    // Available to users with electronics.read permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Electronics coupons',
      data: {
        category: 'electronics',
        coupons: [],
        userType: apiKeyContext.userType,
      },
    };
  }

  @Post('inventory')
  @ApiKeyProtected([MarketplacePermission.ELECTRONICS_MANAGE], 'electronics')
  async updateElectronicsInventory(
    @Body() inventoryData: any,
    @Request() req: any,
  ) {
    // Available to merchants with electronics.manage permission
    const { apiKeyContext } = req;
    
    return {
      message: 'Electronics inventory updated',
      data: {
        category: 'electronics',
        storeId: apiKeyContext.storeId,
        updatedProducts: inventoryData.products?.length || 0,
      },
    };
  }
}