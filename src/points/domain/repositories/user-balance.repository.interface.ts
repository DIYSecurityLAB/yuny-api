import { UserBalance } from '../entities';
import { Decimal } from 'decimal.js';

export interface IUserBalanceRepository {
  findByUserId(userId: string): Promise<UserBalance | null>;
  save(userBalance: UserBalance): Promise<UserBalance>;
  update(userBalance: UserBalance): Promise<UserBalance>;
  creditPoints(userId: string, amount: Decimal): Promise<UserBalance>;
  debitPoints(userId: string, amount: Decimal): Promise<UserBalance>;
  convertPendingToAvailable(userId: string, amount: Decimal): Promise<UserBalance>;
  addPendingPoints(userId: string, amount: Decimal): Promise<UserBalance>;
}