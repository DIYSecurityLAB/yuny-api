import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyProtected } from '../api-key/infrastructure/decorators/api-key.decorators';

@Controller('user')
export class UserController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiKeyProtected() // Combina API key + rate limiting
  getProfile(@Request() req) {
    // Agora você pode acessar tanto req.user (JWT) quanto req.apiKeyContext (API key)
    return {
      message: 'Perfil do usuário autenticado',
      user: req.user,
      apiKeyContext: req.apiKeyContext, // Contexto da API key
    };
  }
}