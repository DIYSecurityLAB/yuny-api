# Yuny API

API de autenticação construída com NestJS, TypeScript, PostgreSQL e Prisma seguindo princípios de Clean Architecture e DDD.

## 🚀 Tecnologias

- **Node.js** com **TypeScript**
- **NestJS** (Framework)
- **PostgreSQL** (Banco de dados)
- **Prisma** (ORM)
- **JWT** (Autenticação)
- **bcryptjs** (Hash de senhas)
- **Docker** (Containerização)

## 📋 Funcionalidades

- ✅ Registro de usuários
- ✅ Login com CPF ou email
- ✅ Autenticação JWT (30 minutos)
- ✅ Refresh Token (7 dias)
- ✅ Hash seguro de senhas
- ✅ Validação de duplicidade
- ✅ Mock de SMS de confirmação

## 🏗️ Arquitetura

Projeto segue os princípios de:
- **Clean Architecture**
- **Domain Driven Design (DDD)**
- **SOLID**
- **Monólito Modular**

## 🐳 Configuração com Docker

### 1. Clonar e configurar
```bash
git clone <repository-url>
cd yuny-api
cp .env.example .env
```

### 2. Subir o banco de dados
```bash
docker-compose up -d postgres
```

### 3. Instalar dependências
```bash
npm install
```

### 4. Executar migrações
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Executar aplicação
```bash
# Desenvolvimento
npm run start:dev

# Produção
npm run build
npm run start:prod
```

## 📊 Banco de dados

### Acessar PgAdmin
- URL: http://localhost:8080
- Email: admin@yuny.com
- Senha: admin123

### Conectar ao PostgreSQL
- Host: postgres (interno) ou localhost (externo)
- Port: 5432
- Database: yuny_db
- Username: yuny
- Password: yuny123

## 🔧 Scripts Disponíveis

```bash
# Desenvolvimento
npm run start:dev

# Build
npm run build

# Produção
npm run start:prod

# Testes
npm run test
npm run test:e2e

# Prisma
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## 📡 API Endpoints

### Registro
```
POST /api/auth/register
```

### Login
```
POST /api/auth/login
```

### Refresh Token
```
POST /api/auth/refresh
```

## 🔐 Variáveis de Ambiente

```env
DATABASE_URL="postgresql://yuny:yuny123@localhost:5432/yuny_db?schema=public"
JWT_SECRET="sua-chave-secreta-muito-forte-aqui-2024"
JWT_EXPIRES_IN="30m"
REFRESH_TOKEN_SECRET="sua-chave-refresh-token-ainda-mais-forte-2024"
REFRESH_TOKEN_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
SMS_PROVIDER_ENABLED=false
SMS_MOCK_MODE=true
```

## 🏃‍♂️ Como Executar

1. **Clone o repositório**
2. **Configure as variáveis de ambiente**
3. **Suba o Docker Compose**: `docker-compose up -d`
4. **Instale as dependências**: `npm install`
5. **Execute as migrações**: `npx prisma migrate dev`
6. **Inicie a aplicação**: `npm run start:dev`

A API estará disponível em: http://localhost:3000

## 📝 Licença

Este projeto está sob a licença MIT.
