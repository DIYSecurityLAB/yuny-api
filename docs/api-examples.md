# 📡 Documentação da API - Exemplos de Request/Response

## 1. Registro de Usuário

### Request
```http
POST /api/auth/register
Content-Type: application/json

{
  "nome": "João Silva",
  "cpf": "12345678901",
  "email": "joao.silva@email.com",
  "telefone": "11987654321",
  "senha": "MinhaSenh@123"
}
```

### Response Success (201)
```json
{
  "message": "Usuário registrado com sucesso. SMS de confirmação enviado.",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "nome": "João Silva",
    "cpf": "12345678901",
    "email": "joao.silva@email.com",
    "telefone": "11987654321",
    "data_criacao": "2024-09-30T10:30:00.000Z",
    "ultimo_login": null
  }
}
```

### Response Error - CPF já existe (409)
```json
{
  "statusCode": 409,
  "message": "CPF já está em uso",
  "error": "Conflict"
}
```

### Response Error - Email já existe (409)
```json
{
  "statusCode": 409,
  "message": "Email já está em uso",
  "error": "Conflict"
}
```

### Response Error - Validação (400)
```json
{
  "statusCode": 400,
  "message": [
    "CPF deve conter exatamente 11 dígitos",
    "Email deve ter um formato válido",
    "Senha deve ter pelo menos 6 caracteres"
  ],
  "error": "Bad Request"
}
```

---

## 2. Login

### Request com CPF
```http
POST /api/auth/login
Content-Type: application/json

{
  "identifier": "12345678901",
  "senha": "MinhaSenh@123"
}
```

### Request com Email
```http
POST /api/auth/login
Content-Type: application/json

{
  "identifier": "joao.silva@email.com",
  "senha": "MinhaSenh@123"
}
```

### Response Success (200)
```json
{
  "message": "Login realizado com sucesso",
  "data": {
    "user": {
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "nome": "João Silva",
      "cpf": "12345678901",
      "email": "joao.silva@email.com",
      "telefone": "11987654321",
      "data_criacao": "2024-09-30T10:30:00.000Z",
      "ultimo_login": "2024-09-30T11:45:00.000Z"
    },
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

### Response Error - Credenciais inválidas (401)
```json
{
  "statusCode": 401,
  "message": "Credenciais inválidas",
  "error": "Unauthorized"
}
```

### Response Error - Validação (400)
```json
{
  "statusCode": 400,
  "message": [
    "CPF ou email é obrigatório",
    "Senha é obrigatória"
  ],
  "error": "Bad Request"
}
```

---

## 3. Refresh Token

### Request
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Response Success (200)
```json
{
  "message": "Token renovado com sucesso",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Response Error - Token inválido (401)
```json
{
  "statusCode": 401,
  "message": "Refresh token inválido ou expirado",
  "error": "Unauthorized"
}
```

### Response Error - Validação (400)
```json
{
  "statusCode": 400,
  "message": [
    "Refresh token é obrigatório"
  ],
  "error": "Bad Request"
}
```

---

## 4. Testando com cURL

### Registro
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João Silva",
    "cpf": "12345678901",
    "email": "joao.silva@email.com",
    "telefone": "11987654321",
    "senha": "MinhaSenh@123"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "joao.silva@email.com",
    "senha": "MinhaSenh@123"
  }'
```

### Refresh Token
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }'
```

---

## 5. Usando Access Token em Rotas Protegidas

### Request com Authorization Header
```http
GET /api/protected-route
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Exemplo com cURL
```bash
curl -X GET http://localhost:3000/api/protected-route \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 6. Estados de Error Comuns

### 400 - Bad Request
Dados de entrada inválidos ou malformados

### 401 - Unauthorized  
Token inválido, expirado ou credenciais incorretas

### 409 - Conflict
Tentativa de criar recurso que já existe (CPF/email duplicado)

### 500 - Internal Server Error
Erro interno do servidor (problema de conexão com BD, etc.)