import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AppModule } from '../../src/app.module';

export class TestHelper {
  private static app: INestApplication;
  private static prismaService: PrismaService;

  static async createTestApp(): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    this.app = moduleFixture.createNestApplication();
    this.prismaService = this.app.get(PrismaService);
    
    await this.app.init();
    return this.app;
  }

  static async closeTestApp(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }
  }

  static async cleanDatabase(): Promise<void> {
    if (this.prismaService) {
      // Clean in reverse order of dependencies
      await this.prismaService.apiKeyUsageLog.deleteMany();
      await this.prismaService.apiKeyRateLimit.deleteMany();
      await this.prismaService.apiKeyPermission.deleteMany();
      await this.prismaService.apiKey.deleteMany();
      await this.prismaService.refreshToken.deleteMany();
      await this.prismaService.usuario.deleteMany();
    }
  }

  static getPrismaService(): PrismaService {
    return this.prismaService;
  }

  static getApp(): INestApplication {
    return this.app;
  }
}