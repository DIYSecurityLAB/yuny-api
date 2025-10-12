import { Email, EmailResult } from './email.entity';

export interface IEmailProvider {
  send(email: Email): Promise<EmailResult>;
  isHealthy(): Promise<boolean>;
  getProviderName(): string;
}

export interface IEmailService {
  sendEmail(email: Email): Promise<EmailResult>;
  sendPasswordResetEmail(to: string, token: string, userName?: string): Promise<EmailResult>;
  sendWelcomeEmail(to: string, userName: string): Promise<EmailResult>;
  sendVerificationEmail(to: string, token: string, userName?: string): Promise<EmailResult>;
}