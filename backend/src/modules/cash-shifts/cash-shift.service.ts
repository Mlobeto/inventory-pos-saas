import { CashShiftStatus, Prisma, SaleReturnType, SaleStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/database';

type Db = Prisma.TransactionClient | typeof prisma;

export interface ShiftPaymentBreakdownItem {
  paymentMethodId: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  _sum: { amount: Decimal };
}

export interface ShiftTotals {
  /** Cobros de ventas activas, sin contar el crédito por cambio (virtual) */
  totalSales: Decimal;
  /** Cobros en efectivo de ventas activas */
  cashSales: Decimal;
  totalExpenses: Decimal;
  /** Reintegros de dinero por devoluciones procesadas en el turno */
  totalRefunds: Decimal;
  exchangeCreditTotal: Decimal;
  /** Efectivo físico esperado en caja */
  calculatedCash: Decimal;
  /** Apertura + todos los cobros - gastos - reintegros (incluye métodos que no son efectivo) */
  calculatedFinal: Decimal;
  paymentBreakdown: ShiftPaymentBreakdownItem[];
}

/**
 * Calcula los totales de un turno a partir de los datos vigentes.
 *
 * Reglas:
 * - Las ventas anuladas no cuentan.
 * - El crédito por cambio es virtual: no mueve dinero real.
 * - Solo el efectivo entra al saldo físico de caja.
 * - Los reintegros por devolución salen del efectivo de caja.
 */
export async function computeShiftTotals(
  db: Db,
  shiftId: string,
  tenantId: string,
  initialAmount: Decimal | string,
): Promise<ShiftTotals> {
  const paymentWhere = {
    cashShiftId: shiftId,
    tenantId,
    sale: { status: { not: SaleStatus.CANCELLED } },
  };

  const [paymentGroups, expensesAgg, refundsAgg, methods] = await Promise.all([
    db.salePayment.groupBy({
      by: ['paymentMethodId'],
      where: paymentWhere,
      _sum: { amount: true },
    }),
    db.cashExpense.aggregate({
      where: { cashShiftId: shiftId, tenantId },
      _sum: { amount: true },
    }),
    db.saleReturn.aggregate({
      where: { cashShiftId: shiftId, tenantId, type: SaleReturnType.REFUND },
      _sum: { totalAmount: true },
    }),
    db.paymentMethod.findMany({
      where: { tenantId },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const paymentBreakdown: ShiftPaymentBreakdownItem[] = paymentGroups.map((pg) => {
    const method = methods.find((m) => m.id === pg.paymentMethodId);
    return {
      paymentMethodId: pg.paymentMethodId,
      paymentMethodCode: method?.code ?? '',
      paymentMethodName: method?.name ?? '',
      _sum: { amount: pg._sum.amount ?? new Decimal(0) },
    };
  });

  const amountFor = (code: string): Decimal =>
    paymentBreakdown.find((b) => b.paymentMethodCode === code)?._sum.amount ?? new Decimal(0);

  const totalPayments = paymentBreakdown.reduce(
    (acc, b) => acc.add(b._sum.amount),
    new Decimal(0),
  );
  const exchangeCreditTotal = amountFor('EXCHANGE_CREDIT');
  const cashSales = amountFor('CASH');
  const totalSales = totalPayments.sub(exchangeCreditTotal);
  const totalExpenses = expensesAgg._sum.amount ?? new Decimal(0);
  const totalRefunds = refundsAgg._sum.totalAmount ?? new Decimal(0);

  const opening = new Decimal(initialAmount);
  const calculatedCash = opening.add(cashSales).sub(totalExpenses).sub(totalRefunds);
  const calculatedFinal = opening.add(totalSales).sub(totalExpenses).sub(totalRefunds);

  return {
    totalSales,
    cashSales,
    totalExpenses,
    totalRefunds,
    exchangeCreditTotal,
    calculatedCash,
    calculatedFinal,
    paymentBreakdown,
  };
}

interface ClosedShiftArqueo {
  id: string;
  status: CashShiftStatus;
  finalAmountDeclared: Decimal | null;
  finalAmountCalculated: Decimal | null;
}

/**
 * Alinea el arqueo guardado de un turno cerrado con los totales vigentes.
 * Sin esto, anular una venta después del cierre deja un saldo esperado
 * que ya no se corresponde con los movimientos del turno.
 */
export async function syncClosedShiftArqueo(
  shift: ClosedShiftArqueo,
  totals: ShiftTotals,
): Promise<void> {
  if (shift.status !== CashShiftStatus.CLOSED || shift.finalAmountDeclared === null) return;
  if (shift.finalAmountCalculated?.equals(totals.calculatedCash)) return;

  await prisma.cashShift.update({
    where: { id: shift.id },
    data: {
      finalAmountCalculated: totals.calculatedCash,
      difference: new Decimal(shift.finalAmountDeclared).sub(totals.calculatedCash),
    },
  });
}

/** Recalcula el arqueo de un turno cerrado a partir de su id. */
export async function recalculateClosedShift(shiftId: string): Promise<void> {
  const shift = await prisma.cashShift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      initialAmount: true,
      finalAmountDeclared: true,
      finalAmountCalculated: true,
    },
  });

  if (!shift || shift.status !== CashShiftStatus.CLOSED || shift.finalAmountDeclared === null) {
    return;
  }

  const totals = await computeShiftTotals(prisma, shift.id, shift.tenantId, shift.initialAmount);
  await syncClosedShiftArqueo(shift, totals);
}
