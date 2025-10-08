# Guia de Uso do Sistema de API Key

## Correções Implementadas

### 1. AuthController
**Antes:** Apenas autenticação básica sem API key
**Depois:** Todos os endpoints de autenticação agora requerem API key

```typescript
@Controller('auth')
@RequireApiKey() // Aplicado a todos os endpoints
export class AuthController {
  // /auth/register, /auth/login, /auth/refresh, etc.
  // Agora todos requerem API key
}
```

**Por que?** Endpoints de autenticação são pontos críticos que precisam de controle de acesso e rate limiting.

### 2. UserController
**Antes:** Apenas JWT Guard
**Depois:** Combina JWT + API Key + Rate Limiting

```typescript
@Controller('user')
export class UserController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiKeyProtected() // Adiciona API key + rate limiting
  getProfile(@Request() req) {
    // Acesso a req.user (JWT) e req.apiKeyContext (API key)
  }
}
```

## Tipos de Proteção Disponíveis

### 1. Proteção Básica com API Key
```typescript
@RequireApiKey()
```
- Valida apenas se a API key é válida
- Usado para endpoints públicos que precisam de identificação

### 2. Proteção Completa (Recomendado)
```typescript
@ApiKeyProtected()
```
- Valida API key + aplica rate limiting
- Usado para a maioria dos endpoints

### 3. Proteção com Permissões Específicas
```typescript
@RequirePermissions([MarketplacePermission.COUPON_MANAGE])
```
- Valida API key + permissões específicas
- Usado para endpoints que requerem permissões especiais

### 4. Proteção por Tipo de Usuário
```typescript
@MerchantOnly()     // Apenas comerciantes
@ConsumerOnly()     // Apenas consumidores
@PlatformOnly()     // Apenas plataforma/admin
```

### 5. Proteção por Funcionalidade
```typescript
@BulkOperation()           // Para operações em lote
@HighValueTransaction()    // Para transações de alto valor
@AnalyticsAccess()         // Para endpoints de analytics
@FinancialDataAccess()     // Para dados financeiros
```

## Cenários de Uso

### Endpoints Públicos (sem autenticação de usuário)
```typescript
@Controller('public/coupons')
export class PublicCouponsController {
  @Get('search')
  @ApiKeyProtected() // Apenas API key + rate limiting
  searchCoupons(@Request() req) {
    // req.apiKeyContext disponível
  }
}
```

### Endpoints Protegidos (com autenticação de usuário)
```typescript
@Controller('user/orders')
export class UserOrdersController {
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiKeyProtected() // JWT + API key + rate limiting
  getUserOrders(@Request() req) {
    // req.user (JWT) e req.apiKeyContext disponíveis
  }
}
```

### Endpoints Específicos por Tipo de Usuário
```typescript
@Controller('merchant/dashboard')
export class MerchantDashboardController {
  @Get('analytics')
  @UseGuards(JwtAuthGuard)
  @MerchantOnly() // JWT + API key + permissões de comerciante
  getAnalytics(@Request() req) {
    // Apenas comerciantes autenticados podem acessar
  }
}
```

## Context Disponível nos Endpoints

Quando você usa o sistema de API key, o objeto `req.apiKeyContext` fica disponível:

```typescript
interface ApiKeyContext {
  apiKeyId: string;        // ID da API key
  userId: string;          // ID do usuário dono da API key
  userType: string;        // Tipo: 'MERCHANT', 'CONSUMER', 'PLATFORM'
  tenantId?: string;       // ID do tenant (se aplicável)
  storeId?: string;        // ID da loja (para comerciantes)
  consumerId?: string;     // ID do consumidor
  marketplaceContext?: string;
  permissions: string[];   // Permissões da API key
}
```

## Rate Limiting Automático

Todos os decorators que incluem `ApiKeyProtected` aplicam rate limiting automático baseado em:
- Tipo de usuário
- Tipo de operação
- Valor da transação
- Histórico de uso

## Logs e Analytics

O sistema automaticamente registra:
- Todas as chamadas de API
- Tentativas de acesso negadas
- Estatísticas de uso
- Detecção de fraude

## Próximos Passos

1. **Testar os endpoints atualizados** com API keys válidas
2. **Revisar outros controllers** que possam precisar de proteção
3. **Configurar rate limits específicos** por tipo de operação
4. **Implementar logs de auditoria** personalizados se necessário

## Comandos para Testar

```bash
# Testar endpoint de registro (agora requer API key)
curl -X POST http://localhost:3000/auth/register \
  -H "x-api-key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# Testar perfil do usuário (JWT + API key)
curl -X GET http://localhost:3000/user/profile \
  -H "x-api-key: your-api-key-here" \
  -H "Authorization: Bearer your-jwt-token"
```