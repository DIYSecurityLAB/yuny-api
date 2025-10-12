import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed da base de dados...');

  // Criar usuário de teste
  const hashedPassword = await bcrypt.hash('123456', 10);
  
  const testUser = await prisma.usuario.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      nome: 'Usuário Teste',
      cpf: '12345678901',
      email: 'test@example.com',
      telefone: '+5511999999999',
      senhaHash: hashedPassword,
    },
  });

  console.log('✅ Usuário de teste criado:', {
    id: testUser.user_id,
    nome: testUser.nome,
    email: testUser.email,
  });

  // Criar um segundo usuário merchant
  const merchantUser = await prisma.usuario.upsert({
    where: { email: 'merchant@example.com' },
    update: {},
    create: {
      user_id: '660e8400-e29b-41d4-a716-446655440001',
      nome: 'Merchant Teste',
      cpf: '12345678902',
      email: 'merchant@example.com',
      telefone: '+5511888888888',
      senhaHash: hashedPassword,
    },
  });

  console.log('✅ Usuário merchant criado:', {
    id: merchantUser.user_id,
    nome: merchantUser.nome,
    email: merchantUser.email,
  });

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 UUIDs para usar no CLI:');
  console.log(`   Usuário Teste: ${testUser.user_id}`);
  console.log(`   Merchant Teste: ${merchantUser.user_id}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });