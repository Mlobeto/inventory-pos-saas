// Common entity types matching backend Prisma models

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product extends BaseEntity {
  tenantId: string;
  name: string;
  internalCode: string;
  description?: string;
  productType: 'REVENTA' | 'PERSONALIZADO';
  currentStock: number;
  minStock: number;
  costPrice: string;
  deletedAt?: string;
}

export interface Supplier extends BaseEntity {
  tenantId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  isGeneric: boolean;
  deletedAt?: string;
}

export interface PaymentMethod extends BaseEntity {
  tenantId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface User extends BaseEntity {
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

export interface CashShift extends BaseEntity {
  tenantId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  initialAmount: string;
  finalAmountCalculated?: string;
  finalAmountDeclared?: string;
  difference?: string;
  openedBy: Pick<User, 'firstName' | 'lastName'>;
  closedBy?: Pick<User, 'firstName' | 'lastName'>;
}

export interface Sale extends BaseEntity {
  tenantId: string;
  saleNumber: string;
  status: 'COMPLETED' | 'CANCELLED' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED';
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  seller: Pick<User, 'firstName' | 'lastName'>;
}
