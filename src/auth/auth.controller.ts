import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { EsqueceuSenhaDto } from './dto/esqueceu-senha.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { UserResponseDto, LoginResponseDto, RefreshResponseDto } from './dto/response.dto';
import { RequireApiKey } from '../api-key/infrastructure/decorators/api-key.decorators';

@Controller('auth')
@RequireApiKey() // Requer API key para todos os endpoints de autenticação
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<{
    message: string;
    user: UserResponseDto;
  }> {
    this.logger.log(`Tentativa de registro para email: ${registerDto.email}`);
    
    const user = await this.authService.registrar(registerDto);
    
    return {
      message: 'Usuário registrado com sucesso. SMS de confirmação enviado.',
      user,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<{
    message: string;
    data: LoginResponseDto;
  }> {
    this.logger.log(`Tentativa de login para: ${loginDto.identifier}`);
    
    const data = await this.authService.login(loginDto);
    
    return {
      message: 'Login realizado com sucesso',
      data,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<{
    message: string;
    data: RefreshResponseDto;
  }> {
    this.logger.log('Tentativa de renovação de token');
    
    const data = await this.authService.refreshToken(refreshTokenDto.refreshToken);
    
    return {
      message: 'Token renovado com sucesso',
      data,
    };
  }

  @Post('esqueceu-senha')
  @HttpCode(HttpStatus.OK)
  async esqueceuSenha(@Body() esqueceuSenhaDto: EsqueceuSenhaDto): Promise<{
    message: string;
  }> {
    this.logger.log(`Solicitação de reset de senha para: ${esqueceuSenhaDto.identifier.substring(0, 3)}***`);
    
    return this.authService.esqueceuSenha(esqueceuSenhaDto);
  }

  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  async redefinirSenha(@Body() redefinirSenhaDto: RedefinirSenhaDto): Promise<{
    message: string;
  }> {
    this.logger.log(`Tentativa de redefinição de senha com token: ${redefinirSenhaDto.token.substring(0, 8)}***`);
    
    return this.authService.redefinirSenha(redefinirSenhaDto);
  }
}