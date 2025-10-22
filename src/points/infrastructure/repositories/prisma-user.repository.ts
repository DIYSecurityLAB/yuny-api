import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { IUserRepository } from '../../domain/repositories';
import { User } from '../../domain/entities';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.usuario.findUnique({
      where: { user_id: id }
    });

    if (!user) {
      return null;
    }

    return this.toDomainEntity(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.usuario.findUnique({
      where: { email }
    });

    if (!user) {
      return null;
    }

    return this.toDomainEntity(user);
  }

  async save(user: User): Promise<User> {
    const created = await this.prisma.usuario.create({
      data: {
        user_id: user.id,
        nome: user.name,
        email: user.email,
        telefone: user.phone,
        cpf: '', // Será necessário adicionar CPF na entidade User se necessário
        senhaHash: '', // Será necessário adicionar senha na entidade User se necessário
        data_criacao: user.createdAt,
        ultimo_login: null
      }
    });

    return this.toDomainEntity(created);
  }

  async update(user: User): Promise<User> {
    const updated = await this.prisma.usuario.update({
      where: { user_id: user.id },
      data: {
        nome: user.name,
        email: user.email,
        telefone: user.phone,
        // data_criacao permanece o mesmo
        ultimo_login: new Date() // Atualiza último login
      }
    });

    return this.toDomainEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.usuario.delete({
      where: { user_id: id }
    });
  }

  private toDomainEntity(prismaUser: any): User {
    return new User({
      id: prismaUser.user_id,
      name: prismaUser.nome,
      email: prismaUser.email,
      phone: prismaUser.telefone,
      isActive: true, // Por padrão, consideramos usuários como ativos
      createdAt: prismaUser.data_criacao,
      updatedAt: prismaUser.ultimo_login || prismaUser.data_criacao
    });
  }
}