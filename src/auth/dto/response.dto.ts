export class UserResponseDto {
  user_id: string;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  data_criacao: Date;
  ultimo_login?: Date;
}

export class LoginResponseDto {
  user: UserResponseDto;
  access_token: string;
  refresh_token: string;
}

export class RefreshResponseDto {
  access_token: string;
}