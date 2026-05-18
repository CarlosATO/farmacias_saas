import React from 'react';
import { Calendar, Trash2 } from 'lucide-react';
import SearchableSelect from '../SearchableSelect';
import { calculatePurchaseOrderTotals } from '../../utils/purchaseOrders/calculateTotals';

export default function PurchaseOrderDraftEditor({
  draftEditor,
  suppliers,
  products,
  selectedOrder,
  onUpdateHeader,
  onUpdateItem,
  onRemoveItem,
  onAddProduct,
}) {
  const draftTotals = calculatePurchaseOrderTotals(draftEditor?.items || []);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="grid grid-cols-3 items-center">
            <label className="text-[11px] font-black text-gray-400 uppercase text-right pr-6 tracking-widest">Proveedor</label>
            <div className="col-span-2">
              <SearchableSelect
                options={suppliers.map((s) => ({ value: s.id, label: s.legal_name || s.name, subLabel: `RUT: ${s.rut || s.tax_id || ''}` }))}
                value={draftEditor?.supplier_id || ''}
                onChange={(val) => {
                  const selectedSup = suppliers.find((s) => s.id === val);
                  onUpdateHeader('supplier_id', val);
                  onUpdateHeader('payment_terms_days', selectedSup?.payment_terms_days || 0);
                }}
                placeholder="Seleccionar proveedor..."
                className="shadow-none border-gray-200"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 items-center">
            <label className="text-[11px] font-black text-gray-400 uppercase text-right pr-6 tracking-widest">Entrega Esperada</label>
            <div className="col-span-2 relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="date"
                value={draftEditor?.expected_delivery_date || ''}
                onChange={(e) => onUpdateHeader('expected_delivery_date', e.target.value)}
                className="w-full rounded-sm border-gray-300 border pl-10 pr-3 py-2 text-xs font-bold focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all"
              />
            </div>
          </div>
          <div className="md:col-span-2 grid grid-cols-[1fr_minmax(0,5fr)] items-start">
            <label className="text-[11px] font-black text-gray-400 uppercase text-right pr-8 tracking-widest pt-2">Observaciones</label>
            <div className="col-span-1 border-l-4 border-l-[#4C3073] rounded-l-sm overflow-hidden">
              <textarea
                rows="2"
                value={draftEditor?.observation_notes || ''}
                onChange={(e) => onUpdateHeader('observation_notes', e.target.value)}
                className="w-full rounded-r-sm border border-gray-300 border-l-0 px-4 py-2 text-xs font-medium focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all resize-y"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-sm border border-gray-100">
          <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest md:block"><span>Subtotal Neto</span><span className="text-gray-700 font-mono">${draftTotals.net.toLocaleString('es-CL')}</span></div>
          <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest md:block"><span>IVA (19%)</span><span className="text-gray-700 font-mono">${draftTotals.tax.toLocaleString('es-CL')}</span></div>
          <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest md:block"><span>Total Orden</span><span className="text-gray-700 font-mono">${draftTotals.total.toLocaleString('es-CL')}</span></div>
          <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest md:block"><span>Origen</span><span className="text-[#4C3073] font-mono">{selectedOrder.origin_source?.replaceAll('_', ' ') || 'REPOSICION INTELIGENTE'}</span></div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Editor de líneas</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#4C3073]">1 compra = factor conversión = unidades venta</span>
        </div>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
            <tr>
              <th className="px-6 py-3">Producto</th>
              <th className="px-6 py-3 text-right">Pedido</th>
              <th className="px-6 py-3 text-right">Costo Unit.</th>
              <th className="px-6 py-3 text-right">Subtotal</th>
              <th className="px-6 py-3 w-16 text-center text-gray-300"><Trash2 size={16} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(draftEditor?.items || []).map((item, idx) => {
              const factor = Number(item.conversion_factor) > 0 ? Number(item.conversion_factor) : 1;
              return (
                <tr key={`${item.product_id}-${idx}`} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-bold text-gray-800 uppercase tracking-tight">
                    {item.name}
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-normal text-gray-500 normal-case">
                      <span className="font-semibold uppercase tracking-wider">Unidad compra</span>
                      <input
                        type="text"
                        value={item.purchase_uom || ''}
                        onChange={(e) => onUpdateItem(idx, 'purchase_uom', e.target.value)}
                        placeholder="Ej: Caja clínica"
                        className="w-28 rounded-sm border border-gray-200 bg-white px-2 py-1 text-center font-bold text-[#4C3073] shadow-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
                      />
                      <span>×</span>
                      <input
                        type="number"
                        min="1"
                        value={factor}
                        onChange={(e) => onUpdateItem(idx, 'conversion_factor', e.target.value)}
                        className="w-16 text-center border border-gray-200 bg-white rounded-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none py-1 font-bold text-[#4C3073] shadow-sm transition-all [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span>unidades por embalaje</span>
                      <span className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-gray-600">Venta: {item.sale_uom || 'UNIDAD'}</span>
                      <span className="w-full text-[10px] text-gray-400">Referencia: caja clínica, blister, frasco, ampolla.</span>
                    </span>
                    <span className="block text-[10px] font-normal text-slate-500 mt-1">Costo borrador: {Number(item.unit_cost || 0) > 0 ? `$${Number(item.unit_cost).toLocaleString('es-CL')}` : 'Sin costo'}</span>
                    <span className="block text-[10px] font-normal text-emerald-700 mt-1">Último costo real: {Number(item.last_purchase_unit_cost || 0) > 0 ? `$${Number(item.last_purchase_unit_cost).toLocaleString('es-CL')}` : 'Sin último costo confiable'}</span>
                  </td>
                  <td className="px-4 py-4 align-middle">
                    <input type="number" min="1" value={item.quantity} onChange={(e) => onUpdateItem(idx, 'quantity', e.target.value)} className="w-full text-right bg-transparent border-b border-transparent group-hover:border-gray-200 focus:border-[#4C3073] outline-none py-1 font-bold text-gray-900 [&::-webkit-inner-spin-button]:appearance-none" />
                  </td>
                  <td className="px-4 py-4 align-middle">
                    <input type="number" min="0" value={item.unit_cost} onChange={(e) => onUpdateItem(idx, 'unit_cost', e.target.value)} className="w-full text-right bg-transparent border-b border-transparent group-hover:border-gray-200 focus:border-[#4C3073] outline-none py-1 font-bold text-gray-900 [&::-webkit-inner-spin-button]:appearance-none" />
                  </td>
                  <td className="px-4 py-4 align-middle text-right font-black text-[#4C3073] tabular-nums">${Number(item.quantity * item.unit_cost).toLocaleString('es-CL')}</td>
                  <td className="px-6 py-4 align-middle text-center"><button type="button" onClick={() => onRemoveItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></td>
                </tr>
              );
            })}
            <tr className="bg-gray-50/50 cursor-pointer">
              <td className="px-10 py-4" colSpan="5">
                <SearchableSelect
                  options={products.map((p) => ({ value: p.id, label: p.name, subLabel: `DCI: ${p.dci || p.active_ingredient || ''} | Compra: ${p.purchase_uom || 'CAJA'} | 1=${p.conversion_factor || 1} ${p.sale_uom || 'UNIDAD'}` }))}
                  value=""
                  onChange={onAddProduct}
                  placeholder="Buscar y agregar productos al borrador..."
                  className="shadow-none border-none bg-transparent"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white shadow-sm p-6 flex justify-end">
        <div className="w-72 space-y-2">
          <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest"><span>Proveedor</span><span className="text-gray-700 font-mono">{draftEditor?.supplier_id ? 'Seleccionado' : 'Sin proveedor'}</span></div>
          <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest"><span>Estado</span><span className="text-gray-700 font-mono">{selectedOrder.status}</span></div>
          <div className="flex justify-between pt-3 mt-3 border-t border-gray-300">
            <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Total OC:</span>
            <span className="text-lg font-black text-[#4C3073] font-mono">${draftTotals.total.toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
