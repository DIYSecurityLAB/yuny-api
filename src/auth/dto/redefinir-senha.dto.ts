import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

export class RedefinirSenhaDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8, { message: 'Senha deve ter pelo menos 8 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, {
    message: 'Senha deve conter pelo menos 1 maiúscula, 1 minúscula e 1 número'
  })
  novaSenha: string;
}