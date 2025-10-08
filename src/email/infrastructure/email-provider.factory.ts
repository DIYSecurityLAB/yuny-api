import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IEmailProvider } from '../domain/email.interfaces';
import { EmailProvider } from '../domain/email.entity';
import { MockEmailProvider } from './providers/mock-email.provider';
import { NodemailerProvider } from './providers/nodemailer.provider';
import { SendGridProvider } from './providers/sendgrid.provider';


@Injectable()
export class EmailProviderFactory {
  constructor(private readonly configService: ConfigService) {}

  create(): IEmailProvider {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'mock') as EmailProvider;

    switch (provider) {
      case EmailProvider.NODEMAILER:
        return new NodemailerProvider(this.configService);
      
      case EmailProvider.SENDGRID:
        return new SendGridProvider(this.configService);
      
      case EmailProvider.AWS_SES:
        // TODO: Implementar AWS SES Provider
        throw new Error('AWS SES provider not implemented yet');
      
      case EmailProvider.MOCK:
      default:
        return new MockEmailProvider();
    }
  }
}