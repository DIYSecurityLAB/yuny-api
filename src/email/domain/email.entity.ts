export class Email {
  constructor(
    public readonly to: string,
    public readonly subject: string,
    public readonly htmlContent: string,
    public readonly textContent?: string,
    public readonly from?: string,
    public readonly cc?: string[],
    public readonly bcc?: string[],
    public readonly attachments?: EmailAttachment[]
  ) {}
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  encoding?: string;
}

export enum EmailProvider {
  NODEMAILER = 'nodemailer',
  SENDGRID = 'sendgrid',
  AWS_SES = 'aws-ses',
  MOCK = 'mock'
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: EmailProvider;
  timestamp: Date;
}