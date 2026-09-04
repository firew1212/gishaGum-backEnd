import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import axios, {
  AxiosError,
  AxiosInstance,
} from 'axios';

interface ChapaInitializeRequest {
  amount: string;
  currency: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  tx_ref: string;
  callback_url: string;
  return_url: string;
}

interface ChapaInitializeResponse {
  status: string;
  message: string;
  data?: {
    checkout_url?: string;
    reference?: string;
    tx_ref?: string;
  };
}

interface ChapaVerifyResponse {
  status: string;
  message: string;
  data?: {
    status?: string;
    tx_ref?: string;
    reference?: string;
    amount?: number | string;
    currency?: string;
    mode?: string;
  };
}



@Injectable()
export class ChapaService {
  private readonly logger = new Logger(
    ChapaService.name,
  );

  private readonly http: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const baseURL =
      this.configService.getOrThrow<string>(
        'CHAPA_BASE_URL',
      );

    const secretKey =
      this.configService.getOrThrow<string>(
        'CHAPA_SECRET_KEY',
      );

    this.http = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    this.logger.log(
      `Chapa client initialized: ${baseURL}`,
    );
  }

  // ==================================================
  // INITIALIZE PAYMENT
  // ==================================================

  async initializeTransaction(
    payload: ChapaInitializeRequest,
  ): Promise<ChapaInitializeResponse> {
    try {
      const response =
        await this.http.post<ChapaInitializeResponse>(
          '/v1/transaction/initialize',
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

      return response.data;
    } catch (error) {
      this.handleChapaError(
        error,
        'Chapa transaction initialization failed',
        'Unable to initialize Chapa payment',
      );
    }
  }

  // ==================================================
  // VERIFY PAYMENT
  // ==================================================

  async verifyTransaction(
    txRef: string,
  ): Promise<ChapaVerifyResponse> {
    try {
      const response =
        await this.http.get<ChapaVerifyResponse>(
          `/v1/transaction/verify/${encodeURIComponent(
            txRef,
          )}`,
        );

      return response.data;
    } catch (error) {
      this.handleChapaError(
        error,
        'Chapa transaction verification failed',
        'Unable to verify Chapa payment',
      );
    }
  }

  

 

  // ==================================================
  // COMMON ERROR HANDLER
  // ==================================================

  private handleChapaError(
    error: unknown,
    logMessage: string,
    clientMessage: string,
  ): never {
    const axiosError =
      error as AxiosError<{
        message?: string;
        status?: string;
        data?: unknown;
      }>;

    this.logger.error(logMessage, {
      statusCode:
        axiosError.response?.status,

      message:
        axiosError.response?.data?.message ??
        axiosError.message,
    });

    throw new BadGatewayException(
      clientMessage,
    );
  }
}