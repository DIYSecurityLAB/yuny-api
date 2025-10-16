import { IsUUID, IsOptional, IsDateString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ChangedBy, OrderStatus } from '../../domain/enums';

export class GetTransactionHistoryDto {
  @ApiPropertyOptional({
    description: 'ID do usuário para filtrar histórico',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'ID da ordem para filtrar histórico',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({
    description: 'Data inicial para filtro (ISO 8601)',
    example: '2025-10-01T00:00:00Z'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Data final para filtro (ISO 8601)',
    example: '2025-10-31T23:59:59Z'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Número da página (inicia em 1)',
    example: 1,
    minimum: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({
    description: 'Itens por página (máximo 100)',
    example: 20,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}

export class TransactionHistoryItemDto {
  @ApiProperty({
    description: 'ID único do registro de histórico',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  id: string;

  @ApiProperty({
    description: 'ID da ordem relacionada',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  orderId: string;

  @ApiProperty({
    description: 'Status anterior da ordem',
    enum: OrderStatus,
    example: OrderStatus.PENDING,
    nullable: true
  })
  previousStatus?: OrderStatus;

  @ApiProperty({
    description: 'Novo status da ordem',
    enum: OrderStatus,
    example: OrderStatus.COMPLETED
  })
  newStatus: OrderStatus;

  @ApiProperty({
    description: 'Quem alterou o status',
    enum: ChangedBy,
    example: ChangedBy.SYSTEM
  })
  changedBy: ChangedBy;

  @ApiProperty({
    description: 'Motivo da alteração',
    example: 'Pagamento confirmado pelo AlfredPay'
  })
  reason: string;

  @ApiProperty({
    description: 'Metadados adicionais da alteração',
    example: {
      alfredTransactionId: '550e8400-e29b-41d4-a716-446655440000',
      pointsAmount: '100.00',
      paymentMethod: 'PIX'
    }
  })
  metadata: Record<string, unknown>;

  @ApiProperty({
    description: 'Data e hora da alteração',
    example: '2025-10-15T16:05:30Z'
  })
  createdAt: Date;
}

export class GetTransactionHistoryResponseDto {
  @ApiProperty({
    description: 'Lista de registros de histórico',
    type: [TransactionHistoryItemDto]
  })
  items: TransactionHistoryItemDto[];

  @ApiProperty({
    description: 'Total de registros encontrados',
    example: 45
  })
  total: number;

  @ApiProperty({
    description: 'Página atual',
    example: 1
  })
  page: number;

  @ApiProperty({
    description: 'Itens por página',
    example: 20
  })
  limit: number;

  @ApiProperty({
    description: 'Total de páginas',
    example: 3
  })
  totalPages: number;
}