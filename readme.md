# 🚀 Yuny API - Sistema Completo de Autenticação e API Keys

API robusta de autenticação construída com **NestJS**, **TypeScript**, **PostgreSQL** e **Prisma**, seguindo princípios de **Clean Architecture**, **DDD** e implementando sistema avançado de **API Keys** com **rate limiting** e **detecção de fraude**.

---

## 📋 Índice

- [🚀 Visão Geral](#-visão-geral)
- [🏗️ Arquitetura](#-arquitetura)
- [🔧 Instalação e Configuração](#-instalação-e-configuração)
- [📡 API Endpoints](#-api-endpoints)
- [🔐 Sistema de API Keys](#-sistema-de-api-keys)
- [🛡️ Segurança](#-segurança)
- [🧪 Testes](#-testes)
- [📖 Documentação Adicional](#-documentação-adicional)

---

## 🚀 Visão Geral

### Tecnologias

- **Node.js 18+** com **TypeScript**
- **NestJS 10** (Framework)
- **PostgreSQL** (Banco de dados)
- **Prisma** (ORM)
- **JWT** (Autenticação)
- **bcryptjs** (Hash de senhas)
- **Docker** (Containerização)
- **Jest** (Testes)

### Funcionalidades Principais

#### ✅ Autenticação Completa
- Registro de usuários com validação
- Login com CPF, email ou telefone
- JWT tokens (30 minutos) + Refresh tokens (7 dias)
- Sistema de reset de senha com tokens seguros
- Hash seguro de senhas (bcrypt cost 12)

#### ✅ Sistema de API Keys Avançado
- Autenticação HMAC-SHA256
- Rate limiting inteligente por tier
- Permissões granulares por tipo de usuário
- Detecção de fraude em tempo real
- Multi-tenant com isolamento completo
- Suporte a webhooks com assinatura

#### ✅ Segurança Enterprise
- Validação de entrada rigorosa
- Prevenção de ataques (brute force, XSS, SQL injection)
- Logs de auditoria completos
- Compliance (LGPD, GDPR, PCI-DSS)
- IP whitelisting e restrições geográficas

---

## 🏗️ Arquitetura

### Princípios Aplicados
- **Clean Architecture** - Separação clara de responsabilidades
- **Domain Driven Design (DDD)** - Modelagem focada no domínio
- **SOLID** - Princípios de design orientado a objetos
- **Monólito Modular** - Organização em módulos independentes

### Estrutura de Módulos

```
src/
├── auth/                   # Módulo de Autenticação
│   ├── dto/               # Data Transfer Objects
│   ├── guards/            # Guards JWT
│   ├── strategies/        # Estratégias de autenticação
│   └── auth.service.ts    # Lógica de autenticação
├── user/                  # Módulo de Usuários
├── api-key/               # Módulo de API Keys
│   ├── domain/           # Entidades e regras de negócio
│   ├── application/      # Casos de uso
│   ├── infrastructure/   # Implementações técnicas
│   └── presentation/     # Controllers e DTOs
├── email/                # Módulo de Email
└── prisma/              # Módulo Prisma
```

---

## 🔧 Instalação e Configuração

### Pré-requisitos
- **Node.js 18+**
- **Docker Desktop**
- **Git**

### 1. Clone e Configure
```bash
git clone https://github.com/DIYSecurityLAB/yuny-api.git
cd yuny-api
cp .env.example .env
```

### 2. Configure Variáveis de Ambiente
```env
# Banco de Dados
DATABASE_URL="postgresql://yuny:yuny123@localhost:5432/yuny_db?schema=public"

# JWT
JWT_SECRET="sua-chave-secreta-muito-forte-aqui-2024"
JWT_EXPIRES_IN="30m"
REFRESH_TOKEN_SECRET="sua-chave-refresh-token-ainda-mais-forte-2024"
REFRESH_TOKEN_EXPIRES_IN="7d"

# Aplicação
PORT=3000
NODE_ENV=development

# Email (Opcional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@yuny.com
EMAIL_PASS=senha-do-email
EMAIL_FROM=noreply@yuny.com
EMAIL_MOCK_MODE=true

# Frontend
FRONTEND_URL=http://localhost:3001

# SMS (Mock)
SMS_PROVIDER_ENABLED=false
SMS_MOCK_MODE=true
```

### 3. Executar Setup Completo
```bash
# Subir banco PostgreSQL
docker-compose up -d postgres

# Instalar dependências
npm install

# Executar migrações
npx prisma migrate dev --name init

# Gerar Prisma Client
npx prisma generate

# Executar aplicação
npm run start:dev
```

### 4. Verificar Instalação
- **API:** http://localhost:3000
- **PgAdmin:** http://localhost:8080 (admin@yuny.com / admin123)

---

## 📡 API Endpoints

### 🔑 Autenticação (Requer API Key)

Todos os endpoints de autenticação requerem header `x-api-key`.

#### Registro de Usuário
```http
POST /api/auth/register
x-api-key: sua-api-key-aqui
Content-Type: application/json

{
  "nome": "João Silva",
  "cpf": "12345678901",
  "email": "joao.silva@email.com", 
  "telefone": "11987654321",
  "senha": "MinhaSenh@123"
}
```

**Resposta (201):**
```json
{
  "message": "Usuário registrado com sucesso. SMS de confirmação enviado.",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "nome": "João Silva",
    "cpf": "12345678901",
    "email": "joao.silva@email.com",
    "telefone": "11987654321",
    "data_criacao": "2024-10-08T10:30:00.000Z",
    "ultimo_login": null
  }
}
```

#### Login
```http
POST /api/auth/login
x-api-key: sua-api-key-aqui
Content-Type: application/json

{
  "identifier": "joao.silva@email.com", // CPF, email ou telefone
  "senha": "MinhaSenh@123"
}
```

**Resposta (200):**
```json
{
  "message": "Login realizado com sucesso",
  "data": {
    "user": {
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "nome": "João Silva",
      "email": "joao.silva@email.com"
    },
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "uuid-refresh-token"
  }
}
```

#### Refresh Token
```http
POST /api/auth/refresh
x-api-key: sua-api-key-aqui
Content-Type: application/json

{
  "refreshToken": "uuid-refresh-token"
}
```

#### Esqueceu Senha
```http
POST /api/auth/esqueceu-senha
x-api-key: sua-api-key-aqui
Content-Type: application/json

{
  "identifier": "joao.silva@email.com"
}
```

#### Redefinir Senha
```http
POST /api/auth/redefinir-senha
x-api-key: sua-api-key-aqui
Content-Type: application/json

{
  "token": "token-recebido-por-email",
  "novaSenha": "NovaSenha@456"
}
```

### 👤 Usuário (Requer JWT + API Key)

#### Perfil do Usuário
```http
GET /api/user/profile
x-api-key: sua-api-key-aqui
Authorization: Bearer jwt-token
```

**Resposta (200):**
```json
{
  "message": "Perfil do usuário autenticado",
  "user": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "nome": "João Silva",
    "email": "joao.silva@email.com"
  },
  "apiKeyContext": {
    "apiKeyId": "api-key-id",
    "userId": "user-id",
    "userType": "CONSUMER",
    "permissions": ["coupon.search", "coupon.purchase"]
  }
}
```

---

## 🔐 Sistema de API Keys

### Gerenciamento de API Keys (Requer JWT)

#### Criar API Key
```http
POST /api/api-keys
Authorization: Bearer jwt-token
Content-Type: application/json

{
  "name": "Minha App Mobile",
  "userType": "CONSUMER",
  "permissions": ["coupon.search", "coupon.purchase"],
  "rateLimitTier": "BASIC",
  "expiresAt": "2024-12-31T23:59:59Z" // opcional
}
```

#### Listar API Keys
```http
GET /api/api-keys
Authorization: Bearer jwt-token
```

#### Obter Estatísticas de Uso
```http
GET /api/api-keys/:id/usage-stats
Authorization: Bearer jwt-token
```

#### Revogar API Key
```http
DELETE /api/api-keys/:id/revoke
Authorization: Bearer jwt-token
```

#### Rotacionar API Key
```http
POST /api/api-keys/:id/rotate
Authorization: Bearer jwt-token
```

### CLI de API Keys

```bash
# Criar API key
npm run cli create "Nome da API Key" CONSUMER user-id

# Listar API keys
npm run cli list user-id

# Revogar API key
npm run cli revoke api-key-id

# Rotacionar API key
npm run cli rotate api-key-id

# Merchant com loja
npm run cli create "Loja XYZ" MERCHANT user-id --store-id store-123

# API key temporária
npm run cli create "Campanha Black Friday" MERCHANT user-id --expires 2024-11-30T23:59:59Z
```

### Endpoints de Marketplace (Exemplos)

#### Buscar Cupons (Consumer)
```http
GET /api/marketplace/coupons
x-api-key: consumer-api-key
```

#### Criar Cupom (Merchant)
```http
POST /api/marketplace/coupons
x-api-key: merchant-api-key
Content-Type: application/json

{
  "name": "Desconto 50%",
  "description": "Promoção especial",
  "value": 50.00,
  "category": "electronics"
}
```

#### Analytics (Merchant)
```http
GET /api/marketplace/analytics/merchant/dashboard
x-api-key: merchant-api-key
```

#### Carteira (Consumer)
```http
GET /api/marketplace/consumer/wallet
x-api-key: consumer-api-key
```

#### Webhook
```http
POST /api/webhooks/payment-confirmation
x-api-key: webhook-api-key
Content-Type: application/json

{
  "eventId": "payment-123",
  "amount": 100.00,
  "status": "confirmed"
}
```

---

## 🛡️ Segurança

### Rate Limiting por Tier

| Tier | Por Minuto | Por Hora | Por Dia |
|------|------------|----------|---------|
| **BASIC** | 30 | 1.000 | 10.000 |
| **PREMIUM** | 100 | 5.000 | 50.000 |
| **ENTERPRISE** | 500 | 20.000 | 200.000 |
| **UNLIMITED** | ∞ | ∞ | ∞ |

### Tipos de Usuário e Permissões

#### MERCHANT
- `coupon.create` - Criar cupons
- `coupon.manage` - Gerenciar cupons
- `inventory.update` - Atualizar estoque
- `analytics.view` - Ver analytics
- `revenue.read` - Dados de receita

#### CONSUMER
- `coupon.search` - Buscar cupons
- `coupon.purchase` - Comprar cupons
- `wallet.view` - Ver carteira
- `transaction.history` - Histórico

#### PLATFORM
- `marketplace.analytics` - Analytics globais
- `merchant.manage` - Gerenciar merchants
- `system.config` - Configurações

### Headers de Rate Limit
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```

### Proteção Implementada
- ✅ Hash bcrypt (cost 12)
- ✅ Validação de entrada rigorosa
- ✅ Prevenção de SQL Injection
- ✅ Proteção XSS
- ✅ Rate limiting inteligente
- ✅ Detecção de fraude
- ✅ Logs de auditoria
- ✅ IP whitelisting
- ✅ Restrições geográficas

---

## 🧪 Testes

### Executar Testes

```bash
# Todos os testes
npm run test

# Testes unitários
npm run test:unit

# Testes de integração
npm run test:integration

# Testes E2E
npm run test:e2e

# Testes de performance
npm run test:performance

# Testes de segurança
npm run test:security

# Coverage
npm run test:coverage
```

### Suíte de Testes Implementada
- **600+ cenários de teste**
- **Unitários:** Serviços e validações
- **Integração:** Fluxos completos
- **E2E:** Jornadas de usuário
- **Performance:** Carga e stress
- **Segurança:** Vulnerabilidades

---

## 🔧 Scripts Disponíveis

```bash
# Desenvolvimento
npm run start:dev        # Desenvolvimento com watch
npm run start:debug      # Modo debug

# Build e Produção
npm run build            # Build da aplicação
npm run start:prod       # Executar em produção

# Banco de Dados
npm run prisma:generate  # Gerar Prisma Client
npm run prisma:migrate   # Executar migrações
npm run prisma:studio    # Interface visual do banco
npm run db:reset         # Resetar banco

# API Keys CLI
npm run cli create "Nome" TIPO user-id
npm run cli list user-id
npm run cli revoke api-key-id
npm run cli rotate api-key-id

# Qualidade de Código
npm run lint             # ESLint
npm run format           # Prettier
```

---

## 🚀 Deploy

### Docker Production

```bash
# Build da imagem
docker build -t yuny-api .

# Executar com Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Variáveis de Produção

```env
NODE_ENV=production
DATABASE_URL="postgresql://user:pass@host:5432/db"
JWT_SECRET="chave-super-segura-512-bits"
EMAIL_MOCK_MODE=false
# ... outras configurações
```

---

## 📖 Documentação Adicional

### Arquivos de Documentação
- [`PASSWORD_RESET_GUIDE.md`](./PASSWORD_RESET_GUIDE.md) - Sistema de reset de senha
- [`SECURITY_ANALYSIS_REPORT.md`](./SECURITY_ANALYSIS_REPORT.md) - Análise de segurança
- [`TESTES_IMPLEMENTADOS.md`](./TESTES_IMPLEMENTADOS.md) - Documentação dos testes
- [`docs/api-key-system.md`](./docs/api-key-system.md) - Sistema de API Keys
- [`docs/api-examples.md`](./docs/api-examples.md) - Exemplos de API

### Ferramentas de Desenvolvimento
- **PgAdmin:** http://localhost:8080
- **Prisma Studio:** `npm run prisma:studio`
- **Logs:** Disponíveis no console da aplicação

---

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

---

## 📞 Suporte

- **Issues:** https://github.com/DIYSecurityLAB/yuny-api/issues
- **Documentação:** Consulte os arquivos em `/docs`
- **Logs:** Verificar console da aplicação para debug

---

## 📝 Licença

Este projeto está sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

**Yuny API - Sistema robusto, seguro e escalável para autenticação e gerenciamento de API Keys! 🚀**
