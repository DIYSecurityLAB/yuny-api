import { IsString, IsNotEmpty } from 'class-validator';

export class EsqueceuSenhaDto {
  @IsString()
  @IsNotEmpty()
  identifier: string; // CPF, email ou telefone
}