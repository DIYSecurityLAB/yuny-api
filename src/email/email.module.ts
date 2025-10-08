import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './application/email.service';
import { EmailProviderFactory } from './infrastructure/email-provider.factory';

@Module({
  imports: [ConfigModule],
  providers: [
    EmailService,
    EmailProviderFactory,
  ],
  exports: [EmailService],
})
export class EmailModule {}