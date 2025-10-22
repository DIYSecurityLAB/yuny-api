import { IsString, IsNotEmpty, IsObject, IsOptional, IsIn, IsUUID, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AlfredWebhookDto {
  @ApiProperty({
    description: 'ID único do webhook (para idempotência)',
    example: 'webhook_550e8400-e29b-41d4-a716-446655440000'
  })
  @IsString()
  @IsOptional()
  webhookId?: string;

  @ApiProperty({
    description: 'ID da transação no AlfredPay',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({
    description: 'Status atual da transação',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED'],
    example: 'COMPLETED'
  })
  @IsString()
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED'])
  status: string;

  @ApiProperty({
    description: 'Status anterior da transação',
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED'],
    example: 'PROCESSING',
    required: false
  })
  @IsString()
  @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED'])
  @IsOptional()
  previousStatus?: string;

  @ApiProperty({
    description: 'ID externo fornecido na criação (nosso orderId)',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({
    description: 'Valor da transação em string para precisão',
    example: '105.50'
  })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({
    description: 'Tipo/moeda da transação',
    example: 'BRL'
  })
  @IsString()
  @IsNotEmpty()
  amountType: string;

  @ApiProperty({
    description: 'Método de pagamento utilizado',
    example: 'PIX'
  })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiProperty({
    description: 'Hash da transação na blockchain (se aplicável)',
    example: '0x123456789abcdef...',
    required: false
  })
  @IsString()
  @IsOptional()
  txHash?: string;

  @ApiProperty({
    description: 'Timestamp ISO da mudança de status',
    example: '2025-10-16T17:45:00.000Z'
  })
  @IsDateString()
  @IsNotEmpty()
  updatedAt: string;

  @ApiProperty({
    description: 'Dados adicionais do webhook',
    example: { 
      confirmations: 3, 
      fee: 0.0001,
      network: 'bitcoin',
      reason: 'Payment confirmed'
    }
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiProperty({
    description: 'Assinatura HMAC-SHA256 do webhook para validação de autenticidade',
    example: 'sha256=abc123def456...'
  })
  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class ProcessWebhookRequest {
  @ApiProperty({
    description: 'Dados do webhook recebido do AlfredPay'
  })
  webhookData: AlfredWebhookDto;

  @ApiProperty({
    description: 'Corpo bruto da requisição para validação de assinatura'
  })
  rawBody: string;

  @ApiProperty({
    description: 'Headers da requisição HTTP'
  })
  headers: Record<string, string>;
}

export class ProcessWebhookResponse {
  @ApiProperty({
    description: 'Indica se o processamento foi bem-sucedido',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Mensagem descritiva do resultado',
    example: 'Webhook processed successfully and points credited'
  })
  message: string;

  @ApiProperty({
    description: 'ID da ordem processada',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false
  })
  orderId?: string;

  @ApiProperty({
    description: 'Indica se o webhook foi efetivamente processado (vs já processado)',
    example: true
  })
  processed: boolean;

  @ApiProperty({
    description: 'Tempo de processamento em milissegundos',
    example: 150,
    required: false
  })
  processingTimeMs?: number;

  @ApiProperty({
    description: 'ID do log de webhook criado',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false
  })
  webhookLogId?: string;
}

export class WebhookHealthResponse {
  @ApiProperty({
    description: 'Status da saúde do endpoint',
    example: 'healthy'
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: 'Timestamp da verificação',
    example: '2025-10-16T17:45:00.000Z'
  })
  timestamp: string;

  @ApiProperty({
    description: 'Estatísticas dos últimos webhooks processados'
  })
  stats: {
    last24h: {
      total: number;
      successful: number;
      failed: number;
      avgProcessingTime: number;
    };
    last1h: {
      total: number;
      successful: number;
      failed: number;
    };
  };
}