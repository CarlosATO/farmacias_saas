import React, { useState } from 'react';
import { 
  ArrowLeftRight, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  RefreshCcw, 
  Package, 
  User as UserIcon, 
  FileText, 
  History,
  Calendar,
  ShieldAlert
} from 'lucide-react';
import { 
  fetchSaleByNumber, 
  fetchSaleItems, 
  fetchReturnHistoryForSale, 
  processSaleReturn 
} from '../api/pharmacyClient';

const formatCLP = (value) => {
  if (value === null || value === undefined || value === '') return '$0';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(value));
};

export default function Devoluciones() {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sale, setSale] = useState(null);
  const [items, setItems] = useState([]);
  const [returns, setReturns] = useState({}); // sale_item_id -> total_returned
  const [selectedItems, setSelectedItems] = useState({}); // sale_item_id -> quantity_to_return
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setSale(null);
    setItems([]);
    setReturns({});
    setSelectedItems({});
    setSuccess(null);

    try {
      const { data: saleData, error: saleErr } = await fetchSaleByNumber(searchTerm.trim());
      if (saleErr) throw saleErr;
      if (!saleData) {
        setError('Documento no encontrado. Verifique el documento interno o la referencia POS.');
        return;
      }

      setSale(saleData);

      // Fetch items and return history in parallel
      const [itemsRes, returnsRes] = await Promise.all([
        fetchSaleItems(saleData.id),
        fetchReturnHistoryForSale(saleData.id)
      ]);

      setItems(itemsRes.data || []);

      // Consolidate return history
      const returnsMap = {};
      (returnsRes.data || []).forEach((ret) => {
        const itemId = ret.sale_item_id;
        const qty = Number(ret.quantity) || 0;
        returnsMap[itemId] = (returnsMap[itemId] || 0) + qty;
      });
      setReturns(returnsMap);

    } catch (err) {
      console.error('Error buscando venta:', err);
      setError('Error al buscar la venta: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const handleItemToggle = (itemId, maxQty) => {
    if (selectedItems[itemId] !== undefined) {
      const newSelected = { ...selectedItems };
      delete newSelected[itemId];
      setSelectedItems(newSelected);
    } else {
      setSelectedItems({
        ...selectedItems,
        [itemId]: maxQty
      });
    }
  };

  const handleQtyChange = (itemId, val, maxQty) => {
    const qty = Math.max(0, Math.min(Number(val), maxQty));
    setSelectedItems({
      ...selectedItems,
      [itemId]: qty
    });
  };

  const handleSubmitReturn = async () => {
    if (!sale || Object.keys(selectedItems).length === 0) return;
    if (!reason.trim()) {
      setError('Por favor, ingrese un motivo para la devolución.');
      return;
    }

    // Filter out zero quantities
    const itemsToReturn = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ sale_item_id: id, quantity: qty }));

    if (itemsToReturn.length === 0) {
      setError('Debe seleccionar al menos un producto con cantidad mayor a cero.');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const result = await processSaleReturn(sale.id, reason, itemsToReturn);
      setSuccess({
        message: 'Devolución procesada con éxito.',
        return_id: result.return_id,
        folio_nc: result.folio_nc,
        amount: result.total_amount
      });
      
      // Reset after success
      setSale(null);
      setItems([]);
      setSearchTerm('');
      setReason('');
    } catch (err) {
      console.error('Error procesando devolución:', err);
      setError(err.message || 'Error al procesar la devolución');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans text-sm text-gray-800">
      
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-[#4C3073] p-2 rounded-lg">
            <ArrowLeftRight size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Devoluciones Farmacéuticas</h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Gestión Interna de Retornos y Notas de Crédito</p>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1 rounded-sm text-[10px] font-black uppercase tracking-widest">
          <ShieldAlert size={14} />
          MÓDULO DE OPERACIÓN INTERNA - REINGRESO A CUARENTENA
        </div>
      </div>

      {/* Search Section */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden mb-6">
        <div className="p-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar por documento interno o referencia POS (ej: 11, BOL-667254, 667254)..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-sm font-bold text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]/20 transition-all"
              />
            </div>
            <button 
              type="submit"
              disabled={loading || !searchTerm.trim()}
              className="px-8 py-3 bg-[#4C3073] text-white font-black uppercase tracking-widest text-xs rounded-sm hover:bg-[#3a2457] disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {loading ? <RefreshCcw size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar Venta
            </button>
          </form>
        </div>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-sm mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-tight text-sm">Error en la operación</p>
            <p className="text-xs font-bold mt-1 opacity-80">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={18}/></button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-6 py-4 rounded-sm mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-black uppercase tracking-tight text-sm">Devolución Exitosa</p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase font-black text-emerald-600/60 tracking-widest">Nota de Crédito Interna</p>
                <p className="text-lg font-black tracking-tighter">FOLIO #{success.folio_nc}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-black text-emerald-600/60 tracking-widest">Monto Revertido</p>
                <p className="text-lg font-black tracking-tighter">{formatCLP(success.amount)}</p>
              </div>
            </div>
            <p className="text-[10px] font-bold mt-3 uppercase tracking-widest bg-emerald-100/50 inline-block px-2 py-1 rounded-sm">
              Stock reingresado a CUARENTENA para inspección técnica.
            </p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600"><X size={18}/></button>
        </div>
      )}

      {/* Sale Detail & Return Logic */}
      {sale && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Sale Info Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Información de la Venta</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <FileText size={18} className="text-[#4C3073] mt-1" />
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Documento interno</p>
                    <p className="text-sm font-black text-gray-800">{sale.internal_document_number || sale.folio || 'N/A'}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{sale.id}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <UserIcon size={18} className="text-[#4C3073] mt-1" />
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Cliente</p>
                    <p className="text-sm font-black text-gray-800 uppercase">{sale.patient?.full_name || 'CLIENTE GENERAL'}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{sale.patient?.rut || 'RUT NO REGISTRADO'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <History size={18} className="text-[#4C3073] mt-1" />
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Referencia POS</p>
                    <p className="text-sm font-black text-gray-800 uppercase">{sale.pos_reference || sale.document_number || 'N/A'}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{sale.document_number || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar size={18} className="text-[#4C3073] mt-1" />
                  <div>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Fecha Venta</p>
                    <p className="text-sm font-black text-gray-800">{new Date(sale.created_at).toLocaleString('es-CL')}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-center bg-gray-50 p-3 rounded-sm">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Venta</span>
                    <span className="text-xl font-black text-[#4C3073]">{formatCLP(sale.total_amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Return Reason Card */}
            <div className="bg-white border border-gray-200 rounded-sm shadow-sm p-6">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Motivo de la Devolución</label>
              <textarea 
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ej: Producto dañado, Vencimiento próximo, Error en despacho..."
                className="w-full p-3 border border-gray-300 rounded-sm text-xs font-bold outline-none focus:border-[#4C3073] h-32 resize-none"
              ></textarea>
              <button 
                onClick={handleSubmitReturn}
                disabled={
                    processing || 
                    Object.keys(selectedItems).length === 0 || 
                    !items.some(item => (Number(item.quantity) - (returns[item.id] || 0)) > 0)
                }
                className="w-full mt-4 py-4 bg-emerald-600 text-white font-black uppercase tracking-widest text-xs rounded-sm hover:bg-emerald-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {processing ? <RefreshCcw size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />}
                Procesar Devolución
              </button>
            </div>
          </div>

          {/* Items Table Card */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Productos Disponibles para Devolución</p>
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter">
                  {items.length} Items
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-10">SEL</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Orig.</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Dev.</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Dispon.</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center w-32">Cant. Devolver</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item) => {
                      const returned = returns[item.id] || 0;
                      const available = Math.max(0, Number(item.quantity) - returned);
                      const isSelected = selectedItems[item.id] !== undefined;
                      const isControlled = item.product?.is_controlled;
                      const isFullyReturned = available <= 0;

                      return (
                        <tr key={item.id} className={`${isFullyReturned ? 'bg-gray-50/50 opacity-60' : 'hover:bg-gray-50'} transition-colors`}>
                          <td className="px-6 py-4">
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              disabled={isFullyReturned}
                              onChange={() => handleItemToggle(item.id, available)}
                              className="w-4 h-4 rounded text-[#4C3073] border-gray-300 focus:ring-[#4C3073] disabled:opacity-30"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-sm ${isFullyReturned ? 'bg-gray-200 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                                <Package size={14} />
                              </div>
                              <div>
                                <p className={`font-bold uppercase text-xs ${isFullyReturned ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                  {item.product?.name || 'PRODUCTO'}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-gray-400 font-mono">DCI: {item.product?.dci || '-'}</span>
                                  {isControlled && (
                                    <span className="text-[8px] bg-red-50 text-red-600 px-1 border border-red-100 font-black rounded-sm uppercase">Controlado</span>
                                  )}
                                  {isFullyReturned && (
                                    <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1 border border-emerald-100 font-black rounded-sm uppercase tracking-tighter">Devuelto Completo</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-xs text-gray-500">{item.quantity}</td>
                          <td className="px-6 py-4 text-center font-bold text-xs text-amber-600">{returned}</td>
                          <td className="px-6 py-4 text-center font-black text-xs text-gray-900">
                            {isFullyReturned ? (
                                <span className="text-red-500 uppercase text-[9px] tracking-tighter">Sin Saldo</span>
                            ) : available}
                          </td>
                          <td className="px-6 py-4">
                            {isSelected && !isFullyReturned ? (
                              <input 
                                type="number" 
                                min="1"
                                max={available}
                                value={selectedItems[item.id]}
                                onChange={e => handleQtyChange(item.id, e.target.value, available)}
                                className="w-full p-2 border border-[#4C3073] rounded-sm text-center font-black text-xs outline-none focus:ring-1 focus:ring-[#4C3073]/20"
                              />
                            ) : (
                              <div className="w-full py-2 bg-gray-50 text-gray-300 text-center text-xs font-bold rounded-sm">-</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase italic">
                  * Al confirmar, los productos seleccionados serán retirados del historial de venta y movidos físicamente a la ubicación de cuarentena para auditoría técnica.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State / Initial */}
      {!sale && !loading && !success && (
        <div className="flex flex-col items-center justify-center py-24 bg-white border border-gray-200 border-dashed rounded-sm opacity-60">
          <ArrowLeftRight size={64} className="text-gray-200 mb-4" />
          <p className="text-sm font-black uppercase tracking-widest text-gray-400">Busque una venta para comenzar el proceso</p>
          <p className="text-xs text-gray-300 mt-2">Puede usar el Folio del ticket (TICKET-XXXX) o el ID único del sistema</p>
        </div>
      )}

    </div>
  );
}
