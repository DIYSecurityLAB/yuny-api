import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { ApiKeyModule } from '../api-key/api-key.module';

@Module({
  imports: [ApiKeyModule],
  controllers: [UserController],
})
export class UserModule {}