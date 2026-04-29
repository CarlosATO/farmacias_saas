import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShoppingCart, Search, Plus, Trash2, ShieldAlert, FlaskConical,
  Stethoscope, CreditCard, X, Keyboard, MapPin, Loader2, Package, Barcode, ArrowUpCircle, Wallet
} from 'lucide-react';
import {
  fetchPharmacyProducts, fetchPrescriptions, createCashMovement, createSaleWithItems, fetchInventoryStock, fetchOpenPosSession, fetchPricesByWarehouse
} from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';
import CheckoutModal from '../components/CheckoutModal';

export default function PuntoDeVenta() {
  const { activeWarehouse } = useSucursal();
  const [products, setProducts] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [validationModal, setValidationModal] = useState({ isOpen: false, type: null, product: null });
  const [modalInput, setModalInput] = useState('');
  const [selectedPrescription, setSelectedPrescription] = useState('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [quickCashModal, setQuickCashModal] = useState({ open: false, amount: '', reason: '' });
  const [activeSession, setActiveSession] = useState(null);
  const searchInputRef = useRef(null);
  const qtyRefs = useRef({});   // refs para inputs de cantidad en el carro

  // ── CARGA DE DATOS ──────────────────────────────────────────────────────
  const loadInitialData = async () => {
    if (!activeWarehouse?.id) return;
    setLoading(true);
    try {
      const [prodRes, preRes, stockRes, priceRes, sessionRes] = await Promise.all([
        fetchPharmacyProducts(),
        fetchPrescriptions(),
        fetchInventoryStock(activeWarehouse.id),
        fetchPricesByWarehouse(activeWarehouse.id),
        fetchOpenPosSession(activeWarehouse.id),
      ]);

      const prodData = prodRes.data || [];
      const stockData = stockRes.data || [];
      const priceData = priceRes.data || [];
      const preData = preRes.data?.filter(p => p.status === 'PENDING') || [];
      const currentSession = sessionRes.data || null;

      // 1. Armar mapa de stock vendible vs cuarentena por producto
      const stockMapLocal = {};
      stockData.forEach(batch => {
        const qty = Number(batch.current_quantity || 0);
        const locationType = batch.location?.location_type?.toUpperCase();
        const locationName = batch.location?.name?.toLowerCase() || '';
        const isQuarantine = locationType === 'QUARANTINE' || locationName.includes('cuarentena');

        if (!stockMapLocal[batch.product_id]) {
          stockMapLocal[batch.product_id] = { disponible: 0, cuarentena: 0 };
        }

        if (isQuarantine) {
          stockMapLocal[batch.product_id].cuarentena += qty;
        } else {
          stockMapLocal[batch.product_id].disponible += qty;
        }
      });

      // 2. Armar mapa de precios locales
      const priceMapLocal = {};
      priceData.forEach(item => {
        priceMapLocal[item.product_id] = Number(item.price_sale);
      });

      // 3. Enriquecer el catálogo ORIGINAL
      const enrichedProducts = prodData.map(p => {
        const stock = stockMapLocal[p.id] || { disponible: 0, cuarentena: 0 };

        return {
          ...p,
          stock_disponible: stock.disponible,
          stock_cuarentena: stock.cuarentena,
          stock_local: stock.disponible,
          price_sale: priceMapLocal[p.id] || 0 // Si no hay en product_prices, queda en 0
        };
      }) || [];

      console.log("Primer producto cargado (POS Local):", enrichedProducts[0]);

      setProducts(enrichedProducts);
      setPrescriptions(preData);
      setActiveSession(currentSession);
    } catch (err) {
      console.error("Error cargando POS:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInitialData(); }, [activeWarehouse?.id]);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (showSearchModal && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSearchModal]);

  // ── HOTKEYS GLOBALES ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F1') { e.preventDefault(); setShowSearchModal(true); }
      if (e.key === 'F2') { e.preventDefault(); handleCheckout(); }
      if (e.key === 'Escape') { setShowSearchModal(false); setValidationModal({ isOpen: false, type: null, product: null }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, isProcessingSale]);

  // ── LÓGICA DEL CARRITO ──────────────────────────────────────────────────
  const tryAddToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    const requestedQuantity = Number(existing?.quantity || 0) + 1;

    if (!canSellQuantity(product, requestedQuantity)) return;

    const condition = (product.sale_condition || product.prescription_type || 'VD').toUpperCase();
    if (condition === 'VD' || condition === 'VENTA_LIBRE') { addToCart(product); return; }
    if (condition === 'R' || condition === 'RECETA_SIMPLE') { setValidationModal({ isOpen: true, type: 'R', product }); setModalInput(''); return; }
    if (condition === 'RR' || condition === 'RCH' || condition === 'RECETA_RETENIDA' || condition === 'RECETA_CHEQUE') {
      setValidationModal({ isOpen: true, type: 'RR', product }); setSelectedPrescription(''); return;
    }
    // Default: agregar sin validación
    addToCart(product);
  };

  // Helper: precio seguro con fallback
  const safePrice = (p) => Number(p?.price_sale ?? p?.unit_price ?? p?.price ?? 0);

  const showInsufficientStockAlert = () => {
    alert('Stock disponible insuficiente. No se puede vender stock en cuarentena.');
  };

  const canSellQuantity = (product, requestedQuantity) => {
    if (Number(requestedQuantity || 0) <= Number(product?.stock_disponible || 0)) return true;
    showInsufficientStockAlert();
    return false;
  };

  const addToCart = (product, metadata = {}) => {
    // Bloqueo de venta si no hay precio definido para este local
    if (Number(product.price_sale) <= 0) {
      alert(`Bloqueo: El producto ${product.name} no tiene un precio de venta asignado para este local.`);
      return;
    }

    const existing = cart.find(item => item.id === product.id);
    const requestedQuantity = Number(existing?.quantity || 0) + 1;
    const availableStock = Number(product.stock_disponible || 0);

    if (requestedQuantity > availableStock) {
      showInsufficientStockAlert();
      return;
    }

    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item));
    } else {
      setCart(prev => [...prev, {
        ...product,
        price_sale: safePrice(product),   // ← blindaje: siempre un número
        quantity: 1,
        ...metadata
      }]);
    }
    setValidationModal({ isOpen: false, type: null, product: null });
    setShowSearchModal(false);
    setSearchTerm('');
    // Focus en el input de cantidad del producto recién agregado
    setTimeout(() => { qtyRefs.current[product.id]?.select(); }, 150);
  };

  const setQuantity = (id, val) => {
    const qty = Math.max(1, parseInt(val) || 1);
    const product = cart.find(item => item.id === id);

    if (!canSellQuantity(product, qty)) return;

    setCart(cart.map(item => item.id === id ? { ...item, quantity: qty } : item));
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

  const calculateTotal = () => cart.reduce((acc, item) => acc + (safePrice(item) * Number(item.quantity || 0)), 0);
  const totalItems = cart.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);

  const handleCheckout = () => {
    if (cart.length === 0 || isProcessingSale) return;
    setShowCheckoutModal(true);
  };

  const handleQuickCashOut = async () => {
    if (!activeWarehouse?.id) {
      alert('Debes seleccionar una sucursal antes de registrar retiros de caja.');
      return;
    }
    if (Number(quickCashModal.amount || 0) <= 0) {
      alert('Debes ingresar un monto mayor a cero.');
      return;
    }
    if (!quickCashModal.reason.trim()) {
      alert('Debes indicar la justificación del retiro.');
      return;
    }

    setIsProcessingSale(true);
    try {
      const { data: openSession, error: sessionError } = await fetchOpenPosSession(activeWarehouse.id);
      if (sessionError) throw sessionError;
      if (!openSession?.id) {
        throw new Error('Debes abrir tu caja en el módulo de Control de Caja antes de registrar retiros.');
      }

      const { error: movementError } = await createCashMovement({
        sessionId: openSession.id,
        movementType: 'OUT',
        amount: Number(quickCashModal.amount || 0),
        reason: quickCashModal.reason.trim(),
      });
      if (movementError) throw movementError;

      setQuickCashModal({ open: false, amount: '', reason: '' });
      alert('Retiro de dinero registrado en la caja activa.');
    } catch (error) {
      console.error('Error registrando retiro rápido:', error);
      alert(`No se pudo registrar el retiro: ${error.message || error}`);
    } finally {
      setIsProcessingSale(false);
    }
  };

  const confirmSale = async (modalSaleHeader) => {
    setIsProcessingSale(true);
    try {
      const saleHeader = {
        ...modalSaleHeader,
        // Enlazar paciente si viene de una receta
        patient_id: cart.find(i => i.patient_id)?.patient_id || null,
        prescription_id: cart.find(i => i.prescription_id)?.prescription_id || null
      };

      const sale = await createSaleWithItems(saleHeader, cart, activeWarehouse.id);
      alert(`Venta #${sale.id.slice(0,8)} procesada. Stock descontado por FEFO.`);
      
      setCart([]);
      setShowCheckoutModal(false);
      loadInitialData();
    } catch (err) {
      console.error("ERROR CRÍTICO BD:", err);
      alert("Error BD: " + (err.message || JSON.stringify(err)));
    } finally { 
      setIsProcessingSale(false); 
    }
  };

  const getBadgeColor = (condition) => {
    const c = (condition || '').toUpperCase();
    if (c === 'VD' || c === 'VENTA_LIBRE') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (c === 'R' || c === 'RECETA_SIMPLE') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (c === 'RR' || c === 'RCH' || c === 'RECETA_RETENIDA' || c === 'RECETA_CHEQUE') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  const getConditionLabel = (p) => {
    const c = (p.sale_condition || p.prescription_type || 'VD').toUpperCase();
    if (c === 'VENTA_LIBRE') return 'VD';
    if (c === 'RECETA_SIMPLE') return 'R';
    if (c === 'RECETA_RETENIDA') return 'RR';
    if (c === 'RECETA_CHEQUE') return 'RCH';
    return c;
  };

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.dci?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode?.includes(searchTerm) ||
    p.barcode_purchase?.includes(searchTerm)
  );

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && filteredProducts.length === 1) tryAddToCart(filteredProducts[0]);
  };

  const fmtCLP = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-slate-100 font-sans text-slate-800">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-emerald-500 rounded-xl"><ShoppingCart size={22} /></div>
          <div>
            <h1 className="text-lg font-black tracking-tight uppercase">Terminal de Venta</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Validación ISP · Modo Teclado</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className={`hidden lg:flex items-center gap-2 rounded-xl border px-4 py-2 text-[11px] font-black uppercase ${activeSession ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
            <Wallet size={14} />
            {activeSession ? `Caja abierta · ${activeSession.operator?.full_name || 'Operador sin nombre'}` : 'Caja cerrada'}
          </div>
          <button
            type="button"
            onClick={() => setQuickCashModal({ open: true, amount: '', reason: '' })}
            className="hidden md:inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-[11px] font-black uppercase text-white hover:bg-white/15 transition-colors"
          >
            <ArrowUpCircle size={16} />
            Retiro Rapido
          </button>
          <div className="hidden md:flex items-center gap-3 text-[10px] text-slate-500 font-bold">
            <span className="bg-slate-800 px-2 py-1 rounded font-mono">F1</span> Buscar
            <span className="bg-slate-800 px-2 py-1 rounded font-mono">F2</span> Cobrar
            <span className="bg-slate-800 px-2 py-1 rounded font-mono">ESC</span> Cerrar
          </div>
          <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2">
            <MapPin size={14} className="text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-slate-500 uppercase leading-none">Local</span>
              <span className="text-xs font-black text-emerald-400 uppercase">{activeWarehouse?.name || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE BÚSQUEDA RÁPIDA ───────────────────────────────────── */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <button onClick={() => setShowSearchModal(true)}
          className="w-full flex items-center gap-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl px-6 py-3.5 text-left hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group">
          <Search size={20} className="text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
          <span className="text-sm font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">
            Buscar producto o escanear código... <span className="text-slate-300 text-xs">(F1)</span>
          </span>
          <span className="ml-auto bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-black">{totalItems} items</span>
        </button>
      </div>

      {/* ── TABLA DEL CARRO (100% ANCHO) ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-200">
            <ShoppingCart size={80} className="mb-4 opacity-15" />
            <p className="text-lg font-black uppercase tracking-widest text-slate-300">Terminal Vacía</p>
            <p className="text-xs font-bold text-slate-300 mt-1">Presiona F1 para buscar productos</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
              <tr>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Producto</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-32">P. Unitario</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-28">Cantidad</th>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-36">Subtotal</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cart.map(item => (
                <tr key={item.id} className="hover:bg-emerald-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-800 text-sm block">{item.name}</span>
                    <span className="text-[11px] text-slate-400 italic">{item.dci || 'Sin DCI'}</span>
                    {item.validation_rut && <span className="block text-[10px] text-yellow-600 font-black mt-0.5">RUT DR: {item.validation_rut}</span>}
                    {item.prescription_id && <span className="block text-[10px] text-red-600 font-black mt-0.5">RECETA: #{item.prescription_id.slice(0,8)}</span>}
                  </td>
                  <td className="px-4 py-4 text-center text-sm font-bold text-slate-500">{fmtCLP(safePrice(item))}</td>
                  <td className="px-4 py-4 text-center">
                    <input
                      ref={el => { qtyRefs.current[item.id] = el; }}
                      type="number" min="1"
                      className="w-20 text-center text-lg font-black text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl py-2 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                      value={item.quantity}
                      onChange={e => setQuantity(item.id, e.target.value)}
                      onFocus={e => e.target.select()}
                    />
                  </td>
                  <td className="px-6 py-4 text-right text-base font-black text-slate-800">
                    {fmtCLP(safePrice(item) * Number(item.quantity || 0))}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button onClick={() => removeFromCart(item.id)}
                      className="w-11 h-11 flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all active:scale-90">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── STICKY FOOTER: TOTALES + COBRAR ────────────────────────────── */}
      <div className="shrink-0 bg-white border-t-2 border-slate-200 px-6 py-4 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-8">
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Productos</span>
            <span className="text-xl font-black text-slate-700">{cart.length}</span>
          </div>
          <div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Unidades</span>
            <span className="text-xl font-black text-slate-700">{totalItems}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total a Pagar</span>
            <span className="text-3xl font-black text-slate-900">{fmtCLP(calculateTotal())}</span>
          </div>
          <button disabled={cart.length === 0 || isProcessingSale} onClick={handleCheckout}
            className="bg-emerald-600 text-white px-10 py-4 rounded-2xl font-black text-base shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center gap-3">
            {isProcessingSale ? <Loader2 size={20} className="animate-spin" /> : <><CreditCard size={20} /> COBRAR (F2)</>}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: BÚSQUEDA DE PRODUCTOS (F1)                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showSearchModal && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/70 backdrop-blur-sm pt-[5vh]"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSearchModal(false); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 bg-slate-50">
              <Barcode size={20} className="text-emerald-500 shrink-0" />
              <input ref={searchInputRef} type="text"
                placeholder="Nombre, DCI o código de barras... (Enter si hay 1 resultado)"
                className="flex-1 bg-transparent text-lg font-medium outline-none placeholder-slate-300"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleSearchKeyDown} />
              <button onClick={() => { setShowSearchModal(false); setSearchTerm(''); }}
                className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-20 text-center text-slate-300"><Loader2 size={32} className="animate-spin mx-auto mb-3" />
                  <p className="text-sm font-bold uppercase tracking-widest">Consultando inventario...</p></div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-20 text-center text-slate-300">
                  <Package size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-bold">Sin resultados para "{searchTerm}"</p></div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                    <tr>
                      <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Producto / DCI</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Cond.</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Disponible</th>
                      <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">P. Venta</th>
                      <th className="px-4 py-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredProducts.map(p => (
                      <tr key={p.id} className="hover:bg-emerald-50/40 transition-colors cursor-pointer" onClick={() => tryAddToCart(p)}>
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-800 block">{p.name}</span>
                          <span className="text-xs text-slate-400 italic">{p.dci || 'Sin DCI'}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${getBadgeColor(p.sale_condition || p.prescription_type)}`}>
                            {getConditionLabel(p)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`font-mono font-bold ${p.stock_disponible <= 5 ? 'text-red-500' : 'text-slate-600'}`}>
                              Disponible: {p.stock_disponible}
                            </span>
                            {p.stock_cuarentena > 0 && (
                              <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-black text-orange-700">
                                ⚠️ {p.stock_cuarentena} en Cuarentena
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-black">
                          <span className={Number(p.price_sale) <= 0 ? 'text-red-400 italic text-[10px]' : 'text-slate-700'}>
                            {Number(p.price_sale) <= 0 ? 'Sin Precio' : fmtCLP(p.price_sale)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button className="w-11 h-11 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all active:scale-90">
                            <Plus size={20} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t text-[10px] font-bold text-slate-400 text-center uppercase tracking-widest">
              {filteredProducts.length} producto{filteredProducts.length !== 1 ? 's' : ''} · Clic o Enter para agregar · ESC para cerrar
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MODAL: VALIDACIÓN ISP (R / RR)                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {validationModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-t-8 ${validationModal.type === 'RR' ? 'border-red-500' : 'border-yellow-500'}`}>
            <div className="p-8">
              <div className="flex justify-center mb-6">
                <div className={`p-4 rounded-full ${validationModal.type === 'RR' ? 'bg-red-50 text-red-500' : 'bg-yellow-50 text-yellow-500'}`}>
                  {validationModal.type === 'RR' ? <ShieldAlert size={48} /> : <Stethoscope size={48} />}
                </div>
              </div>
              <div className="text-center space-y-2 mb-8">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                  {validationModal.type === 'RR' ? 'Bloqueo Legal: Receta Retenida' : 'Aviso: Receta Simple'}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed italic">
                  El medicamento <span className="font-black text-slate-700 underline">{validationModal.product?.name}</span> exige verificación ISP.
                </p>
              </div>
              {validationModal.type === 'R' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest text-center">RUT Médico o Autorización QF</label>
                    <input type="text" placeholder="Ej: 12.345.678-9" autoFocus
                      className="w-full text-center py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-yellow-500 transition-all font-mono font-bold"
                      value={modalInput} onChange={(e) => setModalInput(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setValidationModal({ isOpen: false, type: null, product: null })} className="py-3 font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                    <button onClick={() => addToCart(validationModal.product, { validation_rut: modalInput || 'Dato Omitido' })}
                      className="py-3 bg-yellow-500 text-white rounded-xl font-black shadow-lg shadow-yellow-100 hover:bg-yellow-600 transition-all">AGREGAR</button>
                  </div>
                </div>
              )}
              {validationModal.type === 'RR' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest text-center">Folio de Receta Electrónica Activa</label>
                    <select className="w-full py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-red-500 transition-all font-bold text-slate-700 text-center"
                      value={selectedPrescription} onChange={(e) => setSelectedPrescription(e.target.value)}>
                      <option value="">-- Buscar Folio Pendiente --</option>
                      {prescriptions.map(pres => (
                        <option key={pres.id} value={pres.id}>Folio: {pres.folio_electronico} ({pres.patient?.first_name})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <button onClick={() => setValidationModal({ isOpen: false, type: null, product: null })} className="py-3 font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                    <button disabled={!selectedPrescription}
                      onClick={() => addToCart(validationModal.product, { prescription_id: selectedPrescription })}
                      className="py-3 bg-red-600 text-white rounded-xl font-black shadow-lg shadow-red-100 hover:bg-red-700 disabled:opacity-20 transition-all">VALIDAR Y AGREGAR</button>
                  </div>
                </div>
              )}
            </div>
            <div className="bg-slate-50 py-3 text-center border-t border-slate-100">
              <span className="text-[10px] font-black text-slate-400 flex items-center justify-center gap-2">
                <FlaskConical size={12}/> VIGILANCIA SANITARIA ACTIVA
              </span>
            </div>
          </div>
        </div>
      )}
      {showCheckoutModal && (
        <CheckoutModal 
          total={calculateTotal()}
          onClose={() => setShowCheckoutModal(false)}
          onConfirm={confirmSale}
          isProcessing={isProcessingSale}
        />
      )}

      {quickCashModal.open && (
        <div className="fixed inset-0 z-[140] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gray-50/50 px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Retiro Rápido de Dinero</p>
              <button type="button" onClick={() => setQuickCashModal({ open: false, amount: '', reason: '' })} className="rounded-lg border border-gray-300 px-3 py-2 text-[11px] font-black uppercase text-gray-600">Cerrar</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-200">
                  <p className="text-[11px] font-black text-gray-500 uppercase">Monto a Retirar</p>
                </div>
                <div className="p-4">
                  <input
                    type="number"
                    min="0"
                    value={quickCashModal.amount}
                    onChange={(e) => setQuickCashModal((current) => ({ ...current, amount: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073]"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50/50 px-4 py-3 border-b border-gray-200">
                  <p className="text-[11px] font-black text-gray-500 uppercase">Justificación</p>
                </div>
                <div className="p-4">
                  <textarea
                    value={quickCashModal.reason}
                    onChange={(e) => setQuickCashModal((current) => ({ ...current, reason: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-purple-50 focus:border-[#4C3073] min-h-[110px]"
                    placeholder="Ej: retiro a bóveda, pago menor, seguridad"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setQuickCashModal({ open: false, amount: '', reason: '' })} className="rounded-xl border border-gray-300 px-4 py-2.5 text-[11px] font-black uppercase text-gray-700">Cancelar</button>
                <button type="button" onClick={handleQuickCashOut} disabled={isProcessingSale} className="rounded-xl bg-[#4C3073] px-4 py-2.5 text-[11px] font-black uppercase text-white disabled:opacity-40">
                  {isProcessingSale ? 'Guardando...' : 'Registrar Retiro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
