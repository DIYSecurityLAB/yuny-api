import { Injectable, ConflictException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserResponseDto, LoginResponseDto } from './dto/response.dto';
import { SmsService } from './sms.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  async registrar(registerDto: RegisterDto): Promise<UserResponseDto> {
    const { nome, cpf, email, telefone, senha } = registerDto;

    // Verificar duplicidade de CPF e email
    const existingUser = await this.prisma.usuario.findFirst({
      where: {
        OR: [{ cpf }, { email }],
      },
    });

    if (existingUser) {
      if (existingUser.cpf === cpf) {
        throw new ConflictException('CPF já está em uso');
      }
      if (existingUser.email === email) {
        throw new ConflictException('Email já está em uso');
      }
    }

    // Hash da senha
    const saltRounds = 12;
    const senhaHash = await bcrypt.hash(senha, saltRounds);

    // Criar usuário
    const usuario = await this.prisma.usuario.create({
      data: {
        nome,
        cpf,
        email,
        telefone,
        senhaHash,
        data_criacao: new Date(),
      },
    });

    // Simular envio de SMS de confirmação
    await this.smsService.enviarSmsConfirmacao(telefone, nome);

    this.logger.log(`Usuário registrado com sucesso: ${email}`);

    // Retornar dados do usuário (sem senha)
    return {
      user_id: usuario.user_id,
      nome: usuario.nome,
      cpf: usuario.cpf,
      email: usuario.email,
      telefone: usuario.telefone,
      data_criacao: usuario.data_criacao,
      ultimo_login: usuario.ultimo_login,
    };
  }

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const { identifier, senha } = loginDto;

    // Buscar usuário por CPF ou email
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        OR: [{ cpf: identifier }, { email: identifier }],
      },
    });

    if (!usuario) {
      this.logger.warn(`Tentativa de login com credenciais inválidas: ${identifier}`);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaValida) {
      this.logger.warn(`Tentativa de login com senha incorreta para: ${identifier}`);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Atualizar último login
    await this.prisma.usuario.update({
      where: { user_id: usuario.user_id },
      data: { ultimo_login: new Date() },
    });

    // Gerar tokens
    const tokens = await this.gerarTokens(usuario.user_id);

    this.logger.log(`Login realizado com sucesso: ${usuario.email}`);

    return {
      user: {
        user_id: usuario.user_id,
        nome: usuario.nome,
        cpf: usuario.cpf,
        email: usuario.email,
        telefone: usuario.telefone,
        data_criacao: usuario.data_criacao,
        ultimo_login: new Date(),
      },
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
  }

  async gerarTokens(userId: string): Promise<{ access_token: string; refresh_token: string }> {
    const payload = { sub: userId };

    // Gerar access token (30 minutos)
    const access_token = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '30m'),
    });

    // Gerar refresh token (7 dias)
    const refresh_token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Salvar refresh token no banco
    await this.prisma.refreshToken.create({
      data: {
        token: refresh_token,
        user_id: userId,
        expires_at: expiresAt,
      },
    });

    return { access_token, refresh_token };
  }

  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    // Buscar refresh token no banco
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { usuario: true },
    });

    if (!tokenRecord || tokenRecord.is_revoked || tokenRecord.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    // Gerar novo access token
    const payload = { sub: tokenRecord.user_id };
    const access_token = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '30m'),
    });

    this.logger.log(`Access token renovado para usuário: ${tokenRecord.usuario.email}`);

    return { access_token };
  }

  async revogarRefreshToken(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { is_revoked: true },
    });
  }
}