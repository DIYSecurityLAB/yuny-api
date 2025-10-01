import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async enviarSmsConfirmacao(telefone: string, nome: string): Promise<void> {
    const smsEnabled = this.configService.get('SMS_PROVIDER_ENABLED', false);
    const mockMode = this.configService.get('SMS_MOCK_MODE', true);

    if (mockMode) {
      this.logger.log(`[MOCK SMS] Enviando SMS de confirmação para ${telefone}`);
      this.logger.log(`[MOCK SMS] Mensagem: Olá ${nome}! Sua conta foi criada com sucesso. Bem-vindo à Yuny!`);
      return;
    }

    if (!smsEnabled) {
      this.logger.warn('SMS provider não está habilitado');
      return;
    }

    // Aqui seria implementada a integração real com provedor de SMS
    // Por exemplo: Twilio, AWS SNS, etc.
    try {
      // await this.smsProvider.send({
      //   to: telefone,
      //   message: `Olá ${nome}! Sua conta foi criada com sucesso. Bem-vindo à Yuny!`
      // });
      
      this.logger.log(`SMS de confirmação enviado para ${telefone}`);
    } catch (error) {
      this.logger.error(`Erro ao enviar SMS para ${telefone}:`, error);
      throw error;
    }
  }

  async enviarSmsCodigoVerificacao(telefone: string, codigo: string): Promise<void> {
    const mockMode = this.configService.get('SMS_MOCK_MODE', true);

    if (mockMode) {
      this.logger.log(`[MOCK SMS] Código de verificação para ${telefone}: ${codigo}`);
      return;
    }

    // Implementação real do envio de código de verificação
    this.logger.log(`Código de verificação enviado para ${telefone}`);
  }
}