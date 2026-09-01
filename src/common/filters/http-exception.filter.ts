import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter
  implements ExceptionFilter
{
  catch(
    exception: unknown,
    host: ArgumentsHost,
  ) {
    const context =
      host.switchToHttp();

    const response =
      context.getResponse<Response>();

    const request =
      context.getRequest<Request>();

    let status =
      HttpStatus.INTERNAL_SERVER_ERROR;

    let message =
      'Internal server error';

    // -----------------------------------------------
    // NestJS HTTP exception
    // -----------------------------------------------

    if (exception instanceof HttpException) {
      status =
        exception.getStatus();

      const exceptionResponse =
        exception.getResponse();

      if (
        typeof exceptionResponse ===
        'string'
      ) {
        message =
          exceptionResponse;
      } else if (
        typeof exceptionResponse ===
          'object' &&
        exceptionResponse !== null
      ) {
        const data =
          exceptionResponse as {
            message?: string | string[];
          };

        if (Array.isArray(data.message)) {
          message =
            data.message.join(', ');
        } else if (data.message) {
          message =
            data.message;
        }
      }
    }

    // -----------------------------------------------
    // Final response
    // -----------------------------------------------

    response.status(status).json({
      success: false,

      statusCode: status,

      message,

      path: request.url,

      timestamp:
        new Date().toISOString(),
    });
  }
}