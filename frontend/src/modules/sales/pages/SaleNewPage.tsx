import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search, Plus, Minus, Trash2, CheckCircle, AlertCircle,
  ShoppingCart, Clock, ChevronDown, Printer,
} from 'lucide-react';
import { createSale, type Sale } from '../api/salesApi';
import { searchProducts, type Product } from '@/modules/products/api/productsApi';
import {
  getPaymentMethods,
  getPriceTierMethods,
  getPriceTierLabel,
} from '@/modules/payment-methods/api/paymentMethodsApi';
import { getCurrentShift } from '@/modules/cash-shifts/api/cashShiftsApi';
import { useAuthStore } from '@/core/auth/authStore';
import { printThermalReceipt } from '../utils/thermalReceipt';
import { Button } from '@/shared/components/ui/Button';
import { ROUTES } from '@/router/routes';

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface CartItem {
  productId: string;
  internalCode: string;
  name: string;
  unit: string;
  currentStock: number;
  quantity: number;
  productPrices: Array<{ paymentMethodId: string; price: string }>;
  lineDiscount: number;
}

interface PaymentRow {
  rowId: string;
  methodId: string;
  amount: string;
  ref: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function getPrice(item: CartItem, priceListId: string): number {
  const pp = item.productPrices.find((p) => p.paymentMethodId === priceListId);
  return pp ? parseFloat(pp.price) : 0;
}

let rowSeq = 0;
const newRowId = () => `pr-${++rowSeq}`;

// ─── Pantalla sin turno ───────────────────────────────────────────────────────
function NoShiftScreen() {
  return (
    <div className="max-w-sm mx-auto mt-20 text-center">
      <div className="w-14 h-14 rounded-full bg-yellow-50 flex items-center justify-center mx-auto mb-4">
        <Clock className="h-7 w-7 text-yellow-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Sin turno de caja abierto</h2>
      <p className="text-sm text-gray-500 mb-6">
        Debés abrir un turno de caja antes de registrar ventas.
      </p>
      <Link to={ROUTES.CASH_SHIFTS}>
        <Button size="lg">Ir a Caja</Button>
      </Link>
    </div>
  );
}

// ─── Pantalla de éxito ────────────────────────────────────────────────────────
function SuccessScreen({
  sale,
  onNew,
  cashierName,
  discountAmount,
}: {
  sale: Sale;
  onNew: () => void;
  cashierName: string;
  discountAmount: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="max-w-sm mx-auto mt-20 text-center">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="h-9 w-9 text-green-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">¡Venta registrada!</h2>
      <p className="text-5xl font-black text-brand-600 my-4">#{sale.saleNumber}</p>
      <p className="text-lg text-gray-700 mb-1">
        Total:{' '}
        <strong>
          ${parseFloat(sale.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </strong>
      </p>
      <div className="flex flex-col gap-3 items-center mt-8">
        <Button
          size="lg"
          leftIcon={<Printer className="h-4 w-4" />}
          onClick={() => printThermalReceipt({ sale, cashierName, discountAmount })}
          className="w-full"
        >
          Imprimir recibo
        </Button>
        <div className="flex gap-3 w-full">
          <Button size="lg" onClick={onNew} className="flex-1">
            Nueva venta
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate(ROUTES.SALES)} className="flex-1">
            Ver lista
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal POS ─────────────────────────────────────────────────────
export default function SaleNewPage() {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const cashierName = authUser ? `${authUser.firstName} ${authUser.lastName}` : 'Cajero';

  // Estado del formulario
  const [priceListId, setPriceListId] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([
    { rowId: newRowId(), methodId: '', amount: '', ref: '' },
  ]);
  const [globalDiscount, setGlobalDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [formError, setFormError] = useState('');

  // Búsqueda de productos
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const methodsInitialized = useRef(false);
  // Lector de código de barras: cuando Enter se dispara antes que el debounce
  const pendingAddRef = useRef(false);
  const addToCartRef = useRef<((p: Product) => void) | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 320);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: currentShift, isLoading: shiftLoading } = useQuery({
    queryKey: ['cash-shift-current'],
    queryFn: getCurrentShift,
  });

  const { data: allMethods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: getPaymentMethods,
    enabled: !!currentShift,
  });

  const { data: priceTierMethods = [] } = useQuery({
    queryKey: ['price-tier-methods'],
    queryFn: getPriceTierMethods,
    enabled: !!currentShift,
  });

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['products-search', debouncedQuery],
    queryFn: () => searchProducts(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  // Métodos de pago disponibles para cobrar (no son listas de precio, salvo CASH)
  const paymentMethods = allMethods.filter((m) => !m.isPriceTier || m.code === 'CASH');

  // Auto-seleccionar CASH como lista de precios por defecto
  useEffect(() => {
    if (priceTierMethods.length > 0 && !priceListId) {
      const cashMethod = priceTierMethods.find((m) => m.code === 'CASH') ?? priceTierMethods[0];
      setPriceListId(cashMethod.id);
    }
  }, [priceTierMethods, priceListId]);

  useEffect(() => {
    if (paymentMethods.length > 0 && !methodsInitialized.current) {
      methodsInitialized.current = true;
      const cashMethod =
        paymentMethods.find((m) => m.code === 'CASH') ?? paymentMethods[0];
      setPayments([{ rowId: newRowId(), methodId: cashMethod.id, amount: '', ref: '' }]);
    }
  }, [paymentMethods]);

  // Auto-agregar cuando el lector termina su búsqueda (1 resultado)
  useEffect(() => {
    if (!pendingAddRef.current) return;
    if (searching) return; // esperar a que termine la query
    pendingAddRef.current = false;
    if (searchResults.length === 1) {
      addToCartRef.current?.(searchResults[0]);
    }
  }, [searchResults, searching]);

  // Cuando cambia la lista de precios, ajustar el método de cobro por defecto
  useEffect(() => {
    if (!priceListId || paymentMethods.length === 0) return;
    const selectedTier = priceTierMethods.find((m) => m.id === priceListId);
    if (!selectedTier) return;

    let defaultCode: string;
    if (selectedTier.code === 'VENDEDOR') {
      defaultCode = 'CREDIT_ACCOUNT';
    } else {
      defaultCode = 'CASH';
    }
    const defaultMethod =
      paymentMethods.find((m) => m.code === defaultCode) ?? paymentMethods[0];

    setPayments([{ rowId: newRowId(), methodId: defaultMethod.id, amount: '', ref: '' }]);
  }, [priceListId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cálculos ────────────────────────────────────────────────────────────────
  const selectedPriceTier = priceTierMethods.find((m) => m.id === priceListId);
  const priceListCode = selectedPriceTier?.code ?? '';

  const cartSubtotal = cart.reduce((acc, item) => {
    const price = getPrice(item, priceListId);
    return acc + price * item.quantity - item.lineDiscount;
  }, 0);

  const discount = parseFloat(globalDiscount) || 0;
  const totalAmount = Math.max(0, cartSubtotal - discount);
  const totalPaid = payments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
  const remaining = totalAmount - totalPaid;
  const hasChange = totalPaid > totalAmount + 0.005;

  // ─── Acciones del carrito ─────────────────────────────────────────────────────
  // Mantener ref actualizada para evitar stale closure en effects
  addToCartRef.current = addToCart;

  function addToCart(product: Product) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id);
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          internalCode: product.internalCode,
          name: product.name,
          unit: product.unit,
          currentStock: product.currentStock,
          quantity: 1,
          productPrices: product.productPrices.map((pp) => ({
            paymentMethodId: pp.paymentMethod.id,
            price: pp.price,
          })),
          lineDiscount: 0,
        },
      ];
    });
    setSearchQuery('');
    setFormError('');
    searchRef.current?.focus();
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)),
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  // ─── Acciones de pago ─────────────────────────────────────────────────────────
  function addPaymentRow() {
    setPayments((prev) => [
      ...prev,
      { rowId: newRowId(), methodId: paymentMethods[0]?.id ?? '', amount: '', ref: '' },
    ]);
  }

  function updatePayment(rowId: string, field: keyof PaymentRow, value: string) {
    setPayments((prev) =>
      prev.map((p) => (p.rowId === rowId ? { ...p, [field]: value } : p)),
    );
  }

  function removePaymentRow(rowId: string) {
    setPayments((prev) => prev.filter((p) => p.rowId !== rowId));
  }

  function fillRemaining(rowId: string) {
    const othersPaid = payments
      .filter((p) => p.rowId !== rowId)
      .reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    const fill = Math.max(0, totalAmount - othersPaid);
    if (fill > 0) {
      setPayments((prev) =>
        prev.map((p) => (p.rowId === rowId ? { ...p, amount: fill.toFixed(2) } : p)),
      );
    }
  }

  // ─── Mutation ─────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: createSale,
    onSuccess: (sale) => {
      setCompletedSale(sale);
      queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Error al registrar la venta';
      setFormError(msg);
    },
  });

  function handleSubmit() {
    setFormError('');
    if (!priceListId) { setFormError('Seleccioná una lista de precios'); return; }
    if (cart.length === 0) { setFormError('Agregá al menos un producto al carrito'); return; }

    const hasNoPrice = cart.some((item) => getPrice(item, priceListId) === 0);
    if (hasNoPrice) {
      setFormError('Algunos productos no tienen precio para la lista seleccionada');
      return;
    }

    const validPayments = payments.filter(
      (p) => p.methodId && parseFloat(p.amount) > 0,
    );
    if (validPayments.length === 0) { setFormError('Registrá al menos un pago'); return; }
    if (remaining > 0.01) { setFormError(`Falta cobrar ${fmt(remaining)}`); return; }

    createMut.mutate({
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: getPrice(item, priceListId),
        unitCost: 0,
        discountAmount: item.lineDiscount || undefined,
        appliedPriceListCode: priceListCode,
      })),
      payments: validPayments.map((p) => ({
        paymentMethodId: p.methodId,
        amount: parseFloat(p.amount),
        reference: p.ref || undefined,
      })),
      notes: notes || undefined,
      discountAmount: discount || undefined,
    });
  }

  function resetForm() {
    setCart([]);
    setGlobalDiscount('');
    setNotes('');
    setCompletedSale(null);
    setFormError('');
    setSearchQuery('');
    methodsInitialized.current = false;
    setPayments([
      {
        rowId: newRowId(),
        methodId: paymentMethods.find((m) => m.code === 'CASH')?.id ?? paymentMethods[0]?.id ?? '',
        amount: '',
        ref: '',
      },
    ]);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (shiftLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-gray-400">Cargando...</div>
      </div>
    );
  }

  if (!currentShift) return <NoShiftScreen />;
  if (completedSale)
    return (
      <SuccessScreen
        sale={completedSale}
        onNew={resetForm}
        cashierName={cashierName}
        discountAmount={parseFloat(globalDiscount) || 0}
      />
    );

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Nueva venta</h1>

        {/* Selector de lista de precios */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 hidden sm:block">Lista de precios:</span>
          <div className="relative">
            <select
              value={priceListId}
              onChange={(e) => setPriceListId(e.target.value)}
              className="appearance-none bg-brand-50 border border-brand-200 text-brand-800 text-sm font-semibold rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="">Seleccionar...</option>
              {priceTierMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {getPriceTierLabel(m)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-600 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── Layout dos columnas ── */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 lg:items-start">
        {/* ─── Columna izquierda: búsqueda ─── */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Campo de búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (searchResults.length === 1) {
                  addToCart(searchResults[0]);
                } else if (searchQuery.length >= 2) {
                  // Lector de barras: forzar búsqueda inmediata y auto-agregar si 1 resultado
                  setDebouncedQuery(searchQuery);
                  pendingAddRef.current = true;
                }
              }}
              placeholder="Buscar por nombre, código o código de barras... (Enter para agregar si hay 1 resultado)"
              className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white shadow-sm"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Resultados de búsqueda */}
          {debouncedQuery.length >= 2 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {searchResults.length === 0 && !searching ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  Sin resultados para "{debouncedQuery}"
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {searchResults.map((product) => {
                    const priceEntry = product.productPrices.find(
                      (pp) => pp.paymentMethod.id === priceListId,
                    );
                    const hasPrice = !!priceEntry && parseFloat(priceEntry.price) > 0;
                    const priceDisplay = hasPrice
                      ? `$${parseFloat(priceEntry!.price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                      : 'Sin precio';
                    const outOfStock = product.currentStock <= 0;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        disabled={!hasPrice || outOfStock}
                        onClick={() => addToCart(product)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-brand-50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{product.internalCode}</p>
                        </div>
                        <div className="text-right ml-4 flex-shrink-0">
                          <p
                            className={`text-sm font-bold ${
                              hasPrice ? 'text-gray-900' : 'text-gray-400'
                            }`}
                          >
                            {priceDisplay}
                          </p>
                          <p
                            className={`text-xs mt-0.5 ${
                              outOfStock
                                ? 'text-red-500 font-medium'
                                : product.currentStock <= product.minStock
                                ? 'text-yellow-600'
                                : 'text-gray-400'
                            }`}
                          >
                            {outOfStock ? 'Sin stock' : `Stock: ${product.currentStock} ${product.unit}`}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Estado vacío */}
          {debouncedQuery.length < 2 && cart.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 py-20 text-center">
              <ShoppingCart className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Buscá un producto para comenzar</p>
              {!priceListId && (
                <p className="text-xs text-yellow-600 mt-2">
                  ↑ Seleccioná una lista de precios primero
                </p>
              )}
            </div>
          )}
        </div>

        {/* ─── Columna derecha: carrito + pagos ─── */}
        <div className="w-full lg:w-80 xl:w-96 lg:flex-shrink-0 space-y-3">
          {/* Carrito */}
          {cart.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Carrito</span>
                <span className="text-xs text-gray-400">
                  {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
                </span>
              </div>

              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {cart.map((item) => {
                  const unitPrice = getPrice(item, priceListId);
                  const lineTotal = unitPrice * item.quantity - item.lineDiscount;
                  const noPrice = unitPrice === 0 && priceListId;

                  return (
                    <div key={item.productId} className="px-4 py-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 pr-2 min-w-0">
                          <p
                            className={`text-sm font-medium leading-tight truncate ${
                              noPrice ? 'text-red-500' : 'text-gray-900'
                            }`}
                          >
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-400">{item.internalCode}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.productId)}
                          className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        {/* Qty stepper */}
                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateQty(item.productId, item.quantity - 1)}
                            className="px-2 py-1.5 hover:bg-gray-50 text-gray-500"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateQty(item.productId, parseInt(e.target.value) || 1)
                            }
                            className="w-10 text-center text-sm border-x border-gray-200 py-1.5 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateQty(item.productId, item.quantity + 1)}
                            className="px-2 py-1.5 hover:bg-gray-50 text-gray-500"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Precio */}
                        <div className="text-right">
                          {noPrice ? (
                            <span className="text-xs text-red-500 font-medium">Sin precio</span>
                          ) : (
                            <>
                              <p className="text-sm font-bold text-gray-900">{fmt(lineTotal)}</p>
                              <p className="text-xs text-gray-400">
                                {fmt(unitPrice)} × {item.quantity}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Totales */}
          {cart.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              {/* Descuento global */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500 flex-shrink-0 w-24">Descuento:</label>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={globalDiscount}
                    onChange={(e) => setGlobalDiscount(e.target.value)}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>{fmt(cartSubtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-red-500">
                  <span>Descuento</span>
                  <span>-{fmt(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="font-bold text-gray-900 text-base">Total</span>
                <span className="text-2xl font-black text-brand-700">{fmt(totalAmount)}</span>
              </div>
            </div>
          )}

          {/* Cobros */}
          {cart.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">Cobros</span>
              </div>
              <div className="p-4 space-y-2">
                {payments.map((row) => (
                  <div key={row.rowId} className="flex gap-2 items-center">
                    <select
                      value={row.methodId}
                      onChange={(e) => updatePayment(row.rowId, 'methodId', e.target.value)}
                      className="flex-1 border border-gray-300 rounded-md text-sm px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-0"
                    >
                      <option value="">Método...</option>
                      {paymentMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>

                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => updatePayment(row.rowId, 'amount', e.target.value)}
                        onFocus={() => {
                          if (!row.amount && remaining > 0.005) fillRemaining(row.rowId);
                        }}
                        placeholder="0"
                        className="w-full pl-5 pr-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    {payments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentRow(row.rowId)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addPaymentRow}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 mt-1"
                >
                  <Plus className="h-3 w-3" /> Agregar método de pago
                </button>

                {/* Balance restante / cambio */}
                {totalAmount > 0 && (
                  <div
                    className={`flex justify-between text-sm font-semibold pt-2 border-t border-gray-100 ${
                      Math.abs(remaining) < 0.01
                        ? 'text-green-600'
                        : remaining > 0
                        ? 'text-red-600'
                        : 'text-yellow-600'
                    }`}
                  >
                    <span>
                      {Math.abs(remaining) < 0.01 ? '✓ Listo' : remaining > 0 ? 'Pendiente' : 'Cambio'}
                    </span>
                    {Math.abs(remaining) > 0.01 && <span>{fmt(Math.abs(remaining))}</span>}
                    {hasChange && <span>{fmt(Math.abs(remaining))}</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {formError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Notas */}
          {cart.length > 0 && (
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none bg-white"
              placeholder="Notas opcionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}

          {/* Botón confirmar – sticky en mobile, normal en desktop */}
          <div className="sticky bottom-0 pb-2 pt-1 bg-transparent lg:static lg:pb-0 lg:pt-0">
            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0 || !priceListId}
              isLoading={createMut.isPending}
              onClick={handleSubmit}
            >
              Confirmar venta · {fmt(totalAmount)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
