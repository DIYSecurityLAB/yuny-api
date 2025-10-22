import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';

import {
  IAlfredPayService,
  AlfredCreateTransactionRequest,
  AlfredCreateTransactionResponse,
  AlfredTransactionStatusResponse
} from './alfred-pay-service.interface';

@Injectable()
export class AlfredPayService implements IAlfredPayService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.baseUrl = this.configService.get<string>('ALFRED_PAY_BASE_URL');
    this.apiKey = this.configService.get<string>('ALFRED_PAY_API_KEY');

    if (!this.baseUrl) {
      throw new Error('ALFRED_PAY_BASE_URL is required');
    }

    if (!this.apiKey) {
      throw new Error('ALFRED_PAY_API_KEY is required');
    }
  }

  async createTransaction(request: AlfredCreateTransactionRequest): Promise<AlfredCreateTransactionResponse> {
    try {
      const payload = {
        amount: request.amount.toNumber(),
        amountType: request.amountType,
        cryptoType: request.cryptoType,
        cryptoAmount: request.cryptoAmount.toNumber(),
        paymentMethod: request.paymentMethod,
        type: request.type,
        walletAddress: request.walletAddress,
        network: request.network,
        ...(request.providerId && { providerId: request.providerId }),
        ...(request.couponCode && { couponCode: request.couponCode }),
        ...(request.description && { description: request.description }),
        ...(request.externalId && { externalId: request.externalId })
      };

      console.log('[AlfredPayService] Creating transaction:', {
        url: `${this.baseUrl}/v2/gateway/transactions/deposit`,
        payload: {
          ...payload,
          walletAddress: payload.walletAddress?.substring(0, 10) + '...' // Mascarar wallet
        },
        hasApiKey: !!this.apiKey
      });

      const response: AxiosResponse<AlfredCreateTransactionResponse> = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/v2/gateway/transactions/deposit`, payload, {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 segundos
        })
      );

      console.log('[AlfredPayService] Transaction created successfully:', {
        success: response.data.success,
        transactionId: response.data.transactionId,
        providerId: response.data.providerId,
        externalId: response.data.externalId,
        hasQrCode: !!response.data.qrCopyPaste,
        hasQrImage: !!response.data.qrImageUrl
      });

      console.log('[AlfredPayService] 📋 FULL ALFRED RESPONSE:');
      console.log(JSON.stringify(response.data, null, 2));

      if (!response.data.success) {
        throw new Error(`Alfred API returned error: ${response.data.message || 'Unknown error'}`);
      }

      return response.data;

    } catch (error) {
      this.handleError(error, 'Failed to create Alfred transaction');
    }
  }

  async getTransactionStatus(transactionId: string): Promise<AlfredTransactionStatusResponse> {
    try {
      const url = `${this.baseUrl}/v2/gateway/transactions/status/${transactionId}`;
      
      console.log('[AlfredPayService] Getting transaction status:', {
        url,
        transactionId,
        baseUrl: this.baseUrl,
        hasApiKey: !!this.apiKey,
        apiKeyPrefix: this.apiKey?.substring(0, 10) + '...'
      });

      const response: AxiosResponse<AlfredTransactionStatusResponse> = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 15000 // 15 segundos
        })
      );

      console.log('[AlfredPayService] Transaction status response received:', {
        transactionId,
        status: response.data.status,
        hasExternalId: !!response.data.externalId,
        hasTxid: !!response.data.txid
      });

      return response.data;

    } catch (error) {
      this.handleError(error, `Failed to get Alfred transaction status for ${transactionId}`);
    }
  }

  private handleError(error: unknown, context: string): never {
    if (error && typeof error === 'object' && 'isAxiosError' in error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const message = (axiosError.response?.data as any)?.message || axiosError.message;
      const responseData = axiosError.response?.data;
      
      console.error(`[AlfredPayService] ${context}:`, {
        status,
        message,
        data: responseData,
        url: axiosError.config?.url,
        method: axiosError.config?.method,
        requestHeaders: {
          hasApiKey: !!axiosError.config?.headers?.['x-api-key'],
          contentType: axiosError.config?.headers?.['Content-Type']
        }
      });

      switch (status) {
        case 400:
          throw new HttpException(
            `Bad Request: ${message}`,
            HttpStatus.BAD_REQUEST
          );
        case 401:
          throw new HttpException(
            'Unauthorized: Invalid API key',
            HttpStatus.UNAUTHORIZED
          );
        case 403:
          throw new HttpException(
            'Forbidden: Whitelabel invalid or inactive',
            HttpStatus.FORBIDDEN
          );
        case 404:
          throw new HttpException(
            'Transaction not found',
            HttpStatus.NOT_FOUND
          );
        case 500:
          throw new HttpException(
            'Alfred API internal server error',
            HttpStatus.INTERNAL_SERVER_ERROR
          );
        default:
          throw new HttpException(
            `Alfred API error: ${message}`,
            HttpStatus.BAD_GATEWAY
          );
      }
    }

    // Erro de timeout ou conexão
    if (error instanceof Error) {
      console.error(`[AlfredPayService] ${context}:`, error.message);
      
      if (error.message.includes('timeout')) {
        throw new HttpException(
          'Alfred API timeout',
          HttpStatus.REQUEST_TIMEOUT
        );
      }
      
      throw new HttpException(
        `Alfred API error: ${error.message}`,
        HttpStatus.BAD_GATEWAY
      );
    }

    // Erro desconhecido
    console.error(`[AlfredPayService] ${context}: Unknown error`, error);
    throw new HttpException(
      'Unknown Alfred API error',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}