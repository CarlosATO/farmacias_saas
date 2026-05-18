import React from 'react';
import { ArrowLeft, Check, ChevronRight, Send, ShieldCheck, Truck, X } from 'lucide-react';
import { formatPurchaseOrderReference } from '../../utils/purchaseOrders/formatPurchaseOrder';
import { getPurchaseOrderStatusMeta } from '../../utils/purchaseOrders/purchaseOrderStatus';
import PurchaseOrderDraftEditor from './PurchaseOrderDraftEditor';
import PurchaseOrderCancelModal from './PurchaseOrderCancelModal';

export default function PurchaseOrderDetail({
  selectedOrder,
  selectedOrderItems,
  orderReceipts,
  draftEditor,
  suppliers,
  products,
  isDraftOrder,
  isCancelableOrder,
  isCancelledOrder,
  draftSaving,
  onBack,
  onOpenReceive,
  onSaveDraft,
  onEmitDraft,
  onUpdateDraftHeader,
  onUpdateDraftItem,
  onRemoveDraftItem,
  onAddDraftProduct,
  onOpenCancel,
  showCancelModal,
  cancelReason,
  onCancelReasonChange,
  onCloseCancel,
  onConfirmCancel,
  onApproveOrder,
  onEmitOrder,
  cancelling,
}) {
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden animate-in fade-in duration-150">
      <PurchaseOrderCancelModal
        open={showCancelModal}
        cancelReason={cancelReason}
        onCancelReasonChange={onCancelReasonChange}
        onClose={onCloseCancel}
        onConfirm={onConfirmCancel}
        cancelling={cancelling}
      />

      <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
        <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
          <span className="hover:text-gray-900 cursor-pointer" onClick={onBack}>Órdenes de Compra</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-[#4C3073]">{formatPurchaseOrderReference(selectedOrder.po_number)}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            {(selectedOrder.status === 'PENDING' || selectedOrder.status === 'PARTIAL') && (
              <button onClick={() => onOpenReceive(selectedOrder)} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2">
                <Truck size={16} /> Recibir Mercadería
              </button>
            )}
            {isDraftOrder && (
              <>
                <button onClick={() => onSaveDraft(false)} disabled={draftSaving} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
                  <Check size={16} /> Guardar borrador
                </button>
                <button onClick={() => onEmitDraft(true)} disabled={draftSaving} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
                  <Send size={16} /> Enviar a aprobación
                </button>
              </>
            )}
            {isCancelableOrder && (
              <button type="button" onClick={onOpenCancel} className="bg-white border border-red-200 text-red-700 hover:bg-red-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                <X size={16} /> Anular orden
              </button>
            )}
            {selectedOrder.status === 'WAITING_APPROVAL' && (
              <button type="button" onClick={onApproveOrder} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2">
                <ShieldCheck size={16} /> Aprobar orden
              </button>
            )}
            {selectedOrder.status === 'APPROVED' && (
              <button type="button" onClick={onEmitOrder} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2">
                <Send size={16} /> Emitir orden
              </button>
            )}
            <button onClick={onBack} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
              <ArrowLeft size={16} /> Volver
            </button>
          </div>
          <div>
            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border ${getPurchaseOrderStatusMeta(selectedOrder.status).className}`}>
              {getPurchaseOrderStatusMeta(selectedOrder.status).label}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-8 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black text-[#4C3073] tracking-tight">{formatPurchaseOrderReference(selectedOrder.po_number)}</h1>
              <p className="text-gray-500 font-medium mt-1">{selectedOrder.supplier?.commercial_name || selectedOrder.supplier?.legal_name || 'Sin proveedor'}</p>
              {selectedOrder.origin_source && <p className="mt-1 text-[11px] font-black uppercase tracking-widest text-[#4C3073]">Origen: {selectedOrder.origin_source.replaceAll('_', ' ')}</p>}
              {isCancelledOrder && <p className="mt-2 inline-flex rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-700">Orden anulada</p>}
            </div>
            <div className="text-right text-xs space-y-1">
              <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Fecha Emisión:</span> <span className="font-mono">{new Date(selectedOrder.created_at).toLocaleDateString()}</span></p>
              <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Entrega Esperada:</span> <span className="font-mono">{new Date(selectedOrder.expected_delivery_date).toLocaleDateString()}</span></p>
              <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Condición Pago:</span> <span className="font-mono">{selectedOrder.payment_terms_days} días</span></p>
            </div>
          </div>

          {isDraftOrder ? (
              <PurchaseOrderDraftEditor
                draftEditor={draftEditor}
                suppliers={suppliers}
                products={products}
                selectedOrder={selectedOrder}
                onUpdateHeader={onUpdateDraftHeader}
                onUpdateItem={onUpdateDraftItem}
                onRemoveItem={onRemoveDraftItem}
                onAddProduct={onAddDraftProduct}
              />
          ) : (
            <>
              {orderReceipts.length > 0 && (
                <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
                  <div className="bg-gray-50 border-b border-gray-200 px-6 py-3"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos de Recepción</h3></div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400 font-bold"><tr><th className="px-6 py-3">Tipo</th><th className="px-6 py-3">N° Documento</th><th className="px-6 py-3">Fecha</th><th className="px-6 py-3">Notas</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {orderReceipts.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50/50"><td className="px-6 py-3"><span className={`inline-flex px-2 py-0.5 rounded-sm text-[9px] font-black border uppercase ${r.document_type === 'FACTURA' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>{r.document_type === 'FACTURA' ? 'Factura' : r.document_type === 'GUIA_DESPACHO' ? 'Guía Despacho' : r.document_type}</span></td><td className="px-6 py-3 font-mono font-bold text-[#4C3073]">{r.document_number}</td><td className="px-6 py-3 font-mono text-gray-500">{new Date(r.received_date || r.created_at).toLocaleDateString()}</td><td className="px-6 py-3 text-gray-400 italic truncate max-w-xs">{r.notes || '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-6 py-3"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Detalle de Productos</h3></div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400 font-bold"><tr><th className="px-6 py-3">Producto</th><th className="px-6 py-3 text-right">Pedido</th><th className="px-6 py-3 text-right">Recibido</th><th className="px-6 py-3 text-right">Costo Unit.</th><th className="px-6 py-3 text-right">Subtotal</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedOrderItems.map((item) => {
                      const isComplete = Number(item.quantity_received || 0) >= Number(item.quantity);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-800 uppercase tracking-tight">{item.product?.name || item.name}{item.product?.barcode && <span className="block text-[9px] font-normal text-gray-400 mt-0.5 font-mono">SKU: {item.product.barcode}</span>}</td>
                          <td className="px-6 py-4 text-right font-mono text-gray-600">{item.quantity}</td>
                          <td className="px-6 py-4 text-right"><span className={`font-mono font-bold ${isComplete ? 'text-green-600' : 'text-gray-400'}`}>{item.quantity_received || 0}</span></td>
                          <td className="px-6 py-4 text-right font-mono text-gray-600">${Number(item.unit_cost).toLocaleString('es-CL')}</td>
                          <td className="px-6 py-4 text-right font-mono font-black text-[#4C3073]">${(Number(item.quantity_received || 0) * Number(item.unit_cost)).toLocaleString('es-CL')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="bg-gray-50 p-6 flex justify-end border-t border-gray-200">
                  <div className="w-64 space-y-2">
                    {(() => {
                      const receivedSubtotal = selectedOrderItems.reduce((sum, l) => sum + (Number(l.quantity_received || 0) * Number(l.unit_cost)), 0);
                      const receivedTax = receivedSubtotal * 0.19;
                      const receivedTotal = receivedSubtotal + receivedTax;
                      return (<><div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest"><span>Subtotal Neto:</span><span className="text-gray-700 font-mono">${receivedSubtotal.toLocaleString('es-CL')}</span></div><div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest"><span>IVA (19%):</span><span className="text-gray-700 font-mono">${receivedTax.toLocaleString('es-CL')}</span></div><div className="flex justify-between pt-3 mt-3 border-t border-gray-300"><span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Total Recibido:</span><span className="text-lg font-black text-[#4C3073] font-mono">${receivedTotal.toLocaleString('es-CL')}</span></div></>);
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
