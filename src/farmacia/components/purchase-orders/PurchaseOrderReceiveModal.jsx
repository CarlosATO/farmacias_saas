import React from 'react';
import { ArrowLeft, Loader2, PackageCheck, Plus, X } from 'lucide-react';
import { calculateReceivedTotals } from '../../utils/purchaseOrders/calculateTotals';

export default function PurchaseOrderReceiveModal({
  selectedOrder,
  modalLoading,
  saving,
  receiptData,
  warehouses,
  receiveItems,
  onBackToList,
  onBackToDetail,
  onConfirmReceive,
  onReceiptDataChange,
  onAddBatch,
  onRemoveBatch,
  onUpdateBatch,
}) {
  const receivedTotals = calculateReceivedTotals(receiveItems);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden animate-in fade-in duration-150">
      <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
        <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          <span className="hover:text-gray-900 cursor-pointer" onClick={onBackToList}>Órdenes de Compra</span>
          <span className="mx-1">›</span>
          <span className="hover:text-gray-900 cursor-pointer" onClick={onBackToDetail}>{selectedOrder?.po_number}</span>
          <span className="mx-1">›</span>
          <span className="text-[#4C3073]">Recepción de Mercadería</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button onClick={onBackToDetail} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
              <ArrowLeft size={16} /> Volver
            </button>
          </div>
          <div>
            <button onClick={onConfirmReceive} disabled={saving} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
              <PackageCheck size={16} /> {saving ? 'Guardando...' : 'Confirmar Recepción'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {modalLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-6 mb-6 flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-black text-[#4C3073] tracking-tight">Recepción para {selectedOrder?.po_number}</h1>
                  <p className="text-gray-500 font-medium mt-1">{selectedOrder?.supplier?.commercial_name || selectedOrder?.supplier?.legal_name || 'Sin proveedor'}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-white shadow-sm rounded-sm border border-gray-200">
                <div className="grid grid-cols-3 items-center col-span-2 md:col-span-1">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-4 uppercase tracking-tighter">Bodega Destino</label>
                  <select value={receiptData.warehouse_id} onChange={(e) => onReceiptDataChange({ ...receiptData, warehouse_id: e.target.value })} className="col-span-2 w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] font-bold text-[#4C3073]">
                    <option value="">Seleccione...</option>
                    {warehouses.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 items-center col-span-2 md:col-span-1">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-4 uppercase tracking-tighter">Tipo Doc.</label>
                  <select value={receiptData.document_type} onChange={(e) => onReceiptDataChange({ ...receiptData, document_type: e.target.value })} className="col-span-2 w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] font-bold text-[#4C3073]">
                    <option value="GUIA_DESPACHO">Guía Despacho</option>
                    <option value="FACTURA">Factura</option>
                    <option value="BOLETA">Boleta</option>
                    <option value="AJUSTE">Ajuste</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 items-center col-span-2 md:col-span-1">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-4 uppercase tracking-tighter">N° Documento</label>
                  <input type="text" placeholder="Folio..." value={receiptData.document_number} onChange={(e) => onReceiptDataChange({ ...receiptData, document_number: e.target.value.toUpperCase() })} className="col-span-2 w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] font-bold italic text-[#4C3073]" />
                </div>
                <div className="grid grid-cols-3 items-start col-span-2">
                  <label className="text-gray-500 font-bold text-[11px] text-right pr-4 pt-1 uppercase tracking-tighter">Observaciones</label>
                  <textarea rows="2" value={receiptData.notes} onChange={(e) => onReceiptDataChange({ ...receiptData, notes: e.target.value })} className="col-span-2 w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] resize-none" />
                </div>
              </div>

              <div className="rounded-sm border border-gray-200 bg-white p-6 shadow-sm">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-4 border-b pb-2">Líneas de Recepción</h4>
                <div className="space-y-4">
                  {receiveItems.map((item, idx) => {
                    const receivedHist = Number(item.quantity_received || 0);
                    const pending = item.quantity - receivedHist;
                    const uom = item.product?.purchase_uom || 'Cajas/Embalajes';
                    const factor = item.conversion_factor || item.product?.conversion_factor || 1;
                    const expectedUnits = item.quantity * factor;
                    const lineEntered = item.batches.reduce((sum, b) => sum + Number(b.entered_quantity || 0), 0);

                    return (
                      <div key={idx} className="rounded-md border border-gray-100 bg-gray-50 p-4 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gray-200"><div className={`h-full ${receivedHist >= item.quantity ? 'bg-green-500' : 'bg-[#4C3073]'}`} style={{ width: `${Math.min(100, (receivedHist / item.quantity) * 100)}%` }} /></div>
                        <div className="mb-3 flex justify-between items-start border-b border-gray-200 pb-3 mt-1">
                          <div>
                            <p className="text-lg font-black text-[#4C3073] uppercase tracking-tight">{item.product?.name || item.name}</p>
                            <div className="flex gap-4 mt-2">
                              <span className="bg-white border border-gray-200 px-2 py-1 rounded-sm text-[10px] font-bold text-gray-500">PEDIDO: <span className="text-gray-900">{item.quantity} {uom}</span></span>
                              <span className="bg-white border border-gray-200 px-2 py-1 rounded-sm text-[10px] font-bold text-gray-500">FACTOR: <span className="text-gray-900">x{factor}</span></span>
                              <span className="bg-purple-50 border border-purple-100 px-2 py-1 rounded-sm text-[10px] font-bold text-[#4C3073]">ESPERADO: {expectedUnits} UNIDADES DE VENTA</span>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <div className="flex gap-2 items-center">
                              <div className="text-[10px] font-bold text-gray-500">PROGRESO:</div>
                              <div className={`px-3 py-1 rounded-sm text-xs font-black border ${pending === 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>Ingresando: {lineEntered + receivedHist} / Pedido: {item.quantity}</div>
                            </div>
                            {pending > 0 && (
                              <button onClick={() => onAddBatch(idx)} className="mt-2 text-[10px] bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                <Plus size={12} /> Añadir Lote
                              </button>
                            )}
                          </div>
                        </div>

                        {pending === 0 ? (
                          <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider bg-emerald-50 inline-block px-2 py-1 rounded mt-2 border border-emerald-100">✓ Línea completada en recepciones anteriores</p>
                        ) : (
                          <div className="space-y-2 mt-3">
                            {item.batches.map((batch, bIdx) => (
                              <div key={bIdx} className="grid grid-cols-1 gap-3 sm:grid-cols-[0.7fr_1.2fr_1fr_0.9fr_1fr_auto] items-end bg-white p-3 rounded-md border border-gray-200 shadow-sm relative group hover:border-[#4C3073]/30 transition-colors">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Cant. Ingresada<span className="block text-[9px] text-[#4C3073] font-normal normal-case mb-1">Cajas/Emb.</span><input type="number" min="1" value={batch.entered_quantity} onChange={(e) => onUpdateBatch(idx, bIdx, 'entered_quantity', e.target.value)} className="w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] font-bold [&::-webkit-inner-spin-button]:appearance-none" placeholder="Ej: 10" /></label>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">N° de Lote<span className="block text-[9px] text-transparent mb-1">-</span><input type="text" value={batch.batch_number} onChange={(e) => onUpdateBatch(idx, bIdx, 'batch_number', e.target.value)} className="w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] font-mono" placeholder="Lote" /></label>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Vencimiento<span className="block text-[9px] text-transparent mb-1">-</span><input type="date" value={batch.expiry_date} onChange={(e) => onUpdateBatch(idx, bIdx, 'expiry_date', e.target.value)} className="w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]" /></label>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">Costo Unit.<span className="block text-[9px] text-transparent mb-1">-</span><div className="w-full rounded-sm border border-transparent bg-gray-50 px-2 py-1.5 text-xs text-gray-600 font-mono h-[34px] flex items-center">${Number(item.unit_cost || 0).toLocaleString('es-CL')}</div></label>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-[#4C3073]">Subtotal Lote<span className="block text-[9px] text-transparent mb-1">-</span><div className="w-full rounded-sm border border-purple-100 bg-purple-50 px-2 py-1.5 text-xs text-[#4C3073] font-bold font-mono h-[34px] flex items-center">${(Number(batch.entered_quantity || 0) * Number(item.unit_cost || 0)).toLocaleString('es-CL')}</div></label>
                                <button onClick={() => onRemoveBatch(idx, bIdx)} className="mb-1 text-gray-400 hover:text-red-500 p-1.5 bg-gray-50 rounded-full shadow-sm border border-gray-200 ml-1 transition-colors opacity-50 group-hover:opacity-100" title="Quitar Lote"><X size={14} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-6 flex justify-end">
                <div className="w-80 space-y-3 bg-[#f8f9fa] p-6 rounded-lg border border-gray-100">
                  <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest"><span>Subtotal Ingresado</span><span className="text-gray-700">${receivedTotals.subtotal.toLocaleString('es-CL')}</span></div>
                  <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest"><span>IVA (19%)</span><span className="text-gray-700">${receivedTotals.tax.toLocaleString('es-CL')}</span></div>
                  <div className="pt-4 border-t border-gray-200 flex justify-between items-end"><span className="text-sm font-black text-gray-900 uppercase italic">Total a Recibir</span><span className="text-2xl font-black text-[#4C3073]">${receivedTotals.total.toLocaleString('es-CL')}</span></div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
