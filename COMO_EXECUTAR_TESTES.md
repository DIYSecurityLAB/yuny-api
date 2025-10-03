# 🧪 Guia de Execução dos Testes - Sistema API Key YunY

## 📋 Como Executar os Testes

### 🎯 **Comandos Disponíveis**

```bash
# 1. TODOS OS TESTES (não recomendado - muito demorado)
npm test

# 2. TESTES BÁSICOS (recomendado para começar)
npm test test/basic.spec.ts

# 3. TESTES POR CATEGORIA
npm run test:unit           # Testes unitários apenas
npm run test:integration    # Testes de integração
npm run test:e2e           # Testes end-to-end
npm run test:performance   # Testes de performance
npm run test:security      # Testes de segurança
npm run test:compliance    # Testes de compliance

# 4. TESTES COM COBERTURA
npm run test:coverage

# 5. EXECUTAR UM ARQUIVO ESPECÍFICO
npm test test/unit/api-key-management.service.spec.ts
npm test -- --testNamePattern="should create API key"
```

### 🚀 **Execução Recomendada (Passo a Passo)**

#### 1. **Primeiro, Execute o Teste Básico**
```bash
npm test test/basic.spec.ts
```
✅ **Este deve passar** - confirma que a configuração está funcionando.

#### 2. **Execute Testes Unitários (com correções)**
```bash
npm run test:unit
```
⚠️ **Estes podem falhar** - precisam dos serviços reais implementados.

#### 3. **Execute Testes de Integração**
```bash
npm run test:integration
```
⚠️ **Estes precisam do banco de dados** configurado.

#### 4. **Execute Testes E2E**
```bash
npm run test:e2e
```
🔄 **Estes precisam da aplicação completa** rodando.

### 🛠️ **Configuração Necessária**

#### **1. Banco de Dados de Teste**
```bash
# Crie um banco específico para testes
createdb yuny_test_db

# Configure as variáveis no .env.test
DATABASE_URL="postgresql://user:pass@localhost:5432/yuny_test_db"
```

#### **2. Dependências Redis (Opcional)**
```bash
# Para testes de rate limiting
REDIS_URL="redis://localhost:6379/1"
```

#### **3. Migrations de Teste**
```bash
# Execute as migrations no banco de teste
DATABASE_URL="postgresql://user:pass@localhost:5432/yuny_test_db" npx prisma migrate dev
```

### 🔧 **Por que os Testes Estão Falhando?**

#### **Problemas Identificados:**

1. **❌ Mocks Não Configurados**
   - Os testes unitários precisam de mocks para dependências
   - Repositórios e serviços externos não estão sendo mockados

2. **❌ Serviços Reais Não Implementados**
   - `ApiKeyManagementService` real precisa existir em `src/`
   - `ApiKeyValidationService` real precisa existir em `src/`
   - `RateLimitService` real precisa existir em `src/`

3. **❌ Banco de Dados Não Configurado**
   - PrismaService precisa estar configurado
   - Migrations precisam estar aplicadas
   - Dados de teste precisam ser limpos entre execuções

### 🎯 **Para Executar Testes Agora (Solução Imediata)**

#### **Opção 1: Apenas Teste Básico**
```bash
npm test test/basic.spec.ts
```

#### **Opção 2: Ignore Testes com Falhas**
```bash
npm test -- --testPathIgnorePatterns="unit|integration|e2e|performance|security|compliance"
```

#### **Opção 3: Execute um Teste Específico**
```bash
npm test -- --testNamePattern="should pass a basic test"
```

### 📊 **Status dos Testes**

| Categoria | Status | Observações |
|-----------|--------|-------------|
| ✅ Basic | **PASSANDO** | Configuração OK |
| ❌ Unit | **FALHANDO** | Precisam de mocks |
| ❌ Integration | **FALHANDO** | Precisam de BD |
| ❌ E2E | **FALHANDO** | Precisam de app |
| ❌ Performance | **FALHANDO** | Precisam de infra |
| ❌ Security | **FALHANDO** | Precisam de app |
| ❌ Compliance | **FALHANDO** | Precisam de app |

### 🔄 **Próximos Passos para Corrigir**

#### **1. Implementar Serviços Reais**
```bash
# Você precisa criar os serviços reais em src/
src/api-key/application/services/api-key-management.service.ts
src/api-key/application/services/api-key-validation.service.ts
src/api-key/application/services/rate-limit.service.ts
```

#### **2. Configurar Banco de Teste**
```bash
# Configurar PostgreSQL de teste
# Aplicar migrations
# Configurar PrismaService
```

#### **3. Corrigir Mocks nos Testes**
```bash
# Os testes unitários precisam de mocks apropriados
# Ou adaptar para usar TestingModule do NestJS
```

### 🎉 **Execução Bem-Sucedida**

Quando tudo estiver configurado corretamente, você verá:

```bash
npm run test:unit

> yuny-api@1.0.0 test:unit
> jest --config jest.unit.config.js

 PASS  test/unit/api-key-management.service.spec.ts (15.234 s)
 PASS  test/unit/api-key-validation.service.spec.ts (12.456 s)
 PASS  test/unit/rate-limit.service.spec.ts (8.123 s)

Test Suites: 3 passed, 3 total
Tests:       42 passed, 42 total
Snapshots:   0 total
Time:        35.813 s

✨ Todos os testes unitários passaram!
```

### 📚 **Recursos Adicionais**

```bash
# Watch mode (re-executa automaticamente)
npm test -- --watch

# Debug mode
npm test -- --detectOpenHandles

# Verbose output
npm test -- --verbose

# Executar em paralelo
npm test -- --maxWorkers=4
```

## 🎯 **Resumo para Uso Imediato**

**Para começar agora:**
```bash
# 1. Teste básico (deve passar)
npm test test/basic.spec.ts

# 2. Ver todos os testes disponíveis
npm test -- --listTests

# 3. Executar com informações detalhadas
npm test -- --verbose test/basic.spec.ts
```

**Os testes complexos funcionarão quando:**
- ✅ Serviços reais estiverem implementados
- ✅ Banco de dados estiver configurado  
- ✅ Dependências estiverem resolvidas