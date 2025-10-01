# 🚀 Guia de Setup Completo - Yuny API

## Pré-requisitos

- **Node.js** 18+ 
- **Docker Desktop** (para PostgreSQL)
- **Git**

## 📋 Passo a Passo

### 1. Iniciar o Docker Desktop
Certifique-se de que o Docker Desktop está rodando no seu sistema.

### 2. Configurar variáveis de ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar se necessário (valores padrão já estão configurados)
```

### 3. Subir o banco PostgreSQL
```bash
docker-compose up -d postgres
```

### 4. Instalar dependências
```bash
npm install
```

### 5. Executar migrações do banco
```bash
npx prisma migrate dev --name init
```

### 6. Gerar Prisma Client
```bash
npx prisma generate
```

### 7. Executar a aplicação
```bash
# Modo desenvolvimento (recarrega automaticamente)
npm run start:dev

# Modo produção
npm run build
npm run start:prod
```

## ✅ Verificação

Se tudo estiver funcionando corretamente:

1. **API estará disponível em:** http://localhost:3000
2. **PgAdmin estará disponível em:** http://localhost:8080
   - Email: admin@yuny.com  
   - Senha: admin123

## 🧪 Testando a API

### Teste de Registro
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

### Teste de Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "joao.silva@email.com",
    "senha": "MinhaSenh@123"
  }'
```

## 🔧 Comandos Úteis

```bash
# Ver logs do banco
docker-compose logs postgres

# Acessar Prisma Studio (interface visual do banco)
npm run prisma:studio

# Resetar banco de dados
npm run db:reset

# Verificar status das migrações
npx prisma migrate status

# Gerar nova migração
npx prisma migrate dev --name nome_da_migracao
```

## 🐛 Troubleshooting

### Docker não está rodando
```bash
# Windows: Iniciar Docker Desktop
# Linux: sudo systemctl start docker
# Mac: Iniciar Docker Desktop
```

### Porta 5432 já está em uso
```bash
# Parar containers existentes
docker-compose down

# Ou mudar a porta no docker-compose.yml
ports:
  - "5433:5432"  # Usar porta 5433 ao invés de 5432
```

### Erro de conexão com banco
1. Verificar se o container está rodando: `docker ps`
2. Verificar logs: `docker-compose logs postgres`
3. Verificar se as variáveis de ambiente estão corretas no `.env`

### Prisma Client não encontrado
```bash
# Regenerar o cliente
npx prisma generate
```

## 📁 Estrutura do Projeto

```
yuny-api/
├── prisma/
│   └── schema.prisma          # Schema do banco
├── src/
│   ├── auth/                  # Módulo de autenticação
│   │   ├── dto/              # Data Transfer Objects
│   │   ├── guards/           # Guards de autenticação
│   │   ├── strategies/       # Estratégias JWT
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   └── sms.service.ts
│   ├── prisma/               # Módulo Prisma
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   ├── app.module.ts         # Módulo principal
│   └── main.ts              # Ponto de entrada
├── docker/
│   └── postgres/            # Configurações PostgreSQL
├── docs/
│   └── api-examples.md      # Exemplos da API
├── docker-compose.yml       # Configuração Docker
├── Dockerfile              # Build da aplicação
├── .env                   # Variáveis de ambiente
└── package.json          # Dependências e scripts
```

## 🎯 Próximos Passos

Após o setup, você pode:

1. **Testar todos os endpoints** usando os exemplos em `/docs/api-examples.md`
2. **Explorar o banco** via PgAdmin ou Prisma Studio  
3. **Implementar novas funcionalidades** seguindo a arquitetura existente
4. **Adicionar testes** usando Jest
5. **Implementar CI/CD** para deploy automático

## 📞 Suporte

Se encontrar problemas:
1. Verificar os logs da aplicação
2. Verificar os logs do banco: `docker-compose logs postgres`
3. Consultar a documentação do NestJS: https://nestjs.com/
4. Consultar a documentação do Prisma: https://prisma.io/