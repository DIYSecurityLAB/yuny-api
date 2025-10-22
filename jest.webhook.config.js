module.exports = {
  displayName: 'Webhook Tests',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: [
    '<rootDir>/test/**/*webhook*.spec.ts',
    '<rootDir>/test/**/validate-webhook-signature*.spec.ts',
    '<rootDir>/test/**/process-alfred-webhook*.spec.ts',
    '<rootDir>/test/**/webhook-controller*.spec.ts',
    '<rootDir>/test/**/alfred-pay-webhook*.spec.ts'
  ],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/points/**/*webhook*.ts',
    'src/points/application/use-cases/validate-webhook-signature.use-case.ts',
    'src/points/application/use-cases/process-alfred-webhook.use-case.ts',
    'src/points/infrastructure/repositories/prisma-webhook-log.repository.ts',
    'src/points/presentation/controllers/webhook.controller.ts'
  ],
  coverageDirectory: './coverage/webhook',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/test/webhook-setup.ts'
  ],
  testTimeout: 30000, // 30 segundos para testes de performance
  maxWorkers: 2, // Limitar workers para testes de performance
  verbose: true,
  bail: false, // Continue mesmo se houver falhas
  forceExit: true, // Força saída após todos os testes
  detectOpenHandles: true // Detecta handles abertos
};