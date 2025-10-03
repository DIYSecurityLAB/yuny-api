# 🔐 Sistema de Autenticação por API Key - Marketplace de Cupons

## Visão Geral

Este sistema implementa autenticação robusta por API Key com HMAC-SHA256, permissões granulares, multi-tenant, rate limiting diferenciado e detecção de fraude em tempo real, otimizado para marketplace de cupons.

## ✨ Características Principais

- ✅ **Segurança Criptográfica**: HMAC-SHA256 para validação de secrets
- ✅ **Permissões Granulares**: Sistema baseado em roles e recursos específicos do marketplace
- ✅ **Multi-tenant**: Isolamento completo entre tenants, merchants e consumers
- ✅ **Rate Limiting Inteligente**: Limites diferenciados por tier de pagamento e tipo de usuário
- ✅ **Detecção de Fraude**: Sistema em tempo real com scoring automático
- ✅ **Auditoria Completa**: Logs detalhados para compliance financeiro
- ✅ **Webhook Security**: Validação de assinatura HMAC para webhooks
- ✅ **Geographic Restrictions**: Controle por região geográfica
- ✅ **IP Whitelisting**: Restrições por endereço IP
- ✅ **Compliance**: Suporte a LGPD, GDPR, PCI-DSS
- ✅ **CLI Management**: Ferramenta de linha de comando para administração

## 🏗️ Arquitetura

O sistema segue os princípios de **Clean Architecture**, **DDD** e **SOLID**:

```
├── domain/                 # Regras de negócio puras
│   ├── entities/          # Entidades de domínio
│   ├── enums/             # Enumerações e constantes
│   ├── repositories/      # Interfaces de repositório
│   └── services/          # Serviços de domínio
├── application/           # Casos de uso
│   └── services/          # Serviços de aplicação
├── infrastructure/        # Implementações técnicas
│   ├── repositories/      # Repositórios Prisma
│   ├── guards/           # Guards NestJS
│   └── decorators/       # Decorators customizados
└── presentation/          # Camada de apresentação
    ├── controllers/       # Controladores REST
    └── dto/              # Data Transfer Objects
```

## 🚀 Como Usar

### 1. Configuração Inicial

```bash
# Instalar dependências
npm install

# Configurar banco de dados
docker-compose up -d postgres

# Executar migrações
npx prisma migrate dev

# Gerar Prisma Client
npx prisma generate

# Iniciar aplicação
npm run start:dev
```

### 2. Gerenciamento via CLI

```bash
# Criar API key para merchant
npm run cli create "Minha Loja API" MERCHANT user-123 --store-id store-456

# Criar API key temporária para campanha
npm run cli create "Black Friday 2024" MERCHANT user-123 --expires 2024-11-30T23:59:59Z

# Listar API keys
npm run cli list user-123

# Revogar API key
npm run cli revoke api-key-id

# Rotacionar credenciais
npm run cli rotate api-key-id
```

### 3. Usando API Keys nas Aplicações

#### Formato da API Key
```
ApiKey keyId:secret
```

#### Headers Necessários
```http
x-api-key: ApiKey uuid-v4:base64-secret
Content-Type: application/json
```

#### Exemplo de Request
```bash
curl -X POST https://api.marketplace.com/api/coupons \
  -H "x-api-key: ApiKey 550e8400-e29b-41d4-a716-446655440000:dGVzdC1zZWNyZXQtaGVyZQ==" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Desconto 50%",
    "category": "electronics",
    "value": 50.00,
    "currency": "BRL"
  }'
```

## 🔒 Sistema de Permissões

### Tipos de Usuário

| Tipo | Descrição | Permissões Padrão |
|------|-----------|-------------------|
| `MERCHANT` | Lojistas/Vendedores | `coupon.create`, `coupon.manage`, `inventory.update`, `analytics.view`, `store.profile`, `revenue.read` |
| `CONSUMER` | Consumidores/Compradores | `coupon.search`, `coupon.purchase`, `coupon.redeem`, `wallet.view`, `transaction.history` |
| `PLATFORM` | Operadores da Plataforma | `marketplace.analytics`, `merchant.manage`, `consumer.support`, `system.config` |
| `WEBHOOK` | Sistemas de Webhook | `webhook.receive`, `notification.send`, `event.process` |
| `ADMIN` | Administradores | `admin.all` (todas as permissões) |
| `PARTNER` | Parceiros/Integrações | `coupon.search`, `analytics.view` |

### Permissões por Categoria

#### 🏪 Merchant Permissions
- `coupon.create` - Criar cupons
- `coupon.manage` - Gerenciar cupons existentes
- `inventory.update` - Atualizar estoque
- `analytics.view` - Visualizar analytics da loja
- `store.profile` - Gerenciar perfil da loja
- `revenue.read` - Acessar dados de receita
- `bulk.upload` - Upload em massa de cupons

#### 🛒 Consumer Permissions
- `coupon.search` - Buscar cupons
- `coupon.purchase` - Comprar cupons
- `coupon.redeem` - Resgatar cupons
- `wallet.view` - Visualizar carteira
- `transaction.history` - Histórico de transações
- `wishlist.manage` - Gerenciar lista de desejos
- `profile.update` - Atualizar perfil

#### 🏛️ Platform Permissions
- `marketplace.analytics` - Analytics da plataforma
- `merchant.manage` - Gerenciar merchants
- `consumer.support` - Suporte ao consumidor
- `system.config` - Configurações do sistema
- `fraud.detection` - Detecção de fraudes
- `compliance.audit` - Auditoria de compliance

#### 📂 Category-Specific Permissions
- `electronics.read/manage` - Eletrônicos
- `food.read/manage` - Alimentação
- `travel.read/book` - Viagem
- `fashion.read/inventory` - Moda

## 🚦 Rate Limiting

### Tiers de Rate Limiting

| Tier | Merchant | Consumer | Webhook | Admin/Platform |
|------|----------|----------|---------|----------------|
| **BASIC** | 30/min, 1K/hora, 10K/dia | 20/min, 500/hora, 5K/dia | 60/min, 2K/hora, 20K/dia | - |
| **PREMIUM** | 100/min, 5K/hora, 50K/dia | 60/min, 2K/hora, 20K/dia | 200/min, 10K/hora, 100K/dia | - |
| **ENTERPRISE** | 500/min, 20K/hora, 200K/dia | 200/min, 10K/hora, 100K/dia | 1K/min, 50K/hora, 500K/dia | - |
| **UNLIMITED** | - | - | - | Ilimitado |

### Headers de Rate Limit
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
Retry-After: 60
```

## 🛡️ Segurança e Detecção de Fraude

### Sistema de Scoring
- **IP Malicioso**: +50 pontos
- **Requisições Rápidas**: +20 pontos
- **Transação Alto Valor**: +15 pontos
- **Região de Risco**: +10 pontos
- **Erro de Autenticação**: +25 pontos

### Thresholds
- **0-30**: Baixo risco ✅
- **31-50**: Risco médio ⚠️
- **51-70**: Alto risco ❌
- **71-100**: Bloqueio automático 🚫

### Flags de Segurança
- `RAPID_REQUESTS` - Muitas requisições em pouco tempo
- `HIGH_VALUE_TRANSACTION` - Transação de alto valor
- `IP_BLOCKED` - IP na blacklist
- `REGION_BLOCKED` - Região não permitida
- `SECURITY_VIOLATION` - Violação de segurança

## 🌍 Multi-tenant e Compliance

### Isolamento de Dados
- **Tenant ID**: Isolamento por tenant/marca
- **Store ID**: Isolamento por loja (merchants)
- **Consumer ID**: Isolamento por consumidor
- **Geographic**: Isolamento por região geográfica

### Níveis de Compliance
- `BASIC` - Compliance básico
- `PCI_DSS` - Para transações com cartão
- `GDPR` - Proteção de dados EU
- `LGPD` - Proteção de dados Brasil
- `SOX` - Compliance financeiro
- `HIPAA` - Dados de saúde

## 📊 Monitoramento e Analytics

### Métricas Disponíveis
- Total de API keys ativas
- Requisições por período
- Revenue por merchant
- Taxa de erro
- Tempo de resposta médio
- Transações suspeitas
- Top merchants por volume

### Endpoints de Analytics
```http
GET /api/analytics/dashboard        # Dashboard geral
GET /api/analytics/merchant/{id}    # Analytics do merchant
GET /api/analytics/security         # Métricas de segurança
GET /api/analytics/performance      # Performance da API
```

## 🔧 Configuração Avançada

### Variáveis de Ambiente
```env
# Segurança da API Key
API_KEY_SECRET="super-secret-hmac-key"

# Rate Limiting
RATE_LIMIT_REDIS_URL="redis://localhost:6379"
RATE_LIMIT_ENABLE_BURST=true

# Detecção de Fraude
FRAUD_DETECTION_ENABLED=true
FRAUD_SCORE_THRESHOLD=70

# Compliance
COMPLIANCE_LEVEL="PCI_DSS"
GDPR_COMPLIANCE=true
LGPD_COMPLIANCE=true

# Geografico
ALLOWED_REGIONS="BR,US,EU"
GEO_IP_SERVICE_URL="https://api.geoip.com"

# Webhook
WEBHOOK_SIGNATURE_ALGORITHM="sha256"
WEBHOOK_TIMEOUT_MS=5000
```

### Configuração de Webhook
```typescript
// Validação de assinatura de webhook
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');

const isValid = crypto.timingSafeEqual(
  Buffer.from(receivedSignature, 'hex'),
  Buffer.from(signature, 'hex')
);
```

## 🎯 Exemplos de Uso por Contexto

### 🏪 Merchant - Criação de Cupom
```typescript
@Post('coupons')
@MerchantOnly()
async createCoupon(@Body() couponData: CreateCouponDto, @Request() req) {
  const { storeId } = req.apiKeyContext;
  // Merchant só pode criar cupons para sua própria loja
  return this.couponService.create(storeId, couponData);
}
```

### 🛒 Consumer - Compra de Cupom
```typescript
@Post('coupons/:id/purchase')
@HighValueTransaction()
async purchaseCoupon(@Param('id') id: string, @Request() req) {
  const { consumerId } = req.apiKeyContext;
  // Enhanced rate limiting e fraud detection
  return this.purchaseService.buyCoupon(consumerId, id);
}
```

### 📊 Analytics - Dados da Plataforma
```typescript
@Get('analytics/platform')
@PlatformOnly()
async getPlatformAnalytics(@Request() req) {
  const { tenantId } = req.apiKeyContext;
  // Isolamento por tenant
  return this.analyticsService.getPlatformData(tenantId);
}
```

### 🔗 Webhook - Notificação de Pagamento
```typescript
@Post('webhooks/payment')
@WebhookOnly()
async handlePaymentWebhook(@Body() payload: any, @Request() req) {
  // Validação automática de assinatura HMAC
  return this.webhookService.processPayment(payload);
}
```

## 🚨 Troubleshooting

### Erros Comuns

#### 401 - Unauthorized
```json
{
  "statusCode": 401,
  "message": "Invalid API key",
  "error": "Unauthorized"
}
```
**Solução**: Verificar formato da API key, secret correto, e se não expirou.

#### 403 - Forbidden
```json
{
  "statusCode": 403,
  "message": "Insufficient permissions. Required: coupon.create",
  "error": "Forbidden"
}
```
**Solução**: Verificar se a API key possui as permissões necessárias.

#### 429 - Too Many Requests
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded",
  "retryAfter": 60,
  "resetTime": "2024-01-01T12:01:00Z"
}
```
**Solução**: Aguardar o tempo indicado em `retryAfter` ou upgradar o tier.

### Logs e Debugging

```bash
# Ver logs de autenticação
tail -f logs/api-key-auth.log

# Ver logs de rate limiting
tail -f logs/rate-limit.log

# Ver logs de fraude
tail -f logs/fraud-detection.log

# Monitorar métricas
curl -H "Authorization: Bearer admin-token" \
  http://localhost:3000/api/metrics
```

## 📈 Roadmap

### Fase 1 (Atual) ✅
- [x] Sistema básico de API Key com HMAC
- [x] Permissões granulares
- [x] Rate limiting por tier
- [x] Multi-tenant support
- [x] CLI de gerenciamento

### Fase 2 (Em Desenvolvimento) 🚧
- [ ] Dashboard web para gerenciamento
- [ ] Integração com Redis para cache
- [ ] Webhook retry logic
- [ ] Métricas avançadas com Prometheus
- [ ] Alertas automáticos

### Fase 3 (Planejado) 📋
- [ ] Machine Learning para detecção de fraude
- [ ] Auto-scaling de rate limits
- [ ] API Key rotation automática
- [ ] Compliance reporting
- [ ] Multi-region deployment

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

Para suporte técnico:
- 📧 Email: dev@marketplace.com
- 💬 Slack: #api-support
- 📚 Wiki: https://wiki.marketplace.com/api-keys
- 🐛 Issues: https://github.com/marketplace/api-keys/issues