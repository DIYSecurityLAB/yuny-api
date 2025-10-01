import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'CPF ou email é obrigatório' })
  identifier: string; // CPF ou email

  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  senha: string;
}