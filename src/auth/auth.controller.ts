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
import { UserResponseDto, LoginResponseDto, RefreshResponseDto } from './dto/response.dto';

@Controller('auth')
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
}