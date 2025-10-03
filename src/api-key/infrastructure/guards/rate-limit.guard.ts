import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { RateLimitService } from '../../application/services/rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    // Check if API key context exists (should be set by ApiKeyAuthGuard)
    if (!request.apiKeyContext) {
      // No API key context, skip rate limiting
      return true;
    }

    try {
      // Check rate limit
      const rateLimitResult = await this.rateLimitService.checkRateLimit({
        apiKeyId: request.apiKeyContext.apiKeyId,
        endpoint: request.path,
        userType: request.apiKeyContext.userType,
        rateLimitTier: 'BASIC', // This should come from API key context
      });

      // Set rate limit headers
      response.setHeader('X-RateLimit-Limit', rateLimitResult.remainingRequests + 1);
      response.setHeader('X-RateLimit-Remaining', rateLimitResult.remainingRequests);
      response.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime.getTime() / 1000));

      if (!rateLimitResult.allowed) {
        if (rateLimitResult.retryAfter) {
          response.setHeader('Retry-After', rateLimitResult.retryAfter);
        }

        throw new HttpException({
          message: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          resetTime: rateLimitResult.resetTime,
        }, HttpStatus.TOO_MANY_REQUESTS);
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }

      // Log error but don't block request
      console.error('Rate limit check failed:', error);
      return true;
    }
  }
}