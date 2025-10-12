import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailService } from '../domain/email.interfaces';
import { Email, EmailProvider, EmailResult } from '../domain/email.entity';
import { EmailProviderFactory } from '../infrastructure/email-provider.factory';


@Injectable()
export class EmailService implements IEmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailProviderFactory: EmailProviderFactory,
  ) {}

  async sendEmail(email: Email): Promise<EmailResult> {
    try {
      const provider = this.emailProviderFactory.create();
      return await provider.send(email);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: this.getConfiguredProvider(),
        timestamp: new Date(),
      };
    }
  }

  async sendPasswordResetEmail(to: string, token: string, userName?: string): Promise<EmailResult> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/redefinir-senha?token=${token}`;
    
    const htmlContent = this.generatePasswordResetHtml(resetUrl, userName);
    const textContent = this.generatePasswordResetText(resetUrl, userName);

    const email = new Email(
      to,
      'Redefinição de Senha - Yuny API',
      htmlContent,
      textContent,
      this.configService.get<string>('EMAIL_FROM', 'noreply@yuny-api.com')
    );

    return this.sendEmail(email);
  }

  async sendWelcomeEmail(to: string, userName: string): Promise<EmailResult> {
    const htmlContent = this.generateWelcomeHtml(userName);
    const textContent = this.generateWelcomeText(userName);

    const email = new Email(
      to,
      'Bem-vindo à Yuny API!',
      htmlContent,
      textContent,
      this.configService.get<string>('EMAIL_FROM', 'noreply@yuny-api.com')
    );

    return this.sendEmail(email);
  }

  async sendVerificationEmail(to: string, token: string, userName?: string): Promise<EmailResult> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const verificationUrl = `${frontendUrl}/verificar-email?token=${token}`;
    
    const htmlContent = this.generateVerificationHtml(verificationUrl, userName);
    const textContent = this.generateVerificationText(verificationUrl, userName);

    const email = new Email(
      to,
      'Verificação de Email - Yuny API',
      htmlContent,
      textContent,
      this.configService.get<string>('EMAIL_FROM', 'noreply@yuny-api.com')
    );

    return this.sendEmail(email);
  }

  private getConfiguredProvider(): EmailProvider {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'mock');
    return provider as EmailProvider;
  }

  private generatePasswordResetHtml(resetUrl: string, userName?: string): string {
    return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; text-align: center;">Redefinição de Senha</h2>
          
          ${userName ? `<p>Olá, <strong>${userName}</strong>!</p>` : '<p>Olá!</p>'}
          
          <p>Recebemos uma solicitação para redefinir a senha da sua conta na Yuny API.</p>
          
          <p>Para redefinir sua senha, clique no botão abaixo:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Redefinir Senha
            </a>
          </div>
          
          <p><strong>Este link é válido por apenas 15 minutos.</strong></p>
          
          <p>Se você não solicitou esta redefinição de senha, pode ignorar este email com segurança.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          
          <p style="font-size: 12px; color: #666; text-align: center;">
            Esta é uma mensagem automática da Yuny API. Por favor, não responda este email.
          </p>
        </div>
      </body>
    </html>
    `;
  }

  private generatePasswordResetText(resetUrl: string, userName?: string): string {
    return `
${userName ? `Olá, ${userName}!` : 'Olá!'}

Recebemos uma solicitação para redefinir a senha da sua conta na Yuny API.

Para redefinir sua senha, acesse o link abaixo:
${resetUrl}

Este link é válido por apenas 15 minutos.

Se você não solicitou esta redefinição de senha, pode ignorar este email com segurança.

---
Esta é uma mensagem automática da Yuny API. Por favor, não responda este email.
    `.trim();
  }

  private generateWelcomeHtml(userName: string): string {
    return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; text-align: center;">Bem-vindo à Yuny API!</h2>
          
          <p>Olá, <strong>${userName}</strong>!</p>
          
          <p>Sua conta foi criada com sucesso na Yuny API. Agora você pode aproveitar todos os recursos disponíveis.</p>
          
          <p>Se você tiver alguma dúvida ou precisar de ajuda, não hesite em entrar em contato conosco.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          
          <p style="font-size: 12px; color: #666; text-align: center;">
            Esta é uma mensagem automática da Yuny API. Por favor, não responda este email.
          </p>
        </div>
      </body>
    </html>
    `;
  }

  private generateWelcomeText(userName: string): string {
    return `
Olá, ${userName}!

Sua conta foi criada com sucesso na Yuny API. Agora você pode aproveitar todos os recursos disponíveis.

Se você tiver alguma dúvida ou precisar de ajuda, não hesite em entrar em contato conosco.

---
Esta é uma mensagem automática da Yuny API. Por favor, não responda este email.
    `.trim();
  }

  private generateVerificationHtml(verificationUrl: string, userName?: string): string {
    return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; text-align: center;">Verificação de Email</h2>
          
          ${userName ? `<p>Olá, <strong>${userName}</strong>!</p>` : '<p>Olá!</p>'}
          
          <p>Para completar o cadastro da sua conta na Yuny API, precisamos verificar seu endereço de email.</p>
          
          <p>Clique no botão abaixo para verificar seu email:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #28a745; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px; display: inline-block;">
              Verificar Email
            </a>
          </div>
          
          <p>Se você não criou uma conta na Yuny API, pode ignorar este email com segurança.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          
          <p style="font-size: 12px; color: #666; text-align: center;">
            Esta é uma mensagem automática da Yuny API. Por favor, não responda este email.
          </p>
        </div>
      </body>
    </html>
    `;
  }

  private generateVerificationText(verificationUrl: string, userName?: string): string {
    return `
${userName ? `Olá, ${userName}!` : 'Olá!'}

Para completar o cadastro da sua conta na Yuny API, precisamos verificar seu endereço de email.

Acesse o link abaixo para verificar seu email:
${verificationUrl}

Se você não criou uma conta na Yuny API, pode ignorar este email com segurança.

---
Esta é uma mensagem automática da Yuny API. Por favor, não responda este email.
    `.trim();
  }
}