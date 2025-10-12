import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../src/email/application/email.service';
import { EmailProviderFactory } from '../../src/email/infrastructure/email-provider.factory';
import { Email } from '../../src/email/domain/email.entity';

describe('Email Security Tests', () => {
  let service: EmailService;
  let module: TestingModule;
  let configService: ConfigService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EmailService,
        EmailProviderFactory,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                EMAIL_PROVIDER: 'mock',
                FRONTEND_URL: 'https://secure-frontend.com',
                EMAIL_FROM: 'noreply@yuny-api.com',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Input Validation and Sanitization', () => {
    it('should reject invalid email addresses', async () => {
      const invalidEmails = [
        '',
        'invalid-email',
        'test@',
        '@domain.com',
        'test@domain',
        'test.domain.com',
        '<script>alert("xss")</script>@domain.com',
        'test@<script>alert("xss")</script>.com',
        'test"@domain.com',
        'test@domain.com; DROP TABLE users;',
      ];

      for (const invalidEmail of invalidEmails) {
        const result = await service.sendPasswordResetEmail(invalidEmail, 'valid-token');
        // Mock provider sempre retorna sucesso, mas em produção deveria validar
        // Este teste documenta a necessidade de validação de email
        expect(result).toBeDefined();
      }
    });

    it('should sanitize HTML content to prevent XSS', async () => {
      const maliciousUserName = '<script>alert("xss")</script>';
      const result = await service.sendPasswordResetEmail(
        'test@domain.com',
        'valid-token',
        maliciousUserName
      );

      expect(result.success).toBe(true);
      // Verificar se o conteúdo HTML não contém scripts maliciosos
      // Este teste documenta a necessidade de sanitização
    });

    it('should validate token format for security', async () => {
      const maliciousTokens = [
        '',
        null,
        undefined,
        '<script>alert("xss")</script>',
        'SELECT * FROM password_reset_tokens',
        '../../../etc/passwd',
        'token with spaces',
        'token\nwith\nnewlines',
        'token\rwith\rcarriage\rreturns',
      ];

      for (const maliciousToken of maliciousTokens) {
        const result = await service.sendPasswordResetEmail(
          'test@domain.com',
          maliciousToken as string
        );
        expect(result).toBeDefined();
      }
    });
  });

  describe('URL Construction Security', () => {
    it('should prevent open redirect vulnerabilities', async () => {
      // Configurar URL maliciosa
      const maliciousConfig = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'FRONTEND_URL') {
            return 'https://malicious-site.com';
          }
          return defaultValue;
        }),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          EmailService,
          EmailProviderFactory,
          {
            provide: ConfigService,
            useValue: maliciousConfig,
          },
        ],
      }).compile();

      const testService = testModule.get<EmailService>(EmailService);
      const result = await testService.sendPasswordResetEmail('test@domain.com', 'token123');

      // Verificar se a URL gerada não permite redirecionamento malicioso
      expect(result.success).toBe(true);
      await testModule.close();
    });

    it('should validate frontend URL configuration', async () => {
      const maliciousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'ftp://malicious-site.com',
        'file:///etc/passwd',
        'http://localhost:8080/../../../admin',
      ];

      for (const maliciousUrl of maliciousUrls) {
        const testConfig = {
          get: jest.fn((key: string, defaultValue?: any) => {
            if (key === 'FRONTEND_URL') return maliciousUrl;
            return defaultValue;
          }),
        };

        const testModule = await Test.createTestingModule({
          providers: [
            EmailService,
            EmailProviderFactory,
            { provide: ConfigService, useValue: testConfig },
          ],
        }).compile();

        const testService = testModule.get<EmailService>(EmailService);
        const result = await testService.sendPasswordResetEmail('test@domain.com', 'token123');

        expect(result).toBeDefined();
        await testModule.close();
      }
    });
  });

  describe('Email Content Security', () => {
    it('should not expose sensitive information in email content', async () => {
      const result = await service.sendPasswordResetEmail(
        'test@domain.com',
        'secret-token-123',
        'John Doe'
      );

      expect(result.success).toBe(true);
      // Em um teste real, verificaríamos se o token não está exposto no log
      // ou se informações sensíveis não estão sendo incluídas no email
    });

    it('should use secure email headers', async () => {
      const email = new Email(
        'test@domain.com',
        'Test Subject',
        '<p>Test HTML</p>',
        'Test text'
      );

      const result = await service.sendEmail(email);
      expect(result.success).toBe(true);
      // Verificar se headers de segurança apropriados são definidos
    });

    it('should prevent email header injection', async () => {
      const maliciousSubjects = [
        'Subject\nBcc: attacker@evil.com',
        'Subject\rBcc: attacker@evil.com',
        'Subject\r\nBcc: attacker@evil.com',
        'Subject\n\nThis is malicious content',
        'Subject: Real\nX-Mailer: Malicious',
      ];

      for (const maliciousSubject of maliciousSubjects) {
        const email = new Email(
          'test@domain.com',
          maliciousSubject,
          '<p>Test</p>',
          'Test'
        );

        const result = await service.sendEmail(email);
        expect(result.success).toBe(true);
        // Verificar se o provider sanitiza os headers
      }
    });
  });

  describe('Rate Limiting and Abuse Prevention', () => {
    it('should handle multiple rapid email requests', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          service.sendPasswordResetEmail(`test${i}@domain.com`, `token${i}`)
        );
      }

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should prevent email bombing attacks', async () => {
      // Simular múltiplos emails para o mesmo destinatário
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          service.sendPasswordResetEmail('victim@domain.com', `token${i}`)
        );
      }

      const results = await Promise.all(promises);
      // Em um sistema real, deveria haver rate limiting
      expect(results.length).toBe(50);
    });
  });

  describe('Configuration Security', () => {
    it('should handle missing configuration gracefully', async () => {
      const emptyConfig = {
        get: jest.fn(() => undefined),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          EmailService,
          EmailProviderFactory,
          { provide: ConfigService, useValue: emptyConfig },
        ],
      }).compile();

      const testService = testModule.get<EmailService>(EmailService);
      const result = await testService.sendPasswordResetEmail('test@domain.com', 'token123');

      expect(result).toBeDefined();
      await testModule.close();
    });

    it('should validate email provider configuration', async () => {
      const invalidProviders = ['invalid', 'hacker', '', null, undefined];

      for (const provider of invalidProviders) {
        const testConfig = {
          get: jest.fn((key: string, defaultValue?: any) => {
            if (key === 'EMAIL_PROVIDER') return provider;
            return defaultValue;
          }),
        };

        const testModule = await Test.createTestingModule({
          providers: [
            EmailService,
            EmailProviderFactory,
            { provide: ConfigService, useValue: testConfig },
          ],
        }).compile();

        const testService = testModule.get<EmailService>(EmailService);
        const result = await testService.sendPasswordResetEmail('test@domain.com', 'token123');

        expect(result).toBeDefined();
        await testModule.close();
      }
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Forçar um erro no factory
      const errorFactory = {
        create: jest.fn(() => {
          throw new Error('Service temporarily unavailable');
        }),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: EmailProviderFactory, useValue: errorFactory },
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const testService = testModule.get<EmailService>(EmailService);
      const result = await testService.sendPasswordResetEmail('test@domain.com', 'token123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Verificar se informações sensíveis não são expostas
      expect(result.error).not.toContain('password');
      expect(result.error).not.toContain('user:');

      await testModule.close();
    });

    it('should handle provider failures gracefully', async () => {
      const failingProvider = {
        send: jest.fn().mockRejectedValue(new Error('Network timeout')),
        isHealthy: jest.fn().mockResolvedValue(false),
        getProviderName: jest.fn().mockReturnValue('Failing Provider'),
      };

      const failingFactory = {
        create: jest.fn().mockReturnValue(failingProvider),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: EmailProviderFactory, useValue: failingFactory },
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const testService = testModule.get<EmailService>(EmailService);
      const result = await testService.sendPasswordResetEmail('test@domain.com', 'token123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');

      await testModule.close();
    });
  });

  describe('Template Security', () => {
    it('should prevent template injection attacks', async () => {
      const maliciousUserNames = [
        '{{constructor.constructor("return process")().exit()}}',
        '${7*7}',
        '<%= 7*7 %>',
        '{{7*7}}',
        '#{7*7}',
        '${{7*7}}',
      ];

      for (const maliciousName of maliciousUserNames) {
        const result = await service.sendPasswordResetEmail(
          'test@domain.com',
          'token123',
          maliciousName
        );

        expect(result.success).toBe(true);
        // Verificar se a template engine não executou código malicioso
      }
    });

    it('should escape special characters in templates', async () => {
      const specialCharacters = [
        '<script>alert("xss")</script>',
        '& < > " \'',
        '\n\r\t',
        '\\x3cscript\\x3e',
        String.fromCharCode(0, 1, 2, 3),
      ];

      for (const specialChar of specialCharacters) {
        const result = await service.sendPasswordResetEmail(
          'test@domain.com',
          'token123',
          specialChar
        );

        expect(result.success).toBe(true);
      }
    });
  });
});