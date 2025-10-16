import { IsNumber, IsEnum, IsOptional, IsString, IsUUID, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { Decimal } from 'decimal.js';
import { PaymentMethod } from '../../domain/enums';

export class CreateOrderDto {
  @ApiProperty({
    description: 'Valor desejado em reais para compra de pontos',
    example: 100.00,
    minimum: 1,
    maximum: 10000
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Valor mínimo é R$ 1,00' })
  @Max(10000, { message: 'Valor máximo é R$ 10.000,00' })
  @Type(() => Number)
  @Transform(({ value }) => new Decimal(value))
  requestedAmount: Decimal;

  @ApiProperty({
    description: 'Método de pagamento',
    enum: PaymentMethod,
    example: PaymentMethod.PIX
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Descrição opcional da compra',
    example: 'Compra de pontos YunY para marketplace'
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateOrderResponseDto {
  @ApiProperty({
    description: 'ID único da ordem criada',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  orderId: string;

  @ApiProperty({
    description: 'ID do usuário',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  userId: string;

  @ApiProperty({
    description: 'Valor solicitado em reais',
    example: 100.00
  })
  requestedAmount: number;

  @ApiProperty({
    description: 'Valor da taxa (5%)',
    example: 5.00
  })
  feeAmount: number;

  @ApiProperty({
    description: 'Valor total a ser pago (valor + taxa)',
    example: 105.00
  })
  totalAmount: number;

  @ApiProperty({
    description: 'Quantidade de pontos que serão creditados',
    example: 100.00
  })
  pointsAmount: number;

  @ApiPropertyOptional({
    description: 'Código PIX para pagamento (formato texto)',
    example: '00020126580014br.gov.bcb.pix...'
  })
  qrCode?: string;

  @ApiPropertyOptional({
    description: 'URL da imagem do QR Code',
    example: 'https://api.qrserver.com/v1/create-qr-code/...'
  })
  qrImageUrl?: string;

  @ApiPropertyOptional({
    description: 'Data de expiração do pagamento PIX',
    example: '2025-10-15T16:25:00Z'
  })
  expiresAt?: Date;

  @ApiPropertyOptional({
    description: 'ID da transação no AlfredPay',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  alfredTransactionId?: string;
}