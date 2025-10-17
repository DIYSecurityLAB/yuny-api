import { Decimal } from 'decimal.js';

export interface WebhookLogProps {
  id: string;
  webhookId?: string;
  transactionId: string;
  externalId: string;
  status: string;
  previousStatus?: string;
  payload: Record<string, any>;
  signature: string;
  processedAt: Date;
  isValid: boolean;
  errorMessage?: string;
  processingTimeMs?: number;
  createdAt: Date;
}

export class WebhookLog {
  private props: WebhookLogProps;

  constructor(props: WebhookLogProps) {
    this.props = {
      ...props,
      createdAt: props.createdAt || new Date(),
      processedAt: props.processedAt || new Date(),
      isValid: props.isValid ?? false
    };
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get webhookId(): string | undefined {
    return this.props.webhookId;
  }

  get transactionId(): string {
    return this.props.transactionId;
  }

  get externalId(): string {
    return this.props.externalId;
  }

  get status(): string {
    return this.props.status;
  }

  get previousStatus(): string | undefined {
    return this.props.previousStatus;
  }

  get payload(): Record<string, any> {
    return this.props.payload;
  }

  get signature(): string {
    return this.props.signature;
  }

  get processedAt(): Date {
    return this.props.processedAt;
  }

  get isValid(): boolean {
    return this.props.isValid;
  }

  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }

  get processingTimeMs(): number | undefined {
    return this.props.processingTimeMs;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  // Business methods
  markAsValid(): WebhookLog {
    return new WebhookLog({
      ...this.props,
      isValid: true,
      errorMessage: undefined
    });
  }

  markAsInvalid(errorMessage: string): WebhookLog {
    return new WebhookLog({
      ...this.props,
      isValid: false,
      errorMessage
    });
  }

  setProcessingTime(timeMs: number): WebhookLog {
    return new WebhookLog({
      ...this.props,
      processingTimeMs: timeMs
    });
  }

  // Static factory methods
  static create(props: Omit<WebhookLogProps, 'id' | 'createdAt' | 'processedAt'>): WebhookLog {
    return new WebhookLog({
      ...props,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      processedAt: new Date()
    });
  }

  static createValid(
    transactionId: string,
    externalId: string,
    status: string,
    payload: Record<string, any>,
    signature: string,
    options?: {
      webhookId?: string;
      previousStatus?: string;
      processingTimeMs?: number;
    }
  ): WebhookLog {
    return new WebhookLog({
      id: crypto.randomUUID(),
      webhookId: options?.webhookId,
      transactionId,
      externalId,
      status,
      previousStatus: options?.previousStatus,
      payload,
      signature,
      processedAt: new Date(),
      isValid: true,
      processingTimeMs: options?.processingTimeMs,
      createdAt: new Date()
    });
  }

  static createInvalid(
    transactionId: string,
    externalId: string,
    status: string,
    payload: Record<string, any>,
    signature: string,
    errorMessage: string,
    options?: {
      webhookId?: string;
      previousStatus?: string;
    }
  ): WebhookLog {
    return new WebhookLog({
      id: crypto.randomUUID(),
      webhookId: options?.webhookId,
      transactionId,
      externalId,
      status,
      previousStatus: options?.previousStatus,
      payload,
      signature,
      processedAt: new Date(),
      isValid: false,
      errorMessage,
      createdAt: new Date()
    });
  }

  // Validation methods
  isProcessedRecently(maxAgeMinutes: number = 5): boolean {
    const maxAge = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    return this.props.processedAt > maxAge;
  }

  hasError(): boolean {
    return !this.props.isValid || !!this.props.errorMessage;
  }

  toJSON(): Record<string, any> {
    return {
      id: this.props.id,
      webhookId: this.props.webhookId,
      transactionId: this.props.transactionId,
      externalId: this.props.externalId,
      status: this.props.status,
      previousStatus: this.props.previousStatus,
      payload: this.props.payload,
      signature: this.props.signature,
      processedAt: this.props.processedAt.toISOString(),
      isValid: this.props.isValid,
      errorMessage: this.props.errorMessage,
      processingTimeMs: this.props.processingTimeMs,
      createdAt: this.props.createdAt.toISOString()
    };
  }
}