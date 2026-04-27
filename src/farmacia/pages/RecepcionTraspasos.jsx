import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowRightLeft,
  Search,
  Package,
  MapPin,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  Clock,
  User,
  ArrowDownCircle,
  Truck,
  CheckCheck,
  AlertCircle,
  Loader2,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { fetchPendingTransfers, fetchTransferItems, receiveTransfer } from '../api/pharmacyClient';
import { useSucursal } from '../context/SucursalContext';

// ── Toast de notificación inline ────────────────────────────────────────────
function Toast({ type, message, onDismiss }) {
  const isSuccess = type === 'success';
  return (
    <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border shadow-lg text-sm font-bold
      ${isSuccess ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
      {isSuccess
        ? <CheckCheck size={18} className="text-green-600 shrink-0" />
        : <AlertCircle size={18} className="text-red-600 shrink-0" />}
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="ml-4 opacity-50 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function RecepcionTraspasos() {
  const { activeWarehouse } = useSucursal();

  const [transfers, setTransfers]             = useState([]);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [transferItems, setTransferItems]     = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [detailsLoading, setDetailsLoading]   = useState(false);
  const [isProcessing, setIsProcessing]       = useState(false);
  const [searchTerm, setSearchTerm]           = useState('');
  const [toast, setToast]                     = useState(null);

  // ── Campos de documentación ──────────────────────────────────────────────
  const [dispatchGuide, setDispatchGuide]     = useState('');
  const [receptionNotes, setReceptionNotes]   = useState('');

  // ── Cantidades recibidas por ítem { [itemId]: number } ───────────────────
  const [receivedQuantities, setReceivedQuantities] = useState({});

  // ── Carga de bandeja ─────────────────────────────────────────────────────
  const loadTransfers = useCallback(async () => {
    if (!activeWarehouse?.id) return;
    setLoading(true);
    try {
      const { data, error } = await fetchPendingTransfers(activeWarehouse.id);
      if (error) throw error;
      setTransfers(data || []);
    } catch (err) {
      console.error('Error cargando bandeja:', err);
      setToast({ type: 'error', message: 'No se pudo cargar la bandeja de entrada.' });
    } finally {
      setLoading(false);
    }
  }, [activeWarehouse?.id]);

  useEffect(() => { loadTransfers(); }, [loadTransfers]);

  // ── Selección de traspaso → carga detalles y resetea formulario ──────────
  const handleSelectTransfer = async (transfer) => {
    setSelectedTransfer(transfer);
    setTransferItems([]);
    setReceivedQuantities({});
    setDispatchGuide('');
    setReceptionNotes('');
    setDetailsLoading(true);
    try {
      const { data, error } = await fetchTransferItems(transfer.id);
      if (error) throw error;
      const items = data || [];
      setTransferItems(items);
      // Pre-llenar cantidades recibidas con las cantidades originales
      const initQtys = {};
      items.forEach(i => { initQtys[i.id] = i.quantity; });
      setReceivedQuantities(initQtys);
    } catch (err) {
      console.error('Error cargando ítems:', err);
      setToast({ type: 'error', message: 'No se pudieron cargar los ítems del traspaso.' });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleQuantityChange = (itemId, value, maxQty) => {
    const parsed = Math.min(Number(value), maxQty); // no puede superar lo enviado
    setReceivedQuantities(prev => ({ ...prev, [itemId]: Math.max(0, parsed) }));
  };

  // Detecta si hay alguna discrepancia entre cantidad enviada y recibida
  const hasDiscrepancy = transferItems.some(
    item => Number(receivedQuantities[item.id] ?? item.quantity) < item.quantity
  );

  // ── Confirmación de ingreso a Cuarentena ─────────────────────────────────
  const handleConfirmReceipt = async () => {
    if (!selectedTransfer || !activeWarehouse?.id) return;
    setIsProcessing(true);
    try {
      await receiveTransfer(
        selectedTransfer.id,
        activeWarehouse.id,
        { dispatchGuide, receptionNotes },
        receivedQuantities
      );
      setToast({
        type: 'success',
        message: `Reserva ${selectedTransfer.folio} recibida con éxito. Stock actualizado en Cuarentena.`
      });
      setSelectedTransfer(null);
      setTransferItems([]);
      setDispatchGuide('');
      setReceptionNotes('');
      setReceivedQuantities({});
      loadTransfers();
    } catch (err) {
      console.error('Error al recibir traspaso:', err);
      setToast({ type: 'error', message: 'Error al procesar la recepción: ' + err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredTransfers = transfers.filter(t =>
    t.folio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.source_warehouse?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 font-sans text-gray-800">

      {/* ── Header Odoo-style ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center text-[10px] text-gray-400 uppercase tracking-[0.2em] font-black mb-1">
              <span>Logística &amp; WMS</span>
              <ChevronRight size={10} className="mx-1" />
              <span className="text-[#4C3073]">Recepción de Traspasos</span>
            </div>
            <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2 tracking-tight uppercase">
              <Truck className="text-[#4C3073]" />
              Bandeja de Entrada Inter-Sucursal
            </h1>
          </div>
          <div className="bg-purple-50 border border-purple-100 px-3 py-2 rounded-lg flex items-center gap-3 shadow-sm">
            <MapPin size={16} className="text-[#4C3073]" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-400 uppercase leading-none">Punto de Recepción</span>
              <span className="text-xs font-black text-[#4C3073] uppercase">{activeWarehouse?.name || 'Cargando...'}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <button
            disabled={!selectedTransfer || isProcessing}
            onClick={handleConfirmReceipt}
            className="bg-[#4C3073] text-white px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest
              hover:bg-[#3d265c] transition-all flex items-center gap-2 shadow-lg shadow-purple-100
              disabled:opacity-40 active:scale-95"
          >
            {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {isProcessing ? 'Procesando...' : 'Confirmar Ingreso a Cuarentena'}
          </button>
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por Folio o Sucursal Origen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2 text-xs font-bold
                focus:border-[#4C3073] focus:ring-4 focus:ring-purple-50 outline-none transition-all"
            />
          </div>
        </div>

        {toast && <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />}
      </div>

      {/* ── Split Layout ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Panel Izquierdo */}
        <div className="w-1/3 border-r border-gray-200 bg-white overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center animate-pulse">
              <ArrowRightLeft className="mx-auto mb-4 text-gray-200" size={40} />
              <p className="text-xs font-black text-gray-300 uppercase">Consultando bandeja...</p>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="p-12 text-center text-gray-300">
              <Clock className="mx-auto mb-4 opacity-20" size={48} />
              <p className="text-sm font-black uppercase tracking-tighter">No hay traspasos pendientes</p>
              <p className="text-[10px] uppercase font-bold mt-1">Todo está al día en {activeWarehouse?.name}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredTransfers.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTransfer(t)}
                  className={`p-4 cursor-pointer transition-all hover:bg-gray-50 flex items-center gap-4
                    ${selectedTransfer?.id === t.id
                      ? 'bg-purple-50 border-l-4 border-[#4C3073]'
                      : 'border-l-4 border-transparent'}`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${selectedTransfer?.id === t.id
                    ? 'bg-[#4C3073] text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Package size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black text-gray-800 uppercase tracking-tight truncate">{t.folio}</span>
                      <span className="text-[9px] font-bold text-gray-400 shrink-0 ml-2">
                        {new Date(t.created_at).toLocaleDateString('es-CL')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <ArrowDownCircle size={10} className="text-purple-400 shrink-0" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase truncate">
                        Origen: {t.source_warehouse?.name || 'Desconocido'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} className={selectedTransfer?.id === t.id ? 'text-[#4C3073] shrink-0' : 'text-gray-200 shrink-0'} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel Derecho: Detalle */}
        <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto">
          {selectedTransfer ? (
            <div className="p-8 max-w-4xl mx-auto w-full space-y-6">

              {/* Cabecera del documento */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reserva de Traspaso</span>
                    <h2 className="text-2xl font-black text-[#4C3073]">{selectedTransfer.folio}</h2>
                  </div>
                  <div className="h-10 w-px bg-gray-100" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sucursal Origen</span>
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin size={12} className="text-gray-400" />
                      <span className="text-xs font-bold text-gray-700">{selectedTransfer.source_warehouse?.name || 'N/D'}</span>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-gray-100" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Solicitado por</span>
                    <div className="flex items-center gap-1 mt-1">
                      <User size={12} className="text-gray-400" />
                      <span className="text-xs font-bold text-gray-700">Personal Autorizado</span>
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-black uppercase tracking-widest border border-yellow-200">
                  Pendiente de Recepción
                </span>
              </div>

              {/* Alerta de política WMS */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <ShieldAlert className="text-blue-500 mt-0.5 shrink-0" size={20} />
                <div>
                  <h4 className="text-xs font-black text-blue-900 uppercase tracking-tight">Política de Ingreso Inter-Sucursal</h4>
                  <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                    Todo ingreso proveniente de otra sucursal será asignado a la <strong>Bodega de Cuarentena</strong>.
                    Si la cantidad recibida difiere de la enviada, ajusta el campo antes de confirmar.
                  </p>
                </div>
              </div>

              {/* ── SECCIÓN: Documentación de la recepción ──────────────── */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                  <FileText size={14} className="text-[#4C3073]" />
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    Documentación de Recepción
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      N° Guía de Despacho
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: GD-000123"
                      value={dispatchGuide}
                      onChange={(e) => setDispatchGuide(e.target.value)}
                      className="border border-gray-200 rounded-lg px-4 py-2.5 text-xs font-bold
                        focus:border-[#4C3073] focus:ring-4 focus:ring-purple-50 outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      Notas de Recepción
                    </label>
                    <textarea
                      placeholder="Observaciones, diferencias, estado del embalaje..."
                      value={receptionNotes}
                      onChange={(e) => setReceptionNotes(e.target.value)}
                      rows={2}
                      className="border border-gray-200 rounded-lg px-4 py-2.5 text-xs font-bold resize-none
                        focus:border-[#4C3073] focus:ring-4 focus:ring-purple-50 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* ── TABLA DE ÍTEMS con cantidad editable ────────────────── */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                    Detalle de Mercancía — Verificación de Cantidades
                  </h3>
                  {hasDiscrepancy && (
                    <div className="flex items-center gap-1.5 text-amber-600 text-[10px] font-black uppercase">
                      <AlertTriangle size={13} />
                      Discrepancia detectada
                    </div>
                  )}
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-100">
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Lote</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Vencimiento</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Cant. Enviada</th>
                      <th className="px-6 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Cant. Recibida ✎</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detailsLoading ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center">
                          <div className="flex items-center justify-center gap-2 text-gray-300">
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-xs font-black uppercase">Cargando manifiesto...</span>
                          </div>
                        </td>
                      </tr>
                    ) : transferItems.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-xs font-bold text-gray-300 uppercase">
                          Sin ítems registrados
                        </td>
                      </tr>
                    ) : transferItems.map((item) => {
                      const received = Number(receivedQuantities[item.id] ?? item.quantity);
                      const isShort = received < item.quantity;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-gray-800 uppercase leading-none">
                                {item.product?.name || 'Producto no encontrado'}
                              </span>
                              {item.product?.dci && (
                                <span className="text-[9px] font-bold text-gray-400 mt-0.5 italic">{item.product.dci}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-black text-[#4C3073] uppercase">
                              {item.batch?.batch_number || '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[9px] font-bold text-red-400 uppercase tracking-tighter">
                              {item.batch?.expiry_date
                                ? new Date(item.batch.expiry_date).toLocaleDateString('es-CL')
                                : '—'}
                            </span>
                          </td>
                          {/* Cantidad enviada (referencia, no editable) */}
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-black text-gray-400">{item.quantity}</span>
                            <span className="text-[9px] font-bold text-gray-300 ml-1 uppercase">Unid</span>
                          </td>
                          {/* Cantidad recibida (editable) */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isShort && (
                                <AlertTriangle size={13} className="text-amber-500 shrink-0" title="Cantidad menor a la enviada" />
                              )}
                              <input
                                type="number"
                                min={0}
                                max={item.quantity}
                                value={receivedQuantities[item.id] ?? item.quantity}
                                onChange={(e) => handleQuantityChange(item.id, e.target.value, item.quantity)}
                                className={`w-20 text-right border rounded-lg px-2 py-1.5 text-sm font-black outline-none transition-all
                                  focus:ring-4 focus:ring-purple-50
                                  ${isShort
                                    ? 'border-amber-300 text-amber-700 bg-amber-50 focus:border-amber-400'
                                    : 'border-gray-200 text-gray-900 bg-white focus:border-[#4C3073]'}`}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Botón de ejecución */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-gray-700 uppercase tracking-tight">
                    ¿Los productos coinciden con el manifiesto?
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                    Al confirmar, el stock se ingresará a <span className="text-[#4C3073] font-black">CUARENTENA</span> y la reserva quedará cerrada.
                    {hasDiscrepancy && <span className="text-amber-600 ml-2 font-black">Se registrará una discrepancia en los ítems.</span>}
                  </p>
                </div>
                <button
                  disabled={isProcessing || transferItems.length === 0}
                  onClick={handleConfirmReceipt}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg text-xs font-black uppercase tracking-widest
                    hover:bg-green-700 transition-all flex items-center gap-2 shadow-lg shadow-green-100
                    disabled:opacity-40 active:scale-95 shrink-0 ml-6"
                >
                  {isProcessing
                    ? <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                    : <><CheckCheck size={16} /> Confirmar Ingreso a Cuarentena</>
                  }
                </button>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-gray-300 text-center">
              <ArrowRightLeft size={80} className="mb-6 opacity-5" />
              <p className="text-lg font-black uppercase tracking-tighter">Seleccione un traspaso de la lista</p>
              <p className="text-xs font-bold uppercase mt-2">Haga clic en cualquier reserva pendiente para ver su detalle</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
