import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../domain/enums';

export class CheckOrderStatusDto {
  @ApiProperty({
    description: 'ID da ordem para consulta de status',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  @IsUUID()
  orderId: string;
}

export class CheckOrderStatusResponseDto {
  @ApiProperty({
    description: 'ID da ordem consultada',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  orderId: string;

  @ApiProperty({
    description: 'Status atual da ordem',
    enum: OrderStatus,
    example: OrderStatus.COMPLETED
  })
  status: OrderStatus;

  @ApiProperty({
    description: 'Indica se o status mudou durante esta consulta',
    example: true
  })
  statusChanged: boolean;

  @ApiProperty({
    description: 'ID da transação no AlfredPay',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  alfredTransactionId?: string;

  @ApiProperty({
    description: 'Quantidade de pontos da ordem',
    example: 100.00
  })
  pointsAmount: number;

  @ApiProperty({
    description: 'Valor solicitado da ordem',
    example: 100.00
  })
  requestedAmount: number;

  @ApiProperty({
    description: 'Valor total da ordem',
    example: 105.00
  })
  totalAmount: number;
}