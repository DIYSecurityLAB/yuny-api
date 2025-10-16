export class User {
  public readonly id: string;
  public readonly name: string;
  public readonly email: string;
  public readonly phone: string;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: {
    id: string;
    name: string;
    email: string;
    phone: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;

    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new Error('User ID is required');
    }

    if (!this.name || this.name.trim().length === 0) {
      throw new Error('User name is required');
    }

    if (!this.email || this.email.trim().length === 0) {
      throw new Error('User email is required');
    }

    if (!this.phone || this.phone.trim().length === 0) {
      throw new Error('User phone is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      throw new Error('Invalid email format');
    }
  }

  public isActiveUser(): boolean {
    return this.isActive;
  }
}