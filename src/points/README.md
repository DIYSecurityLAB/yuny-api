# Sistema de Compra de Pontos YunY

## Visão Geral

Este sistema implementa a funcionalidade completa de compra de pontos YunY com integração ao AlfredPay para pagamentos PIX. O sistema utiliza arquitetura DDD (Domain-Driven Design) e Clean Architecture seguindo as melhores práticas de desenvolvimento.

## Funcionalidades Implementadas

### 1. Compra de Pontos
- **Conversão 1:1**: Cada real investido = 1 ponto YunY
- **Taxa de serviço**: 5% sobre o valor solicitado
- **Integração PIX**: Via AlfredPay com QR Code
- **Expiração**: PIX expira em 20 minutos
- **Validações**: Valores mínimos e máximos configuráveis

### 2. Controle de Saldo
- **Pontos Disponíveis**: Pontos prontos para uso
- **Pontos Pendentes**: Pontos aguardando confirmação de pagamento
- **Operações Thread-Safe**: Prevenção de condições de corrida
- **Histórico Completo**: Auditoria de todas as movimentações

### 3. Histórico de Transações
- **Rastreamento Completo**: Todas as mudanças de status registradas
- **Auditoria**: Quem fez, quando e por quê
- **Consultas Flexíveis**: Por usuário, ordem, período
- **Metadados**: Informações contextuais detalhadas

### 4. Monitoramento de Status
- **Polling Inteligente**: Consulta automática ao AlfredPay
- **Atualização Automática**: Sincronização de status
- **Tratamento de Erros**: Registros de falhas e timeouts
- **Expiração Automática**: Detecção de pedidos expirados

## Arquitetura

### Domain Layer (Domínio)
```
src/points/domain/
├── entities/          # Entidades de negócio
├── enums/            # Enumerações do domínio
├── repositories/     # Interfaces dos repositórios
└── services/         # Serviços de domínio
```

### Application Layer (Aplicação)
```
src/points/application/
├── dto/              # Objetos de transferência de dados
└── use-cases/        # Casos de uso da aplicação
```

### Infrastructure Layer (Infraestrutura)
```
src/points/infrastructure/
├── repositories/     # Implementações dos repositórios
└── services/         # Serviços de infraestrutura
```

### Presentation Layer (Apresentação)
```
src/points/presentation/
├── controllers/      # Controllers REST
└── dto/              # DTOs de entrada/saída
```

## Endpoints da API

### Criar Ordem de Compra
```http
POST /points/orders
Authorization: Bearer {token}
Content-Type: application/json

{
  "requestedAmount": 100.00,
  "paymentMethod": "PIX",
  "description": "Compra de pontos para marketplace"
}
```

**Resposta:**
```json
{
  "orderId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "userId": "user-id",
  "requestedAmount": 100.00,
  "feeAmount": 5.00,
  "totalAmount": 105.00,
  "pointsAmount": 100.00,
  "qrCode": "00020126580014br.gov.bcb.pix...",
  "qrImageUrl": "https://api.qrserver.com/...",
  "expiresAt": "2025-10-15T16:25:00Z",
  "alfredTransactionId": "alfred-tx-id"
}
```

### Consultar Status da Ordem
```http
GET /points/orders/{orderId}/status
Authorization: Bearer {token}
```

### Consultar Histórico de Transações
```http
GET /points/history?userId={id}&startDate={date}&endDate={date}&page=1&limit=20
Authorization: Bearer {token}
```

### Consultar Histórico Completo de uma Ordem
```http
GET /points/orders/{orderId}/history
Authorization: Bearer {token}
```

## Fluxo de Negócio

### 1. Criação de Pedido
1. Usuário solicita compra de pontos
2. Sistema valida dados e usuário
3. Calcula taxa de 5% sobre valor solicitado
4. Cria ordem com status PENDING
5. Cria transação de pontos PENDING
6. Adiciona pontos pendentes ao saldo
7. Integra com AlfredPay para gerar PIX
8. Registra histórico inicial
9. Retorna QR Code para pagamento

### 2. Verificação de Status
1. Sistema consulta status no AlfredPay
2. Compara com status local
3. Atualiza se houver mudança
4. Registra alterações no histórico
5. Trata expiração automática

### 3. Confirmação de Pagamento
1. AlfredPay confirma pagamento
2. Sistema converte pontos pendentes para disponíveis
3. Atualiza transação para CREDIT
4. Marca ordem como COMPLETED
5. Registra conclusão no histórico

## Banco de Dados

### Tabelas Principais

#### user_balances
- Controle de saldo de pontos por usuário
- Pontos disponíveis, pendentes e totais
- Timestamps de auditoria

#### orders
- Ordens de compra de pontos
- Valores, status, dados do pagamento
- Integração com AlfredPay

#### points_transactions
- Histórico de movimentações de pontos
- Tipos: PENDING, CREDIT, DEBIT, REFUND
- Vinculação com ordens

#### order_status_history
- Auditoria completa de mudanças
- Registro de quem, quando e por quê
- Metadados contextuais

## Configuração

### Variáveis de Ambiente
```bash
# AlfredPay
ALFRED_PAY_BASE_URL=https://api.alfredpay.com
ALFRED_PAY_API_KEY=your-api-key-here

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/yuny_db
```

### Instalação
```bash
# Instalar dependências
npm install

# Executar migrações
npx prisma migrate dev

# Iniciar aplicação
npm run start:dev
```

## Dependências Adicionais

- `decimal.js`: Precisão em cálculos monetários
- `uuid`: Geração de identificadores únicos
- `@nestjs/axios`: Requisições HTTP para AlfredPay
- `class-validator`: Validação de DTOs
- `class-transformer`: Transformação de dados

## Tratamento de Erros

### Validações de Negócio
- Valores mínimos e máximos de compra
- Usuário ativo e existente
- Prevenção de ordens duplicadas pendentes
- Verificação de saldo para operações

### Integração Externa
- Timeout de requisições (30s criação, 15s consulta)
- Retry automático para falhas temporárias
- Logs estruturados para debugging
- Fallback graceful em falhas

### Concorrência
- Transações do Prisma para operações críticas
- Locks otimistas em atualizações de saldo
- Prevenção de condições de corrida
- Consistência eventual com histórico

## Monitoramento

### Logs
- Todas as operações são logadas
- Estrutura JSON para parsing
- Níveis apropriados (INFO, WARN, ERROR)
- Context IDs para rastreamento

### Métricas
- Tempos de resposta do AlfredPay
- Taxa de sucesso/falha de operações
- Volumes de transações processadas
- Análise de padrões de uso

## Segurança

### Autenticação
- JWT tokens obrigatórios
- Validação de usuário ativo
- Rate limiting configurável

### Dados Sensíveis
- Chaves API em variáveis de ambiente
- Logs sem informações sensíveis
- Validação rigorosa de inputs
- Sanitização de outputs

## Testes

O sistema foi projetado para testabilidade com:
- Injeção de dependências limpa
- Interfaces bem definidas
- Casos de uso isolados
- Mocks para serviços externos

### Estrutura de Testes Sugerida
```
test/
├── unit/              # Testes unitários de entidades e services
├── integration/       # Testes de integração com banco
├── e2e/              # Testes end-to-end completos
└── fixtures/         # Dados de teste
```

## Próximos Passos

1. **Webhooks**: Implementar recebimento de webhooks do AlfredPay
2. **Relatórios**: Dashboard de métricas e relatórios
3. **Cache**: Redis para consultas frequentes
4. **Queue**: Processamento assíncrono de operações
5. **Notificações**: Alertas para usuários sobre status