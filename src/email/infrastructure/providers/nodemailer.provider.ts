import { ConfigService } from '@nestjs/config';
import { IEmailProvider } from '../../domain/email.interfaces';
import { Email, EmailResult, EmailProvider } from '../../domain/email.entity';

export class NodemailerProvider implements IEmailProvider {
  private transporter: any;
  private nodemailer: any;

  constructor(private readonly configService: ConfigService) {
    try {
      this.nodemailer = require('nodemailer');
    } catch (error) {
      throw new Error('Nodemailer não está instalado. Execute: npm install nodemailer @types/nodemailer');
    }

    this.transporter = this.nodemailer.createTransporter({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async send(email: Email): Promise<EmailResult> {
    try {
      const mailOptions = {
        from: email.from || this.configService.get<string>('EMAIL_FROM', 'noreply@yuny-api.com'),
        to: email.to,
        subject: email.subject,
        html: email.htmlContent,
        text: email.textContent,
        cc: email.cc,
        bcc: email.bcc,
        attachments: email.attachments?.map(attachment => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
          encoding: attachment.encoding,
        })),
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        provider: EmailProvider.NODEMAILER,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: EmailProvider.NODEMAILER,
        timestamp: new Date(),
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Nodemailer health check failed:', error);
      return false;
    }
  }

  getProviderName(): string {
    return 'Nodemailer SMTP Provider';
  }
}