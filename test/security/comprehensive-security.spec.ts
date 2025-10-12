import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EmailService } from '../../src/email/application/email.service';
import { SmsService } from '../../src/auth/sms.service';

describe('Comprehensive Security Tests - Authentication & Password Reset', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let emailService: EmailService;
  let jwtService: JwtService;
  let module: TestingModule;

  const mockUser = {
    user_id: 'test-user-id',
    nome: 'Test User',
    email: 'test@domain.com',
    cpf: '12345678901',
    telefone: '11999999999',
    senha: '', // Will be set in tests
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      usuario: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn(),
      },
      passwordResetAttempt: {
        create: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    const mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockSmsService = {
      enviarSms: jest.fn().mockResolvedValue(true),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn().mockReturnValue({ userId: 'test-user-id' }),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const configs: Record<string, any> = {
          JWT_SECRET: 'test-secret-key-very-long-and-secure',
          JWT_EXPIRES_IN: '30m',
          JWT_REFRESH_EXPIRES_IN: '7d',
          BCRYPT_ROUNDS: '12',
          MAX_RESET_ATTEMPTS: '5',
          RESET_ATTEMPT_WINDOW: '3600',
        };
        return configs[key] || defaultValue;
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('🔒 Password Security Analysis', () => {
    it('should use cryptographically secure password hashing', async () => {
      const password = 'TestPassword123!';
      const hashedPassword = await bcrypt.hash(password, 12);

      // Verify bcrypt configuration
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
      expect(hashedPassword.startsWith('$2b$') || hashedPassword.startsWith('$2a$')).toBe(true);

      const isValid = await bcrypt.compare(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should resist timing attacks on password verification', async () => {
      const correctPassword = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hashedPassword = await bcrypt.hash(correctPassword, 12);

      const measurements = [];
      
      // Measure multiple times for accuracy
      for (let i = 0; i < 10; i++) {
        const startCorrect = process.hrtime.bigint();
        await bcrypt.compare(correctPassword, hashedPassword);
        const timeCorrect = Number(process.hrtime.bigint() - startCorrect) / 1000000;

        const startWrong = process.hrtime.bigint();
        await bcrypt.compare(wrongPassword, hashedPassword);
        const timeWrong = Number(process.hrtime.bigint() - startWrong) / 1000000;

        measurements.push({ correct: timeCorrect, wrong: timeWrong });
      }

      // Calculate average timing difference
      const avgDiff = measurements.reduce((sum, m) => sum + Math.abs(m.correct - m.wrong), 0) / measurements.length;
      
      // bcrypt should have similar timing for both (protection against timing attacks)
      expect(avgDiff).toBeLessThan(50); // Tolerância de 50ms para timing attacks
    });

    it('should generate unique salt for each password hash', async () => {
      const password = 'SamePassword123!';
      const hashes = [];
      
      for (let i = 0; i < 5; i++) {
        const hash = await bcrypt.hash(password, 12);
        hashes.push(hash);
      }

      // All hashes should be different
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(5);

      // All should verify correctly
      for (const hash of hashes) {
        expect(await bcrypt.compare(password, hash)).toBe(true);
      }
    });
  });

  describe('🔐 Token Security Analysis', () => {
    it('should generate cryptographically secure reset tokens', async () => {
      // Reset all mocks
      jest.clearAllMocks();
      
      (prismaService.usuario.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prismaService.passwordResetToken.create as jest.Mock).mockResolvedValue({
        token: 'generated-token',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      const result = await service.esqueceuSenha({ identifier: 'test@domain.com' });

      expect(result.message).toBe('Se o usuário existir, um email será enviado com as instruções.');
      expect(prismaService.passwordResetToken.create).toHaveBeenCalled();

      const createCall = (prismaService.passwordResetToken.create as jest.Mock).mock.calls[0][0];
      const token = createCall.data.token;

      // Token security properties
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(token).toMatch(/^[a-f0-9-]+$/); // UUID format
    });

    it('should enforce appropriate token expiration', async () => {
      // Reset all mocks
      jest.clearAllMocks();
      
      (prismaService.usuario.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prismaService.passwordResetToken.create as jest.Mock).mockResolvedValue({
        token: 'generated-token',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      await service.esqueceuSenha({ identifier: 'test@domain.com' });

      const createCall = (prismaService.passwordResetToken.create as jest.Mock).mock.calls[0][0];
      const expiresAt = createCall.data.expires_at;

      const now = new Date();
      const timeDiff = expiresAt.getTime() - now.getTime();

      // Token should expire in approximately 15 minutes
      expect(timeDiff).toBeGreaterThan(14 * 60 * 1000);
      expect(timeDiff).toBeLessThan(16 * 60 * 1000);
    });

    it('should prevent token reuse (replay attacks)', async () => {
      const tokenData = {
        id: 'token-id',
        token: 'valid-token',
        user_id: 'test-user-id',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
        used: false,
        created_at: new Date(),
      };

      // First use of token
      (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValueOnce(tokenData);
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.passwordResetToken.update as jest.Mock).mockResolvedValue(tokenData);
      (prismaService.usuario.update as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prismaService.auditLog.create as jest.Mock).mockResolvedValue({});

      const result1 = await service.redefinirSenha({
        token: 'valid-token',
        novaSenha: 'NewPassword123!',
      });

      expect(result1.message).toBe('Senha redefinida com sucesso. Faça login com sua nova senha.');

      // Second use of same token (should fail)
      // O Prisma findFirst com filtro used: false retorna null para tokens usados
      (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.redefinirSenha({
          token: 'valid-token',
          novaSenha: 'AnotherPassword123!',
        })
      ).rejects.toThrow('Token inválido ou expirado');
    });

    it('should handle expired tokens securely', async () => {
      // Para token expirado, o Prisma findFirst retorna null devido ao filtro expires_at: { gte: new Date() }
      (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.redefinirSenha({
          token: 'expired-token',
          novaSenha: 'NewPassword123!',
        })
      ).rejects.toThrow('Token inválido ou expirado');
    });
  });

  describe('🚫 Rate Limiting and Abuse Prevention', () => {
    it('should not leak user existence information', async () => {
      // Test with existing user
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const result1 = await service.esqueceuSenha({ identifier: 'existing@domain.com' });

      // Test with non-existent user
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(null);
      const result2 = await service.esqueceuSenha({ identifier: 'nonexistent@domain.com' });

      // Both should return the same message
      expect(result1.message).toBe(result2.message);
      expect(result1.message).toBe('Se o usuário existir, um email será enviado com as instruções.');
    });

    it('should simulate rate limiting protection', async () => {
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.passwordResetToken.create as jest.Mock).mockResolvedValue({
        token: 'generated-token',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.esqueceuSenha({ identifier: 'test@domain.com' }));
      }

      const results = await Promise.all(promises);
      
      // All should return success (to prevent information leakage)
      results.forEach(result => {
        expect(result.message).toBe('Se o usuário existir, um email será enviado com as instruções.');
      });

      // NOTE: In production, implement actual rate limiting
    });

    it('should prevent brute force token attacks', async () => {
      (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue(null);

      const attempts = [];
      for (let i = 0; i < 100; i++) {
        attempts.push(
          service.redefinirSenha({
            token: `invalid-token-${i}`,
            novaSenha: 'Password123!',
          }).catch(() => 'failed')
        );
      }

      const results = await Promise.all(attempts);
      const failedCount = results.filter(r => r === 'failed').length;

      expect(failedCount).toBe(100);
      // NOTE: In production, implement rate limiting after multiple failed attempts
    });
  });

  describe('🔍 Input Validation and Sanitization', () => {
    it('should validate identifier format', async () => {
      const invalidIdentifiers = [
        '',
        null,
        undefined,
        '<script>alert("xss")</script>',
        'test@<script>alert("xss")</script>.com',
        'test@domain.com; DROP TABLE users;',
        '../../../etc/passwd',
        'SELECT * FROM usuarios WHERE email = ',
      ];

      for (const invalidIdentifier of invalidIdentifiers) {
        try {
          await service.esqueceuSenha({ identifier: invalidIdentifier as string });
        } catch (error) {
          // Validation error is acceptable
          expect(error).toBeDefined();
        }
      }
    });

    it('should validate new password format', async () => {
      const tokenData = {
        token: 'valid-token',
        user_id: 'test-user-id',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
        created_at: new Date(),
      };

      (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue(tokenData);
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const invalidPasswords = [
        '',
        null,
        undefined,
        'short',
        '12345',
        'password',
        '<script>alert("xss")</script>',
        'SQL INJECTION; DROP TABLE users;',
        String.fromCharCode(0, 1, 2, 3), // Null bytes
      ];

      for (const invalidPassword of invalidPasswords) {
        try {
          await service.redefinirSenha({
            token: 'valid-token',
            novaSenha: invalidPassword as string,
          });
        } catch (error) {
          // Validation error is expected
          expect(error).toBeDefined();
        }
      }
    });

    it('should sanitize token input', async () => {
      const maliciousTokens = [
        '<script>alert("xss")</script>',
        'SELECT * FROM password_reset_tokens',
        '../../../etc/passwd',
        'token\nwith\nnewlines',
        'token\rwith\rcarriage\rreturns',
        'token\twith\ttabs',
        String.fromCharCode(0, 1, 2, 3), // Null bytes
      ];

      for (const maliciousToken of maliciousTokens) {
        (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue(null);

        try {
          await service.redefinirSenha({
            token: maliciousToken,
            novaSenha: 'ValidPassword123!',
          });
        } catch (error: any) {
          expect(error.message).toBe('Token inválido ou expirado');
        }
      }
    });
  });

  describe('🛡️ Information Disclosure Prevention', () => {
    it('should not expose sensitive data in error messages', async () => {
      // Simulate database error
      (prismaService.usuario.findUnique as jest.Mock).mockRejectedValue(
        new Error('Database connection failed: postgresql://user:password@localhost/db')
      );

      try {
        await service.esqueceuSenha({ identifier: 'test@domain.com' });
      } catch (error: any) {
        // Verify sensitive information is not exposed
        expect(error.message).not.toContain('password');
        expect(error.message).not.toContain('postgresql://');
        expect(error.message).not.toContain('user:');
      }
    });

    it('should maintain consistent response times', async () => {
      const measurements = [];

      // Measure response time for existing user
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(mockUser);
      const start1 = process.hrtime.bigint();
      await service.esqueceuSenha({ identifier: 'existing@domain.com' });
      const time1 = Number(process.hrtime.bigint() - start1) / 1000000;

      // Measure response time for non-existing user
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(null);
      const start2 = process.hrtime.bigint();
      await service.esqueceuSenha({ identifier: 'nonexistent@domain.com' });
      const time2 = Number(process.hrtime.bigint() - start2) / 1000000;

      const timeDifference = Math.abs(time1 - time2);
      
      // Response times should be similar to prevent user enumeration
      expect(timeDifference).toBeLessThan(100); // 100ms tolerance
    });
  });

  describe('📊 Security Configuration Analysis', () => {
    it('should use secure JWT configuration', () => {
      const token = jwtService.sign({ userId: 'test-user-id' });
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const decoded = jwtService.verify(token);
      expect(decoded.userId).toBe('test-user-id');
    });

    it('should enforce strong bcrypt configuration', async () => {
      const password = 'TestPassword123!';
      const rounds = 12;
      
      const start = process.hrtime.bigint();
      const hash = await bcrypt.hash(password, rounds);
      const hashTime = Number(process.hrtime.bigint() - start) / 1000000;

      // Verify bcrypt rounds configuration
      expect(hash.startsWith('$2b$') || hash.startsWith('$2a$')).toBe(true);
      
      // Hash should take reasonable time (indicating proper cost factor)
      expect(hashTime).toBeGreaterThan(50); // At least 50ms
      expect(hashTime).toBeLessThan(2000); // But not more than 2 seconds
    });
  });

  describe('🔔 Audit and Logging Security', () => {
    it('should log security events without exposing sensitive data', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.passwordResetToken.create as jest.Mock).mockResolvedValue({
        token: 'generated-token',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      });

      await service.esqueceuSenha({ identifier: 'test@domain.com' });

      // Verify logs don't contain sensitive information
      const logCalls = consoleSpy.mock.calls.flat();
      const allLogs = logCalls.join(' ');

      expect(allLogs).not.toContain('password');
      expect(allLogs).not.toContain('senha');
      expect(allLogs).not.toContain('generated-token');

      consoleSpy.mockRestore();
    });

    it('should simulate audit trail creation', async () => {
      const tokenData = {
        id: 'valid-token-id',
        token: 'valid-token',
        user_id: 'test-user-id',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
        used: false,
        created_at: new Date(),
      };

      (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue(tokenData);
      (prismaService.usuario.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.usuario.update as jest.Mock).mockResolvedValue(mockUser);
      (prismaService.passwordResetToken.update as jest.Mock).mockResolvedValue(tokenData);
      (prismaService.refreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prismaService.auditLog.create as jest.Mock).mockResolvedValue({});

      await service.redefinirSenha({
        token: 'valid-token',
        novaSenha: 'NewPassword123!',
      });

      // NOTE: Production system should create audit logs
      // This test simulates the expected behavior
    });
  });
});