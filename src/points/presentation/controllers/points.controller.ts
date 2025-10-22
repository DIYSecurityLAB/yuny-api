import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  Query,
  HttpStatus, 
  HttpException,
  UseGuards,
  Request,
  Inject
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam,
  ApiQuery
} from '@nestjs/swagger';
import { Decimal } from 'decimal.js';

import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../../prisma/prisma.service';

import { 
  CreateOrderUseCase,
  CheckOrderStatusUseCase,
  GetTransactionHistoryUseCase
} from '../../application/use-cases';
import {
  CreateOrderDto,
  CreateOrderResponseDto,
  CheckOrderStatusDto,
  CheckOrderStatusResponseDto,
  GetTransactionHistoryDto,
  GetTransactionHistoryResponseDto
} from '../dto';
import { ApiKeyProtected } from '@/api-key/infrastructure/decorators/api-key.decorators';

@ApiTags('Points - Compra de Pontos')
@Controller('points')
@UseGuards(JwtAuthGuard)
@ApiKeyProtected()
export class PointsController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly checkOrderStatusUseCase: CheckOrderStatusUseCase,
    private readonly getTransactionHistoryUseCase: GetTransactionHistoryUseCase,
    private readonly prisma: PrismaService
  ) {}

  @Get('balance')
  @ApiOperation({
    summary: 'Consultar saldo de pontos',
    description: 'Retorna o saldo atual de pontos do usuário autenticado'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Saldo consultado com sucesso',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: 'a8e3f4c1-2b3d-4e5f-6a7b-8c9d0e1f2a3b' },
        availablePoints: { type: 'number', example: 150.00 },
        pendingPoints: { type: 'number', example: 0.00 },
        totalPoints: { type: 'number', example: 200.00 }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Token de autenticação inválido'
  })
  async getBalance(@Request() req: any) {
    try {
      const userId = req.user?.user_id;
      if (!userId) {
        throw new HttpException('User ID not found in token', HttpStatus.UNAUTHORIZED);
      }

      const balance = await this.prisma.userBalance.findUnique({
        where: { user_id: userId },
        select: {
          user_id: true,
          available_points: true,
          pending_points: true,
          total_points: true
        }
      });

      if (!balance) {
        // Se não existir saldo, retornar zero
        return {
          userId,
          availablePoints: 0,
          pendingPoints: 0,
          totalPoints: 0
        };
      }

      return {
        userId: balance.user_id,
        availablePoints: Number(balance.available_points),
        pendingPoints: Number(balance.pending_points),
        totalPoints: Number(balance.total_points)
      };

    } catch (error) {
      throw new HttpException(
        error.message || 'Erro interno do servidor',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('orders')
  @ApiOperation({
    summary: 'Criar ordem de compra de pontos',
    description: 'Cria uma nova ordem para compra de pontos YunY com conversão 1:1 e taxa de 5%'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Ordem criada com sucesso',
    type: CreateOrderResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Dados inválidos ou usuário já possui ordem pendente'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Token de autenticação inválido'
  })
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @Request() req: any
  ): Promise<CreateOrderResponseDto> {
    try {
      // JWT Strategy retorna objeto usuario com user_id
      const userId = req.user?.user_id;
      if (!userId) {
        throw new HttpException('User ID not found in token', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.createOrderUseCase.execute({
        userId,
        requestedAmount: new Decimal(createOrderDto.requestedAmount),
        paymentMethod: createOrderDto.paymentMethod,
        description: createOrderDto.description
      });

      return {
        orderId: result.orderId,
        userId: result.userId,
        requestedAmount: result.requestedAmount.toNumber(),
        feeAmount: result.feeAmount.toNumber(),
        totalAmount: result.totalAmount.toNumber(),
        pointsAmount: result.pointsAmount.toNumber(),
        qrCode: result.qrCode,
        qrImageUrl: result.qrImageUrl,
        expiresAt: result.expiresAt,
        alfredTransactionId: result.alfredTransactionId
      };

    } catch (error) {
      if (error.message.includes('User not found')) {
        throw new HttpException('Usuário não encontrado', HttpStatus.NOT_FOUND);
      }
      if (error.message.includes('User is not active')) {
        throw new HttpException('Usuário inativo', HttpStatus.FORBIDDEN);
      }
      if (error.message.includes('already has a pending order')) {
        throw new HttpException('Usuário já possui uma ordem pendente', HttpStatus.CONFLICT);
      }
      if (error.message.includes('Minimum purchase amount')) {
        throw new HttpException('Valor mínimo de compra não atingido', HttpStatus.BAD_REQUEST);
      }
      if (error.message.includes('Maximum purchase amount')) {
        throw new HttpException('Valor máximo de compra excedido', HttpStatus.BAD_REQUEST);
      }
      if (error.message.includes('Failed to create PIX transaction')) {
        throw new HttpException('Falha na integração com gateway de pagamento', HttpStatus.BAD_GATEWAY);
      }

      throw new HttpException(
        error.message || 'Erro interno do servidor',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('orders/:orderId/status')
  @ApiOperation({
    summary: 'Consultar status de ordem',
    description: 'Consulta o status atual de uma ordem e atualiza se houver mudanças no AlfredPay'
  })
  @ApiParam({
    name: 'orderId',
    description: 'ID da ordem para consulta',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Status da ordem consultado com sucesso',
    type: CheckOrderStatusResponseDto
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Ordem não encontrada'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Token de autenticação inválido'
  })
  async checkOrderStatus(
    @Param('orderId') orderId: string
  ): Promise<CheckOrderStatusResponseDto> {
    try {
      const result = await this.checkOrderStatusUseCase.execute({ orderId });

      return {
        orderId: result.orderId,
        status: result.status as any,
        statusChanged: result.statusChanged,
        alfredTransactionId: result.alfredTransactionId,
        pointsAmount: result.pointsAmount.toNumber(),
        requestedAmount: result.requestedAmount.toNumber(),
        totalAmount: result.totalAmount.toNumber()
      };

    } catch (error) {
      if (error.message.includes('Order not found')) {
        throw new HttpException('Ordem não encontrada', HttpStatus.NOT_FOUND);
      }

      throw new HttpException(
        error.message || 'Erro interno do servidor',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('history')
  @ApiOperation({
    summary: 'Consultar histórico de transações',
    description: 'Consulta o histórico completo de mudanças de status de ordens com filtros opcionais'
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'ID do usuário para filtrar histórico'
  })
  @ApiQuery({
    name: 'orderId', 
    required: false,
    description: 'ID da ordem para filtrar histórico'
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Data inicial (ISO 8601)'
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Data final (ISO 8601)'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Número da página (padrão: 1)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Itens por página (padrão: 20, máx: 100)'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Histórico consultado com sucesso',
    type: GetTransactionHistoryResponseDto
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Parâmetros de consulta inválidos'
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Token de autenticação inválido'
  })
  async getTransactionHistory(
    @Query() query: GetTransactionHistoryDto
  ): Promise<GetTransactionHistoryResponseDto> {
    try {
      const result = await this.getTransactionHistoryUseCase.execute({
        userId: query.userId,
        orderId: query.orderId,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        page: query.page,
        limit: query.limit
      });

      return {
        items: result.items.map(item => ({
          id: item.id,
          orderId: item.orderId,
          previousStatus: item.previousStatus as any,
          newStatus: item.newStatus as any,
          changedBy: item.changedBy as any,
          reason: item.reason,
          metadata: item.metadata,
          createdAt: item.createdAt
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      };

    } catch (error) {
      if (error.message.includes('At least one filter')) {
        throw new HttpException(
          'Pelo menos um filtro deve ser fornecido (userId, orderId ou range de datas)',
          HttpStatus.BAD_REQUEST
        );
      }
      if (error.message.includes('Page must be greater than 0')) {
        throw new HttpException('Página deve ser maior que 0', HttpStatus.BAD_REQUEST);
      }
      if (error.message.includes('Limit must be between 1 and 100')) {
        throw new HttpException('Limite deve estar entre 1 e 100', HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(
        error.message || 'Erro interno do servidor',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('orders/:orderId/history')
  @ApiOperation({
    summary: 'Consultar histórico completo de uma ordem',
    description: 'Retorna todo o histórico de mudanças de status de uma ordem específica'
  })
  @ApiParam({
    name: 'orderId',
    description: 'ID da ordem para consulta do histórico',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Histórico da ordem consultado com sucesso',
    type: [GetTransactionHistoryResponseDto]
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Ordem não encontrada'
  })
  async getOrderHistory(@Param('orderId') orderId: string) {
    try {
      const history = await this.getTransactionHistoryUseCase.getOrderCompleteHistory(orderId);

      return history.map(item => ({
        id: item.id,
        orderId: item.orderId,
        previousStatus: item.previousStatus,
        newStatus: item.newStatus,
        changedBy: item.changedBy,
        reason: item.reason,
        metadata: item.metadata,
        createdAt: item.createdAt
      }));

    } catch (error) {
      throw new HttpException(
        error.message || 'Erro interno do servidor',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}