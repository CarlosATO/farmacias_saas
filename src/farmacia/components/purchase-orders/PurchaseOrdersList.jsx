import React from 'react';
import { Calendar, Check, ChevronRight, Loader2, Search, Truck } from 'lucide-react';
import { formatPurchaseOrderReference } from '../../utils/purchaseOrders/formatPurchaseOrder';
import { getPurchaseOrderStatusMeta } from '../../utils/purchaseOrders/purchaseOrderStatus';

export default function PurchaseOrdersList({
  loading,
  searchTerm,
  onSearchChange,
  onNewOrder,
  filteredOrders,
  onOpenDetail,
  onOpenReceive,
}) {
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white font-sans text-gray-800 text-sm overflow-hidden border border-gray-200 rounded-sm shadow-sm">
      <div className="border-b border-gray-200 px-4 py-2 bg-white flex flex-col gap-2 shrink-0">
        <div className="flex items-center text-[11px] text-gray-500 uppercase tracking-widest font-bold">
          <span>Farmacia</span>
          <ChevronRight size={12} className="mx-1" />
          <span className="text-gray-900">Órdenes de Compra</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onNewOrder}
              className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95"
            >
              Nuevo Pedido
            </button>
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar pedidos o proveedores..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="block w-full rounded-sm border-gray-300 border pl-8 pr-3 py-1.5 text-xs focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50/30">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
            <Loader2 className="animate-spin" size={24} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Sincronizando con Servidor...</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#f8f9fa] border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Referencia</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Proveedor</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Fecha Entrega</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Total (Neto)</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Estado</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredOrders.map((po) => (
                <tr key={po.id} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => onOpenDetail(po)}>
                  <td className="px-4 py-4 font-bold text-[#4C3073]">{formatPurchaseOrderReference(po.po_number)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Truck size={14} className="text-gray-400" />
                      <span className="font-semibold">{po.supplier?.commercial_name || po.supplier?.legal_name || 'Proveedor sin nombre'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-500 flex items-center gap-2">
                    <Calendar size={12} />
                    {new Date(po.expected_delivery_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 text-right font-black text-gray-900">
                    ${Number(po.total_net).toLocaleString('es-CL')}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border ${getPurchaseOrderStatusMeta(po.status).className}`}>
                      {getPurchaseOrderStatusMeta(po.status).label}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {po.status === 'PENDING' || po.status === 'PARTIAL' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReceive(po);
                        }}
                        className="bg-[#4C3073] text-white text-[11px] font-bold uppercase px-3 py-1 rounded-sm hover:bg-[#3d265c] transition"
                      >
                        Recibir Mercadería
                      </button>
                    ) : po.status === 'RECEIVED' ? (
                      <span className="inline-flex items-center gap-1 text-green-700 font-bold">
                        <Check size={14} />
                        Completado
                      </span>
                    ) : (
                      <span className="text-gray-500 text-[11px] uppercase tracking-wider">Sin acción</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
