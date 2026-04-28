import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Search, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { getSuppliers, createSupplier, type Supplier, type CreateSupplierDto } from '@/modules/suppliers/api/suppliersApi';
import { searchProducts, createProduct, type Product, type CreateProductDto } from '@/modules/products/api/productsApi';
import { createPurchase, type CreatePurchaseDto } from '../api/purchasesApi';
import { getPriceTierMethods, getPriceTierLabel, type PaymentMethod } from '@/modules/payment-methods/api/paymentMethodsApi';
import { upsertProductPrices } from '@/modules/product-prices/api/productPricesApi';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { ROUTES } from '@/router/routes';
import { useForm } from 'react-hook-form';

interface LineItem {
  productId: string;
  productName: string;
  productCode: string;
  quantityOrdered: number;
  unitCost: number;
  prices: Record<string, number>; // paymentMethodId → precio
  publicMarkup: number; // % de recargo sobre CASH para calcular PUBLIC
  showPrices: boolean;
}

interface NewProductFormValues extends CreateProductDto {
  quantityOrdered: number;
  unitCost: number;
}

interface PurchaseFormValues {
  invoiceNumber: string;
  invoiceDate: string;
  notes: string;
}

export default function PurchaseNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<LineItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // — Supplier search state —
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierError, setSupplierError] = useState('');
  const supplierTimeout = useRef<ReturnType<typeof setTimeout>>();

  // — New supplier modal state —
  const [newSupplierModal, setNewSupplierModal] = useState(false);
  const [duplicateSupplier, setDuplicateSupplier] = useState<Supplier | null>(null);

  // — Product search state —
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newProductModal, setNewProductModal] = useState(false);
  const [newProdPrices, setNewProdPrices] = useState<Record<string, number>>({});
  const [newProdMarkup, setNewProdMarkup] = useState(0);
  const productTimeout = useRef<ReturnType<typeof setTimeout>>();

  const {
    register,
    handleSubmit,
  } = useForm<PurchaseFormValues>();

  const {
    register: registerProd,
    handleSubmit: handleProdSubmit,
    reset: resetProd,
    formState: { errors: prodErrors, isSubmitting: prodSubmitting },
  } = useForm<NewProductFormValues>({ defaultValues: { unit: 'UN', minStock: 0, quantityOrdered: 1, unitCost: 0 } });

  const {
    register: registerSupp,
    handleSubmit: handleSuppSubmit,
    reset: resetSupp,
    watch: watchSupp,
    formState: { errors: suppErrors },
  } = useForm<CreateSupplierDto>();

  const watchedSuppName = watchSupp('name', '');

  const createMut = useMutation({
    mutationFn: createPurchase,
  });

  const createProdMut = useMutation({
    mutationFn: createProduct,
  });

  const createSuppMut = useMutation({
    mutationFn: createSupplier,
    onSuccess: (supp) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      selectSupplier(supp);
      setNewSupplierModal(false);
      resetSupp();
      setDuplicateSupplier(null);
    },
  });

  // Cargar listas de precio al montar (solo isPriceTier=true)
  useEffect(() => {
    getPriceTierMethods().then(setPaymentMethods).catch(() => {});
  }, []);

  // Supplier search with debounce
  useEffect(() => {
    if (!supplierSearch.trim()) {
      setSupplierResults([]);
      setShowSupplierDropdown(false);
      return;
    }
    clearTimeout(supplierTimeout.current);
    supplierTimeout.current = setTimeout(async () => {
      const res = await getSuppliers({ search: supplierSearch, limit: 8 });
      setSupplierResults(res.data);
      setShowSupplierDropdown(true);
    }, 300);
    return () => clearTimeout(supplierTimeout.current);
  }, [supplierSearch]);

  // Duplicate check when name changes in supplier modal (debounced)
  useEffect(() => {
    if (!watchedSuppName?.trim()) { setDuplicateSupplier(null); return; }
    const t = setTimeout(async () => {
      const res = await getSuppliers({ search: watchedSuppName, limit: 3 });
      const exact = res.data.find(
        (s) => s.name.toLowerCase() === watchedSuppName.toLowerCase(),
      );
      setDuplicateSupplier(exact ?? null);
    }, 400);
    return () => clearTimeout(t);
  }, [watchedSuppName]);

  function selectSupplier(s: Supplier) {
    setSelectedSupplier(s);
    setSupplierSearch(s.name);
    setShowSupplierDropdown(false);
    setSupplierError('');
  }

  function clearSupplier() {
    setSelectedSupplier(null);
    setSupplierSearch('');
    setSupplierError('');
  }

  function openNewSupplierModal() {
    resetSupp({ name: supplierSearch });
    setDuplicateSupplier(null);
    setNewSupplierModal(true);
    setShowSupplierDropdown(false);
  }

  // Product search with debounce
  useEffect(() => {
    if (!productSearch.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    clearTimeout(productTimeout.current);
    productTimeout.current = setTimeout(async () => {
      const results = await searchProducts(productSearch);
      setSearchResults(results);
      setShowDropdown(true);
    }, 300);
    return () => clearTimeout(productTimeout.current);
  }, [productSearch]);

  function openNewProductModal(barcode?: string) {
    resetProd({ unit: 'UN', minStock: 0, barcode: barcode ?? '', quantityOrdered: 1, unitCost: 0 });
    setNewProdPrices({});
    setNewProdMarkup(0);
    setNewProductModal(true);
    setShowDropdown(false);
  }

  function addItem(product: Product) {
    setShowDropdown(false);
    setProductSearch('');
    const existing = items.findIndex((i) => i.productId === product.id);
    if (existing >= 0) {
      setItems((prev) =>
        prev.map((it, idx) => idx === existing ? { ...it, quantityOrdered: it.quantityOrdered + 1 } : it),
      );
      return;
    }
    // Pre-cargar precios existentes del producto
    const existingPrices: Record<string, number> = {};
    for (const pp of product.productPrices ?? []) {
      existingPrices[pp.paymentMethod.id] = parseFloat(pp.price as unknown as string);
    }
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productCode: product.internalCode,
        quantityOrdered: 1,
        unitCost: 0,
        prices: existingPrices,
        publicMarkup: 0,
        showPrices: true,
      },
    ]);
  }

  function addItemFull(product: Product, qty: number, cost: number, prices: Record<string, number>, markup: number) {
    setShowDropdown(false);
    setProductSearch('');
    const existing = items.findIndex((i) => i.productId === product.id);
    if (existing >= 0) {
      setItems((prev) =>
        prev.map((it, idx) => idx === existing ? { ...it, quantityOrdered: it.quantityOrdered + qty } : it),
      );
      return;
    }
    const hasPrices = Object.values(prices).some((v) => v > 0);
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productCode: product.internalCode,
        quantityOrdered: qty,
        unitCost: cost,
        prices,
        publicMarkup: markup,
        showPrices: hasPrices,
      },
    ]);
  }

  function updateModalPrice(methodId: string, value: number) {
    setNewProdPrices((prev) => {
      const updated = { ...prev, [methodId]: value };
      const cashMethod = paymentMethods.find((m) => m.code === 'CASH');
      const publicMethod = paymentMethods.find((m) => m.code === 'PUBLIC');
      if (cashMethod && publicMethod && methodId === cashMethod.id && newProdMarkup > 0) {
        updated[publicMethod.id] = parseFloat((value * (1 + newProdMarkup / 100)).toFixed(2));
      }
      return updated;
    });
  }

  function updateModalMarkup(markup: number) {
    setNewProdMarkup(markup);
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH');
    const publicMethod = paymentMethods.find((m) => m.code === 'PUBLIC');
    if (cashMethod && publicMethod) {
      const cashPrice = newProdPrices[cashMethod.id] ?? 0;
      if (cashPrice > 0 && markup > 0) {
        setNewProdPrices((prev) => ({
          ...prev,
          [publicMethod.id]: parseFloat((cashPrice * (1 + markup / 100)).toFixed(2)),
        }));
      }
    }
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: 'quantityOrdered' | 'unitCost', value: number) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  function updateItemPrice(idx: number, methodId: string, value: number) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const updatedPrices = { ...it.prices, [methodId]: value };
      // Si se actualiza el precio CASH y hay markup definido, recalcular PUBLIC
      const cashMethod = paymentMethods.find((m) => m.code === 'CASH');
      const publicMethod = paymentMethods.find((m) => m.code === 'PUBLIC');
      if (cashMethod && publicMethod && methodId === cashMethod.id && it.publicMarkup > 0) {
        updatedPrices[publicMethod.id] = parseFloat((value * (1 + it.publicMarkup / 100)).toFixed(2));
      }
      return { ...it, prices: updatedPrices };
    }));
  }

  function updateItemMarkup(idx: number, markup: number) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const cashMethod = paymentMethods.find((m) => m.code === 'CASH');
      const publicMethod = paymentMethods.find((m) => m.code === 'PUBLIC');
      if (cashMethod && publicMethod && markup > 0) {
        const cashPrice = it.prices[cashMethod.id] ?? 0;
        const publicPrice = cashPrice > 0
          ? parseFloat((cashPrice * (1 + markup / 100)).toFixed(2))
          : (it.prices[publicMethod.id] ?? 0);
        return { ...it, publicMarkup: markup, prices: { ...it.prices, [publicMethod.id]: publicPrice } };
      }
      return { ...it, publicMarkup: markup };
    }));
  }

  function toggleItemPrices(idx: number) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, showPrices: !it.showPrices } : it));
  }

  const subtotal = items.reduce((acc, i) => acc + i.quantityOrdered * i.unitCost, 0);

  function onSubmit(values: PurchaseFormValues) {
    if (!selectedSupplier) { setSupplierError('Seleccioná o creá un proveedor'); return; }
    if (items.length === 0) return;
    const dto: CreatePurchaseDto = {
      supplierId: selectedSupplier.id,
      invoiceNumber: values.invoiceNumber || undefined,
      invoiceDate: values.invoiceDate || undefined,
      notes: values.notes || undefined,
      items: items.map((i) => ({ productId: i.productId, quantityOrdered: i.quantityOrdered, unitCost: i.unitCost })),
    };
    createMut.mutate(dto, {
      onSuccess: async (data) => {
        // Guardar precios de cada producto
        await Promise.all(
          items.map((item) =>
            upsertProductPrices(
              item.productId,
              Object.entries(item.prices)
                .filter(([, price]) => price > 0)
                .map(([methodId, price]) => ({ paymentMethodId: methodId, price })),
            ),
          ),
        );
        queryClient.invalidateQueries({ queryKey: ['purchases'] });
        navigate(ROUTES.PURCHASES_DETAIL.replace(':id', data.id));
      },
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Nueva factura de compra</h1>
        <Button variant="secondary" onClick={() => navigate(ROUTES.PURCHASES)}>Cancelar</Button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Cabecera */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Datos de la compra</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Proveedor — buscador */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
              {selectedSupplier ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-brand-500 rounded-md bg-brand-50 text-sm">
                  <span className="flex-1 font-medium text-gray-900">{selectedSupplier.name}</span>
                  {selectedSupplier.taxId && <span className="text-gray-500 text-xs">{selectedSupplier.taxId}</span>}
                  <button type="button" onClick={clearSupplier} className="text-gray-400 hover:text-red-500 ml-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative flex rounded-md shadow-sm">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar proveedor por nombre o CUIT..."
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      onFocus={() => supplierSearch && setShowSupplierDropdown(true)}
                      className="block w-full border border-gray-300 rounded-r-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  {supplierError && <p className="mt-1 text-xs text-red-600">{supplierError}</p>}
                  {showSupplierDropdown && (
                    <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-52 overflow-y-auto">
                      {supplierResults.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500">
                          Sin resultados.{' '}
                          <button type="button" className="text-brand-600 font-medium hover:underline" onClick={openNewSupplierModal}>
                            Crear "{supplierSearch}"
                          </button>
                        </div>
                      ) : (
                        <>
                          {supplierResults.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between text-sm"
                              onClick={() => selectSupplier(s)}
                            >
                              <span className="font-medium text-gray-900">{s.name}</span>
                              {s.taxId && <span className="text-gray-400 text-xs font-mono">{s.taxId}</span>}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-brand-600 font-medium border-t border-gray-100"
                            onClick={openNewSupplierModal}
                          >
                            + Crear nuevo proveedor
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Input label="Número de factura" {...register('invoiceNumber')} placeholder="Ej: A-0001-00002345" />
            <Input label="Fecha de factura" type="date" {...register('invoiceDate')} />
            <Input label="Notas" {...register('notes')} placeholder="Observaciones opcionales" />
          </div>
        </div>

        {/* Ítems */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Artículos</h2>

          <div className="relative max-w-sm">
            <Input
              placeholder="Buscar producto por nombre, código o código de barras..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const query = productSearch.trim();
                  if (!query) return;
                  // Búsqueda inmediata para no depender del debounce (útil con lector de código de barras)
                  clearTimeout(productTimeout.current);
                  const results = await searchProducts(query);
                  if (results.length === 1) {
                    addItem(results[0]);
                  } else if (results.length > 1) {
                    setSearchResults(results);
                    setShowDropdown(true);
                  } else {
                    openNewProductModal(query);
                  }
                }
              }}
              leftAddon={<Search className="h-4 w-4" />}
            />
            {showDropdown && (
              <div className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-52 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    Sin resultados.{' '}
                    <button type="button" className="text-brand-600 font-medium hover:underline" onClick={() => openNewProductModal(productSearch.trim())}>
                      Crear nuevo producto
                    </button>
                  </div>
                ) : (
                  <>
                    {searchResults.map((p) => (
                      <button key={p.id} type="button" className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between text-sm" onClick={() => addItem(p)}>
                        <span className="font-medium text-gray-900">{p.name}</span>
                        <span className="text-gray-400 font-mono text-xs">{p.internalCode}</span>
                      </button>
                    ))}
                    <button type="button" className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm text-brand-600 font-medium border-t border-gray-100" onClick={() => openNewProductModal()}>
                      + Crear nuevo producto
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {items.length > 0 ? (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.productId} className="rounded-lg border border-gray-200 overflow-hidden">
                  {/* Fila principal */}
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3 bg-white">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{item.productName}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.productCode}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-500 whitespace-nowrap">Cantidad</label>
                      <input
                        type="number" min="1" value={item.quantityOrdered}
                        onChange={(e) => updateItem(idx, 'quantityOrdered', Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-center"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-gray-500 whitespace-nowrap">Costo unit.</label>
                      <input
                        type="number" min="0" step="0.01" value={item.unitCost}
                        onChange={(e) => updateItem(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                        className="w-28 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-right"
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                      ${(item.quantityOrdered * item.unitCost).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleItemPrices(idx)}
                        className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 px-2 py-1 rounded border border-brand-200 hover:bg-brand-50 transition-colors"
                        title="Precios de venta"
                      >
                        {item.showPrices ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        Precios
                      </button>
                      <button type="button" onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-600 transition-colors p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Fila de precios por lista (expandible) */}
                  {item.showPrices && paymentMethods.length > 0 && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Precios de venta por lista</p>

                      {/* Markup Efectivo → Otros */}
                      <div className="flex items-center gap-2 mb-3">
                        <label className="text-xs text-gray-500 whitespace-nowrap">% recargo Efectivo → Otros:</label>
                        <div className="relative w-24">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="0"
                            value={item.publicMarkup || ''}
                            onChange={(e) => updateItemMarkup(idx, parseFloat(e.target.value) || 0)}
                            className="w-full pr-6 pl-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-right"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                        </div>
                        <span className="text-xs text-gray-400">Calcula automáticamente Público Otros</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {paymentMethods.map((method) => (
                          <div key={method.id}>
                            <label className="block text-xs text-gray-500 mb-0.5">{getPriceTierLabel(method)}</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0,00"
                                value={item.prices[method.id] ?? ''}
                                onChange={(e) => updateItemPrice(idx, method.id, parseFloat(e.target.value) || 0)}
                                className="w-full pl-5 pr-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-right"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Total */}
              <div className="flex justify-end px-4 py-2">
                <span className="text-sm font-semibold text-gray-700 mr-4">Total</span>
                <span className="text-base font-bold text-gray-900">
                  ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-lg py-10 text-center text-sm text-gray-400">
              Buscá un producto arriba para agregarlo a la compra
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button type="submit" isLoading={createMut.isPending} disabled={items.length === 0} leftIcon={<Plus className="h-4 w-4" />}>
            Guardar factura de compra
          </Button>
        </div>
      </form>

      {/* Modal nuevo proveedor */}
      <Modal isOpen={newSupplierModal} onClose={() => { setNewSupplierModal(false); setDuplicateSupplier(null); resetSupp(); }} title="Nuevo proveedor" size="md">
        <form onSubmit={handleSuppSubmit((values) => createSuppMut.mutate(values))} className="space-y-4">
          <Input label="Nombre *" error={suppErrors.name?.message} {...registerSupp('name', { required: 'Requerido' })} />

          {duplicateSupplier && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-yellow-800">Ya existe un proveedor con ese nombre</p>
                <p className="text-yellow-700 mt-0.5">"{duplicateSupplier.name}"</p>
                <button
                  type="button"
                  className="mt-1.5 text-brand-600 font-medium hover:underline"
                  onClick={() => { selectSupplier(duplicateSupplier); setNewSupplierModal(false); resetSupp(); setDuplicateSupplier(null); }}
                >
                  Seleccionar este proveedor
                </button>
              </div>
            </div>
          )}

          <Input label="CUIT / DNI" {...registerSupp('taxId')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Teléfono" {...registerSupp('phone')} />
            <Input label="Email" type="email" {...registerSupp('email')} />
          </div>
          <Input label="Dirección" {...registerSupp('address')} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setNewSupplierModal(false); setDuplicateSupplier(null); resetSupp(); }}>Cancelar</Button>
            <Button type="submit" isLoading={createSuppMut.isPending}>Crear proveedor</Button>
          </div>
        </form>
      </Modal>

      {/* Modal nuevo producto */}
      <Modal isOpen={newProductModal} onClose={() => { setNewProductModal(false); resetProd({ unit: 'UN', minStock: 0, quantityOrdered: 1, unitCost: 0 }); setNewProdPrices({}); setNewProdMarkup(0); }} title="Nuevo producto" size="md">
        <form
          onSubmit={handleProdSubmit(async (values) => {
            const { quantityOrdered, unitCost, ...productDto } = values;
            const prod = await createProdMut.mutateAsync(productDto);
            addItemFull(prod, quantityOrdered, unitCost, newProdPrices, newProdMarkup);
            // Guardar precios del nuevo producto
            const pricesToSave = Object.entries(newProdPrices).filter(([, p]) => p > 0).map(([methodId, price]) => ({ paymentMethodId: methodId, price }));
            if (pricesToSave.length > 0) {
              await upsertProductPrices(prod.id, pricesToSave);
            }
            setNewProductModal(false);
            resetProd({ unit: 'UN', minStock: 0, quantityOrdered: 1, unitCost: 0 });
            setNewProdPrices({});
            setNewProdMarkup(0);
          })}
          className="space-y-4"
        >
          <Input label="Nombre *" error={prodErrors.name?.message} {...registerProd('name', { required: 'Requerido' })} />
          <Input
            label="Código de barras"
            placeholder="Escaneá con el lector o escribí manualmente"
            {...registerProd('barcode')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unidad" {...registerProd('unit')} />
            <Input label="Stock mínimo" type="number" min="0" {...registerProd('minStock', { valueAsNumber: true })} />
          </div>

          {/* Cantidad y costo para esta compra */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Para esta compra</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                <input
                  type="number"
                  min="1"
                  {...registerProd('quantityOrdered', { valueAsNumber: true, min: 1 })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-center"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Costo unitario</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    {...registerProd('unitCost', { valueAsNumber: true })}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-right"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Precios de venta por lista */}
          {paymentMethods.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Precios de venta por lista</p>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-gray-500 whitespace-nowrap">% recargo Efectivo → Otros:</label>
                <div className="relative w-24">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={newProdMarkup || ''}
                    onChange={(e) => updateModalMarkup(parseFloat(e.target.value) || 0)}
                    className="w-full pr-6 pl-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-right"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <div key={method.id}>
                    <label className="block text-xs text-gray-500 mb-0.5">{getPriceTierLabel(method)}</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={newProdPrices[method.id] ?? ''}
                        onChange={(e) => updateModalPrice(method.id, parseFloat(e.target.value) || 0)}
                        className="w-full pl-5 pr-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => { setNewProductModal(false); setNewProdPrices({}); setNewProdMarkup(0); }}>Cancelar</Button>
            <Button type="submit" isLoading={prodSubmitting || createProdMut.isPending}>Crear y agregar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
