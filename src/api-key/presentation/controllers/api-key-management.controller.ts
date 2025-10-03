import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { ApiKeyManagementService } from '../../application/services/api-key-management.service';
import { RateLimitService } from '../../application/services/rate-limit.service';
import {
  CreateApiKeyDto,
  CreateTemporaryApiKeyDto,
  UpdateApiKeyDto,
  ApiKeyResponseDto,
  ListApiKeysQueryDto,
  ApiKeyUsageStatsDto,
  RateLimitStatusDto,
} from '../dto/api-key.dto';
import { UserType, MarketplacePermission } from '../../domain/enums';

@Controller('api-keys')
@UseGuards(JwtAuthGuard) // Require JWT authentication for management endpoints
export class ApiKeyManagementController {
  constructor(
    private readonly apiKeyManagementService: ApiKeyManagementService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createApiKey(
    @Body() createApiKeyDto: CreateApiKeyDto,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto;
  }> {
    const apiKey = await this.apiKeyManagementService.createApiKey({
      ...createApiKeyDto,
      expiresAt: createApiKeyDto.expiresAt ? new Date(createApiKeyDto.expiresAt) : undefined,
    });

    return {
      message: 'API key created successfully',
      data: apiKey,
    };
  }

  @Post('temporary')
  @HttpCode(HttpStatus.CREATED)
  async createTemporaryApiKey(
    @Body() createTempApiKeyDto: CreateTemporaryApiKeyDto,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto;
  }> {
    const apiKey = await this.apiKeyManagementService.createTemporaryApiKey(createTempApiKeyDto);

    return {
      message: 'Temporary API key created successfully',
      data: apiKey,
    };
  }

  @Get()
  async listApiKeys(
    @Query() query: ListApiKeysQueryDto,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto[];
  }> {
    // For security, users can only list their own API keys
    const userId = req.user.user_id;
    
    const apiKeys = await this.apiKeyManagementService.listApiKeys(
      userId,
      query.userType,
    );

    return {
      message: 'API keys retrieved successfully',
      data: apiKeys,
    };
  }

  @Get(':id')
  async getApiKey(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto;
  }> {
    const apiKey = await this.apiKeyManagementService.getApiKey(id);

    // TODO: Add authorization check to ensure user owns this API key

    return {
      message: 'API key retrieved successfully',
      data: apiKey,
    };
  }

  @Put(':id')
  async updateApiKey(
    @Param('id') id: string,
    @Body() updateApiKeyDto: UpdateApiKeyDto,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto;
  }> {
    // TODO: Add authorization check to ensure user owns this API key

    const apiKey = await this.apiKeyManagementService.updateApiKey(id, {
      ...updateApiKeyDto,
      expiresAt: updateApiKeyDto.expiresAt ? new Date(updateApiKeyDto.expiresAt) : undefined,
    });

    return {
      message: 'API key updated successfully',
      data: apiKey,
    };
  }

  @Delete(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeApiKey(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<void> {
    // TODO: Add authorization check to ensure user owns this API key
    await this.apiKeyManagementService.revokeApiKey(id);
  }

  @Post(':id/rotate')
  async rotateApiKey(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto;
  }> {
    // TODO: Add authorization check to ensure user owns this API key

    const apiKey = await this.apiKeyManagementService.rotateApiKey(id);

    return {
      message: 'API key rotated successfully. Please update your applications with the new credentials.',
      data: apiKey,
    };
  }

  @Get(':id/usage-stats')
  async getUsageStats(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyUsageStatsDto;
  }> {
    // TODO: Add authorization check to ensure user owns this API key

    const stats = await this.rateLimitService.getUsageStats(id);

    return {
      message: 'Usage statistics retrieved successfully',
      data: stats,
    };
  }

  @Get(':id/rate-limits')
  async getRateLimitStatus(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: RateLimitStatusDto[];
  }> {
    // TODO: Add authorization check to ensure user owns this API key

    const rateLimits = await this.rateLimitService.getRateLimitStatus(id);

    return {
      message: 'Rate limit status retrieved successfully',
      data: rateLimits,
    };
  }
}

// Separate controller for merchant-specific operations
@Controller('merchant/api-keys')
@UseGuards(JwtAuthGuard)
export class MerchantApiKeyController {
  constructor(
    private readonly apiKeyManagementService: ApiKeyManagementService,
  ) {}

  @Post('store/:storeId')
  @HttpCode(HttpStatus.CREATED)
  async createStoreApiKey(
    @Param('storeId') storeId: string,
    @Body() body: { name: string; permissions?: MarketplacePermission[] },
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto;
  }> {
    const userId = req.user.user_id;

    const apiKey = await this.apiKeyManagementService.createApiKey({
      name: body.name,
      userType: UserType.MERCHANT,
      userId,
      storeId,
      customPermissions: body.permissions,
    });

    return {
      message: 'Store API key created successfully',
      data: apiKey,
    };
  }

  @Get('store/:storeId')
  async getStoreApiKeys(
    @Param('storeId') storeId: string,
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto[];
  }> {
    const userId = req.user.user_id;

    const apiKeys = await this.apiKeyManagementService.listApiKeys(userId, UserType.MERCHANT);
    
    // Filter by store ID
    const storeApiKeys = apiKeys.filter(key => key.id === storeId); // This should be storeId field

    return {
      message: 'Store API keys retrieved successfully',
      data: storeApiKeys,
    };
  }
}

// Controller for consumer-specific operations
@Controller('consumer/api-keys')
@UseGuards(JwtAuthGuard)
export class ConsumerApiKeyController {
  constructor(
    private readonly apiKeyManagementService: ApiKeyManagementService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createConsumerApiKey(
    @Body() body: { name: string },
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto;
  }> {
    const userId = req.user.user_id;

    const apiKey = await this.apiKeyManagementService.createApiKey({
      name: body.name,
      userType: UserType.CONSUMER,
      userId,
      consumerId: userId, // Consumer ID is same as user ID
    });

    return {
      message: 'Consumer API key created successfully',
      data: apiKey,
    };
  }

  @Get()
  async getConsumerApiKeys(
    @Request() req: any,
  ): Promise<{
    message: string;
    data: ApiKeyResponseDto[];
  }> {
    const userId = req.user.user_id;

    const apiKeys = await this.apiKeyManagementService.listApiKeys(userId, UserType.CONSUMER);

    return {
      message: 'Consumer API keys retrieved successfully',
      data: apiKeys,
    };
  }
}