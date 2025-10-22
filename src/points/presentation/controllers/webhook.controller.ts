import { 
  Controller, 
  Post, 
  Body, 
  Req, 
  Res, 
  HttpStatus, 
  HttpException,
  Get,
  Query,
  UseGuards
} from '@nestjs/common';
import { Request, Response } from 'express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse,
  ApiQuery,
  ApiSecurity
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ApiKeyProtected } from '../../../api-key/infrastructure/decorators/api-key.decorators';

import { ProcessAlfredWebhookUseCase } from '../../application/use-cases';
import { 
  AlfredWebhookDto, 
  ProcessWebhookResponse,
  WebhookHealthResponse 
} from '../dto/webhook.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly processWebhookUseCase: ProcessAlfredWebhookUseCase,
    private readonly configService: ConfigService
  ) {}

  @Post('alfred-pay')
  @ApiOperation({
    summary: 'Recebe webhook do AlfredPay',
    description: `
      Endpoint para receber notificações automáticas do AlfredPay sobre mudanças 
      de status de transações. Este endpoint valida a assinatura HMAC e processa 
      as atualizações automaticamente.
      
      **Segurança**: Protegido apenas por validação de assinatura HMAC, não requer JWT/ApiKey.
      
      **Idempotência**: Webhooks duplicados são detectados e retornam 200 OK sem reprocessar.
      
      **Retry Policy**: AlfredPay tentará reenviar webhooks falhados automaticamente.
    `
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processado com sucesso',
    type: ProcessWebhookResponse
  })
  @ApiResponse({
    status: 400,
    description: 'Dados do webhook inválidos'
  })
  @ApiResponse({
    status: 401,
    description: 'Assinatura do webhook inválida'
  })
  @ApiResponse({
    status: 500,
    description: 'Erro interno no processamento'
  })
  async receiveAlfredWebhook(
    @Body() webhookData: AlfredWebhookDto,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Verificar se webhooks estão habilitados
      const webhooksEnabled = this.configService.get<boolean>('WEBHOOK_ENABLED', true);
      if (!webhooksEnabled) {
        console.warn('[WebhookController] Webhooks disabled by configuration');
        response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          message: 'Webhooks are temporarily disabled',
          processed: false
        });
        return;
      }

      console.info('[WebhookController] Webhook received', {
        transactionId: webhookData.transactionId,
        externalId: webhookData.externalId,
        status: webhookData.status,
        webhookId: webhookData.webhookId,
        ip: request.ip,
        userAgent: request.get('User-Agent')
      });

      // Obter corpo bruto da requisição para validação de assinatura
      const rawBody = request.body ? JSON.stringify(request.body) : '';
      const headers = request.headers as Record<string, string>;

      // Processar webhook
      const result = await this.processWebhookUseCase.execute(
        webhookData,
        rawBody,
        headers
      );

      // Log do resultado
      const processingTime = Date.now() - startTime;
      console.info('[WebhookController] Webhook processing completed', {
        transactionId: webhookData.transactionId,
        success: result.success,
        processed: result.processed,
        processingTimeMs: processingTime,
        webhookLogId: result.webhookLogId
      });

      // Sempre retornar 200 OK para webhooks válidos (mesmo se já processados)
      // Isso evita que o AlfredPay tente reenviar webhooks desnecessariamente
      if (result.success || result.message.includes('already processed')) {
        response.status(HttpStatus.OK).json({
          ...result,
          processingTimeMs: processingTime
        });
      } else {
        // Para erros de validação/assinatura, retornar status apropriado
        if (result.message.includes('Invalid signature')) {
          response.status(HttpStatus.UNAUTHORIZED).json({
            ...result,
            processingTimeMs: processingTime
          });
        } else if (result.message.includes('not found')) {
          response.status(HttpStatus.NOT_FOUND).json({
            ...result,
            processingTimeMs: processingTime
          });
        } else {
          response.status(HttpStatus.BAD_REQUEST).json({
            ...result,
            processingTimeMs: processingTime
          });
        }
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error('[WebhookController] Unexpected error in webhook processing', {
        transactionId: webhookData?.transactionId,
        error: error.message,
        stack: error.stack,
        processingTimeMs: processingTime
      });

      // Para erros inesperados, retornar 500 para que AlfredPay tente novamente
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error during webhook processing',
        processed: false,
        processingTimeMs: processingTime
      });
    }
  }

  @Get('alfred-pay/health')
  @ApiOperation({
    summary: 'Health check do endpoint de webhook',
    description: `
      Verifica a saúde do endpoint de webhook e retorna estatísticas 
      dos últimos webhooks processados para monitoramento.
    `
  })
  @ApiResponse({
    status: 200,
    description: 'Status de saúde do webhook endpoint',
    type: WebhookHealthResponse
  })
  async webhookHealth(): Promise<WebhookHealthResponse> {
    try {
      const webhooksEnabled = this.configService.get<boolean>('WEBHOOK_ENABLED', true);
      
      // Aqui você pode adicionar verificações mais detalhadas
      // como conectividade com banco, estatísticas, etc.
      
      const stats = {
        last24h: {
          total: 0,      // Implementar: buscar do repositório
          successful: 0, // Implementar: contar sucessos
          failed: 0,     // Implementar: contar falhas
          avgProcessingTime: 0 // Implementar: média de tempo
        },
        last1h: {
          total: 0,      // Implementar: buscar da última hora
          successful: 0, // Implementar: contar sucessos
          failed: 0      // Implementar: contar falhas
        }
      };

      return {
        status: webhooksEnabled ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        stats
      };

    } catch (error) {
      console.error('[WebhookController] Health check failed', {
        error: error.message
      });

      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        stats: {
          last24h: { total: 0, successful: 0, failed: 0, avgProcessingTime: 0 },
          last1h: { total: 0, successful: 0, failed: 0 }
        }
      };
    }
  }

  @Post('alfred-pay/simulate')
  @UseGuards(JwtAuthGuard)
  @ApiKeyProtected()
  @ApiOperation({
    summary: 'Simula webhook do AlfredPay (Desenvolvimento)',
    description: `
      **APENAS DESENVOLVIMENTO**: Endpoint para simular webhooks do AlfredPay 
      durante testes e desenvolvimento. Requer autenticação JWT + API Key.
      
      Este endpoint só funciona quando NODE_ENV=development.
    `
  })
  @ApiQuery({
    name: 'skipSignature',
    description: 'Pular validação de assinatura (apenas desenvolvimento)',
    required: false,
    type: Boolean
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook simulado processado'
  })
  @ApiResponse({
    status: 403,
    description: 'Não disponível em produção'
  })
  async simulateWebhook(
    @Body() webhookData: AlfredWebhookDto,
    @Query('skipSignature') skipSignature: boolean = false,
    @Req() request: Request
  ): Promise<ProcessWebhookResponse> {
    // Só permitir em desenvolvimento
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'production');
    if (nodeEnv === 'production') {
      throw new HttpException(
        'Webhook simulation not available in production',
        HttpStatus.FORBIDDEN
      );
    }

    console.info('[WebhookController] Simulating webhook', {
      transactionId: webhookData.transactionId,
      status: webhookData.status,
      skipSignature
    });

    // Se skipSignature for true, usar uma assinatura fake válida
    if (skipSignature) {
      webhookData.signature = 'simulated-signature-for-development';
      
      // Temporariamente habilitar modo não-assinado
      process.env.WEBHOOK_ALLOW_UNSIGNED = 'true';
    }

    const rawBody = JSON.stringify(webhookData);
    const headers = request.headers as Record<string, string>;

    const result = await this.processWebhookUseCase.execute(
      webhookData,
      rawBody,
      headers
    );

    // Restaurar configuração
    if (skipSignature) {
      delete process.env.WEBHOOK_ALLOW_UNSIGNED;
    }

    return result;
  }
}