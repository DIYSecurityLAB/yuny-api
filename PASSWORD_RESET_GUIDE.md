# 🔐 Sistema de Redefinição de Senha - Yuny API

## 📋 Funcionalidades Implementadas

### ✅ **Esqueceu Senha**
- Endpoint: `POST /api/auth/esqueceu-senha`
- Aceita CPF, email ou telefone como identificador
- Gera token único com expiração de 15 minutos
- Invalida tokens anteriores do usuário
- Envia email com link de redefinição (mock em desenvolvimento)
- Rate limiting implícito por segurança

### ✅ **Redefinir Senha**
- Endpoint: `POST /api/auth/redefinir-senha`
- Valida token (não expirado, não usado)
- Valida força da nova senha
- Atualiza senha com hash bcrypt seguro
- Marca token como usado
- Revoga todos refresh tokens (logout forçado)

## 🚀 Como Usar

### **1. Solicitar Reset de Senha**

```bash
curl -X POST http://localhost:3000/api/auth/esqueceu-senha \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "usuario@email.com"
  }'
```

**Resposta:**
```json
{
  "message": "Se o usuário existir, um email será enviado com as instruções."
}
```

### **2. Redefinir Senha com Token**

```bash
curl -X POST http://localhost:3000/api/auth/redefinir-senha \
  -H "Content-Type: application/json" \
  -d '{
    "token": "seu-token-recebido-por-email",
    "novaSenha": "MinhaNovaSenh@123"
  }'
```

**Resposta:**
```json
{
  "message": "Senha redefinida com sucesso. Faça login com sua nova senha."
}
```

## 🗄️ **Estrutura do Banco**

### **Tabela: password_reset_tokens**
```sql
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES usuarios(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMP(6) NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP(6) DEFAULT NOW()
);
```

### **Tabela: password_reset_attempts** *(Para auditoria)*
```sql
CREATE TABLE password_reset_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMP(6) DEFAULT NOW()
);
```

## 🔒 **Aspectos de Segurança**

### **Validação de Senha**
- Mínimo 8 caracteres
- Pelo menos 1 letra maiúscula
- Pelo menos 1 letra minúscula  
- Pelo menos 1 número
- Caracteres especiais opcionais

### **Segurança do Token**
- Token UUID v4 único
- Expiração de 15 minutos
- Uso único (invalidado após uso)
- Tokens anteriores invalidados

### **Rate Limiting**
- Mesmo comportamento para usuário existente/inexistente
- Logs de tentativas para monitoramento
- Invalidação automática de sessões

## 📧 **Sistema de Email**

### **Modo Desenvolvimento**
- Emails são logados no console
- Configuração: `EMAIL_MOCK_MODE=true`

### **Modo Produção**
- Implementar provedor real (SendGrid, AWS SES, etc.)
- Configurar SMTP no `.env`

## 🌍 **Variáveis de Ambiente**

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@yuny.com
EMAIL_PASS=senha-do-email
EMAIL_FROM=noreply@yuny.com
EMAIL_MOCK_MODE=true

# Frontend URL
FRONTEND_URL=http://localhost:3001

# Password Reset Configuration
PASSWORD_RESET_TOKEN_EXPIRES_MINUTES=15
```

## 🧪 **Testando o Sistema**

### **1. Criar um usuário**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João Silva",
    "cpf": "12345678901",
    "email": "joao@email.com",
    "telefone": "11999887766",
    "senha": "MinhaSenh@123"
  }'
```

### **2. Solicitar reset**
```bash
curl -X POST http://localhost:3000/api/auth/esqueceu-senha \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "joao@email.com"
  }'
```

### **3. Verificar logs**
O token será exibido nos logs da aplicação:
```
📧 [MOCK EMAIL] Reset de senha para: joa***
📧 [MOCK EMAIL] Nome: João Silva
📧 [MOCK EMAIL] Link: http://localhost:3001/reset-password?token=seu-token-aqui
```

### **4. Usar o token**
```bash
curl -X POST http://localhost:3000/api/auth/redefinir-senha \
  -H "Content-Type: application/json" \
  -d '{
    "token": "token-copiado-dos-logs",
    "novaSenha": "NovaSenha@456"
  }'
```

## 📊 **Logs e Monitoramento**

### **Logs Importantes**
- Solicitações de reset (com identificador mascarado)
- Tentativas de redefinição
- Tokens inválidos/expirados
- Sucessos e falhas

### **Exemplo de Logs**
```
[AuthService] Solicitação de reset de senha para: joa***
[AuthService] Reset de senha solicitado com sucesso para usuário: uuid-do-usuario
[AuthService] Tentativa de redefinição de senha com token: abcd1234***
[AuthService] Senha redefinida com sucesso para usuário: uuid-do-usuario
```

## 🎯 **Próximos Passos**

1. ✅ Sistema básico implementado
2. 🔄 Implementar rate limiting avançado
3. 🔄 Adicionar auditoria completa
4. 🔄 Integrar provedor de email real
5. 🔄 Adicionar notificações SMS
6. 🔄 Dashboard de monitoramento

---

**Sistema integrado de forma simples e eficiente na estrutura existente do AuthModule! 🚀**