import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  FlaskConical, 
  Stethoscope, 
  CreditCard,
  X,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { 
  fetchPharmacyProducts, 
  fetchPrescriptions,
  createSaleWithItems
} from '../api/pharmacyClient';

export default function PuntoDeVenta() {
  const [products, setProducts] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modales de validación
  const [validationModal, setValidationModal] = useState({
    isOpen: false,
    type: null, // 'R' or 'RR'
    product: null
  });
  
  // Inputs temporales dentro de modales
  const [modalInput, setModalInput] = useState('');
  const [selectedPrescription, setSelectedPrescription] = useState('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [prodRes, preRes] = await Promise.all([
        fetchPharmacyProducts(),
        fetchPrescriptions()
      ]);
      if (!prodRes.error) setProducts(prodRes.data || []);
      // Filtrar solo recetas pendientes para el bloqueo RR
      if (!preRes.error) setPrescriptions(preRes.data?.filter(p => p.status === 'PENDING') || []);
    } catch (err) {
      console.error("Error cargando POS:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Lógica de validación ISP
  const tryAddToCart = (product) => {
    const condition = (product.sale_condition || 'VD').toUpperCase();

    if (condition === 'VD') {
      addToCart(product);
      return;
    }

    if (condition === 'R') {
      setValidationModal({ isOpen: true, type: 'R', product });
      setModalInput(''); // Limpiar RUT prescriptor anterior
      return;
    }

    if (condition === 'RR' || condition === 'RCH') {
      setValidationModal({ isOpen: true, type: 'RR', product });
      setSelectedPrescription('');
      return;
    }
  };

  const addToCart = (product, metadata = {}) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { 
        ...product, 
        quantity: 1, 
        ...metadata // Inyectar folio de receta o RUT médico si aplica
      }]);
    }
    // Cerrar modales si estaban abiertos
    setValidationModal({ isOpen: false, type: null, product: null });
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const calculateTotal = () => {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    setIsProcessingSale(true);
    try {
      // 1. Cabecera de venta
      const saleHeader = {
        total_amount: calculateTotal(),
        status: 'COMPLETED',
        payment_method: 'CASH', // Mocked por ahora
        prescription_id: cart.find(i => i.prescription_id)?.prescription_id || null
      };

      // 2. Items de venta
      const saleItems = cart.map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
        validation_info: item.validation_rut || null,
        prescription_id: item.prescription_id || null
      }));

      const sale = await createSaleWithItems(saleHeader, saleItems);
      
      alert(`Venta #${sale.id.slice(0,8)} procesada correctamente. Dispense los fármacos.`);
      
      setCart([]);
      loadInitialData(); // Refrescar stock y recetas
    } catch (err) {
      console.error("Error en checkout:", err);
      alert("Error al procesar la venta. Verifique conexión o inventario.");
    } finally {
      setIsProcessingSale(false);
    }
  };

  const getBadgeColor = (condition) => {
    switch (condition?.toUpperCase()) {
      case 'VD': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'R': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'RR':
      case 'RCH': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.dci?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-300">
      {/* Header POS */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600 rounded-lg text-white">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">TERMINAL DE VENTA CLÍNICA</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Validación de Receta ISP Activa</p>
          </div>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl border border-dashed border-slate-300">
          <span className="text-xs font-bold text-slate-400 block uppercase">Cajero de Turno</span>
          <span className="text-sm font-black text-slate-700">Sistema Central Datix</span>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* COLUMNA IZQUIERDA: BUSCADOR (70%) */}
        <div className="flex-[7] flex flex-col space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por Nombre Comercial o DCI (Principio Activo)..."
              className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm focus:border-emerald-500 focus:ring-0 outline-none transition-all text-lg font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl flex-1 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Producto / DCI</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Condición</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">P. Venta</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan="5" className="py-20 text-center animate-pulse text-slate-400 font-bold">Consultando inventario...</td></tr>
                ) : filteredProducts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-base">{p.name}</span>
                        <span className="text-xs text-slate-400 font-medium italic">{p.dci || 'Sin DCI'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-black border ${getBadgeColor(p.sale_condition)}`}>
                        {p.sale_condition || 'VD'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`font-mono font-bold ${p.stock <= 5 ? 'text-red-500' : 'text-slate-600'}`}>{p.stock}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-700">
                      ${Number(p.price).toLocaleString('es-CL')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => tryAddToCart(p)}
                        className="bg-emerald-50 text-emerald-600 p-2 rounded-lg hover:bg-emerald-600 hover:text-white transition-all active:scale-90"
                      >
                        <Plus size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* COLUMNA DERECHA: CARRITO (30%) */}
        <div className="flex-[3] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <h2 className="font-black italic text-sm tracking-widest">CARRITO DE VENTAS</h2>
            <div className="bg-emerald-500 px-2 py-1 rounded text-[10px] font-black">{cart.length} ITEMS</div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 italic text-sm text-center">
                <ShoppingCart size={48} className="mb-2 opacity-20" />
                No hay productos<br/>en la terminal
              </div>
            ) : cart.map(item => (
              <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 relative group animate-in slide-in-from-right-4">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-black text-slate-800 uppercase leading-none truncate pr-6">{item.name}</span>
                  <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold tracking-tighter">CANT: {item.quantity} x ${Number(item.price).toLocaleString('es-CL')}</span>
                    {item.validation_rut && <span className="text-[9px] text-yellow-600 font-black italic">RUT DR: {item.validation_rut}</span>}
                    {item.prescription_id && <span className="text-[9px] text-red-600 font-black italic">RECETA FOLIO: #{item.prescription_id.slice(0,8)}</span>}
                  </div>
                  <span className="font-black text-slate-700">${(item.price * item.quantity).toLocaleString('es-CL')}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-6 bg-slate-50 border-t space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold text-slate-400 uppercase">Total a Pagar</span>
              <span className="text-3xl font-black text-slate-900">${calculateTotal().toLocaleString('es-CL')}</span>
            </div>
            <button 
              disabled={cart.length === 0 || isProcessingSale}
              onClick={handleCheckout}
              className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isProcessingSale ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <CreditCard size={20} />
                  COBRAR Y DISPENSAR
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE VALIDACIÓN (R / RR) */}
      {validationModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
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

              {/* Lógica Receta Simple (R) */}
              {validationModal.type === 'R' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest text-center">RUT Médico o Autorización QF</label>
                    <input 
                      type="text" 
                      placeholder="Ej: 12.345.678-9"
                      className="w-full text-center py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-yellow-500 transition-all font-mono font-bold"
                      value={modalInput}
                      onChange={(e) => setModalInput(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setValidationModal({ isOpen: false, type: null, product: null })} className="py-3 font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                    <button 
                      onClick={() => addToCart(validationModal.product, { validation_rut: modalInput || 'Dato Omitido' })}
                      className="py-3 bg-yellow-500 text-white rounded-xl font-black shadow-lg shadow-yellow-100 hover:bg-yellow-600 transition-all"
                    >
                      AGREGAR
                    </button>
                  </div>
                </div>
              )}

              {/* Lógica Receta Retenida (RR) */}
              {validationModal.type === 'RR' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest text-center">Folio de Receta Electrónica Activa</label>
                    <select 
                      className="w-full py-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none focus:border-red-500 transition-all font-bold text-slate-700 text-center"
                      value={selectedPrescription}
                      onChange={(e) => setSelectedPrescription(e.target.value)}
                    >
                      <option value="">-- Buscar Folio Pendiente --</option>
                      {prescriptions.map(pres => (
                        <option key={pres.id} value={pres.id}>
                          Folio: {pres.folio_electronico} ({pres.patient?.first_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <button onClick={() => setValidationModal({ isOpen: false, type: null, product: null })} className="py-3 font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
                    <button 
                      disabled={!selectedPrescription}
                      onClick={() => addToCart(validationModal.product, { prescription_id: selectedPrescription })}
                      className="py-3 bg-red-600 text-white rounded-xl font-black shadow-lg shadow-red-100 hover:bg-red-700 disabled:opacity-20 transition-all"
                    >
                      VALIDAR Y AGREGAR
                    </button>
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
    </div>
  );
}
