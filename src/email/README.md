# Serviço de Email Modular

Este é um serviço de email modular construído seguindo princípios de arquitetura limpa, permitindo múltiplos provedores de email e fácil extensibilidade.

## Estrutura

```
src/email/
├── domain/
│   ├── email.entity.ts       # Entidades e interfaces de domínio
│   └── email.interfaces.ts   # Contratos do domínio
├── application/
│   └── email.service.ts      # Serviço de aplicação
├── infrastructure/
│   ├── email-provider.factory.ts  # Factory para criar provedores
│   └── providers/
│       ├── mock-email.provider.ts     # Provider para desenvolvimento
│       ├── nodemailer.provider.ts     # Provider SMTP
│       └── sendgrid.provider.ts       # Provider SendGrid
└── email.module.ts           # Módulo NestJS
```

## Provedores Suportados

### 1. Mock Provider (Padrão)
- Usado para desenvolvimento
- Exibe emails no console
- Não requer configuração externa

### 2. Nodemailer Provider
- Para servidores SMTP personalizados
- Suporta Gmail, Outlook, servidores dedicados
- Requer instalação: `npm install nodemailer @types/nodemailer`

### 3. SendGrid Provider
- Serviço de email transacional
- Alta deliverability
- Requer API key do SendGrid

### 4. AWS SES Provider
- Amazon Simple Email Service
- Integração com AWS
- Em desenvolvimento

## Configuração

### Variáveis de Ambiente

```env
# Provedor de email (mock, nodemailer, sendgrid)
EMAIL_PROVIDER=mock

# Email remetente padrão
EMAIL_FROM=noreply@yuny-api.com

# URL do frontend
FRONTEND_URL=http://localhost:3000

# SMTP (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-ou-app-password

# SendGrid
SENDGRID_API_KEY=sua-api-key-do-sendgrid
```

### Usando Gmail com Nodemailer

1. Ative a autenticação de 2 fatores
2. Gere uma senha de aplicativo
3. Configure as variáveis:

```env
EMAIL_PROVIDER=nodemailer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-aplicativo
```

## Funcionalidades

### Tipos de Email Suportados

1. **Reset de Senha**
   ```typescript
   await emailService.sendPasswordResetEmail(email, token, userName);
   ```

2. **Bem-vindo**
   ```typescript
   await emailService.sendWelcomeEmail(email, userName);
   ```

3. **Verificação de Email**
   ```typescript
   await emailService.sendVerificationEmail(email, token, userName);
   ```

4. **Email Personalizado**
   ```typescript
   const email = new Email(
     'destinatario@email.com',
     'Assunto',
     '<h1>Conteúdo HTML</h1>',
     'Conteúdo texto',
     'remetente@email.com'
   );
   
   await emailService.sendEmail(email);
   ```

## Templates

Os templates HTML são gerados dinamicamente pelo serviço, incluindo:

- Design responsivo
- Estilos inline para compatibilidade
- Versões texto e HTML
- Branding consistente
- Links de ação estilizados

## Extensibilidade

### Adicionando Novo Provider

1. Crie uma classe que implementa `IEmailProvider`
2. Adicione o enum no `EmailProvider`
3. Registre na factory
4. Configure as variáveis de ambiente

Exemplo:

```typescript
export class MeuProvider implements IEmailProvider {
  async send(email: Email): Promise<EmailResult> {
    // Implementação específica
  }
  
  async isHealthy(): Promise<boolean> {
    // Verificação de saúde
  }
  
  getProviderName(): string {
    return 'Meu Provider';
  }
}
```

## Monitoramento

### Health Check

Cada provider implementa `isHealthy()` para verificar se está funcionando corretamente.

### Logs

O serviço registra:
- Tentativas de envio
- Erros de configuração
- Status de entrega
- Métricas de performance

### Tratamento de Erros

- Falhas são capturadas e retornadas em `EmailResult`
- Providers indisponíveis não quebram o sistema
- Fallback automático para mock em caso de erro

## Segurança

- Validação de configuração no startup
- Sanitização de conteúdo HTML
- Rate limiting por recipient (planejado)
- Auditoria de envios (planejado)

## Performance

- Factory pattern para reutilização de conexões
- Pool de conexões SMTP
- Retry automático em falhas temporárias (planejado)
- Queue de emails para alta demanda (planejado)

## Desenvolvimento

### Testando com Mock

Por padrão, o sistema usa o mock provider que exibe emails no console:

```
=== MOCK EMAIL PROVIDER ===
From: noreply@yuny-api.com
To: usuario@email.com
Subject: Redefinição de Senha - Yuny API
HTML Content:
<html>...</html>
========================
```

### Testando com Provedores Reais

1. Configure as variáveis de ambiente
2. Instale as dependências necessárias
3. Altere `EMAIL_PROVIDER` na configuração
4. Reinicie a aplicação

## Dependências

### Principais
- `@nestjs/config` - Configuração
- `uuid` - Geração de IDs únicos

### Opcionais
- `nodemailer` - Provider SMTP
- `@sendgrid/mail` - Provider SendGrid
- `aws-sdk` - Provider AWS SES (planejado)

## Instalação de Provedores

```bash
# Para usar Nodemailer
npm install nodemailer @types/nodemailer

# Para usar SendGrid
npm install @sendgrid/mail

# Para usar AWS SES
npm install aws-sdk
```

## Roadmap

- [ ] AWS SES Provider
- [ ] Rate limiting
- [ ] Queue de emails
- [ ] Templates customizáveis
- [ ] Webhooks de entrega
- [ ] Métricas detalhadas
- [ ] Interface de administração