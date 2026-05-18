import React from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Plus, Package, Search, X, Check, ArrowLeft, Loader2, 
  Trash2, Box, Eye, Send, ChevronRight, FileText, 
  ClipboardList, Calendar, DollarSign, Truck, PackageCheck
} from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';

import { useSucursal } from '../context/SucursalContext';
import PurchaseOrdersList from '../components/purchase-orders/PurchaseOrdersList';
import PurchaseOrderDetail from '../components/purchase-orders/PurchaseOrderDetail';
import PurchaseOrderReceiveModal from '../components/purchase-orders/PurchaseOrderReceiveModal';
import usePurchaseOrders from '../hooks/usePurchaseOrders';

export default function OrdenesCompra() {
    const { activeWarehouse } = useSucursal();
    const location = useLocation();
    const quickPO = location.state?.quickPO || null;
    const draftPurchaseOrderId = location.state?.draftPurchaseOrderId || null;
    const {
        suppliers,
        products,
        loading,
        view,
        setView,
        saving,
        searchTerm,
        setSearchTerm,
        currentPO,
        setCurrentPO,
        selectedOrder,
        selectedOrderItems,
        orderReceipts,
        receiveItems,
        warehouses,
        stockMap,
        receiptData,
        setReceiptData,
        modalLoading,
        quickPOBanner,
        setQuickPOBanner,
        draftEditor,
        draftSaving,
        showCancelModal,
        setShowCancelModal,
        cancelReason,
        setCancelReason,
        cancelling,
        filteredOrders,
        isDraftOrder,
        isCancelableOrder,
        isCancelledOrder,
        currentPOTotals,
        refreshOrder: fetchInitialData,
        openOrderDetail,
        openReceiveModal,
        addBatchToItem,
        removeBatchFromItem,
        updateBatch,
        receiveOrder: handleReceiveOrder,
        handleAddItem,
        updateItem,
        removeItem,
        updateDraftHeader,
        updateDraftItem,
        removeDraftItem,
        addDraftProduct,
        saveDraftOrder,
        handleCancelOrder,
        handleApproveOrder,
        handleEmitOrder,
        createPurchaseOrder: handleCreatePO,
        formatPOReference,
        getStatusBadge,
        discardPurchaseOrderDraft,
    } = usePurchaseOrders({ activeWarehouse, quickPO, draftPurchaseOrderId });

    const calculateNet = () => currentPOTotals.net;
    const calculateTax = () => currentPOTotals.tax;
    const calculateTotal = () => currentPOTotals.total;

    if (view === 'receive' && selectedOrder) {
        return (
            <PurchaseOrderReceiveModal
              selectedOrder={selectedOrder}
              loading={loading}
              modalLoading={modalLoading}
              saving={saving}
              receiptData={receiptData}
              warehouses={warehouses}
              receiveItems={receiveItems}
              onBackToList={() => { setView('list'); fetchInitialData(); }}
              onBackToDetail={() => setView('detail')}
              onConfirmReceive={handleReceiveOrder}
              onReceiptDataChange={setReceiptData}
              onAddBatch={addBatchToItem}
              onRemoveBatch={removeBatchFromItem}
              onUpdateBatch={updateBatch}
            />
        );
    }

    if (view === 'list') {
        return (
            <PurchaseOrdersList
              loading={loading}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onNewOrder={() => setView('form')}
              filteredOrders={filteredOrders}
              formatPOReference={formatPOReference}
              getStatusBadge={getStatusBadge}
              onOpenDetail={openOrderDetail}
              onOpenReceive={openReceiveModal}
            />
        );
    }

    if (view === 'detail' && selectedOrder) {
        return (
            <PurchaseOrderDetail
              selectedOrder={selectedOrder}
              selectedOrderItems={selectedOrderItems}
              orderReceipts={orderReceipts}
              draftEditor={draftEditor}
              suppliers={suppliers}
              products={products}
              isDraftOrder={isDraftOrder}
              isCancelableOrder={isCancelableOrder}
              isCancelledOrder={isCancelledOrder}
              draftSaving={draftSaving}
              onBack={() => { setView('list'); fetchInitialData(); }}
              onOpenReceive={openReceiveModal}
              onSaveDraft={saveDraftOrder}
              onEmitDraft={saveDraftOrder}
              onUpdateDraftHeader={updateDraftHeader}
              onUpdateDraftItem={updateDraftItem}
              onRemoveDraftItem={removeDraftItem}
              onAddDraftProduct={addDraftProduct}
              onOpenCancel={() => { setCancelReason(''); setShowCancelModal(true); }}
              showCancelModal={showCancelModal}
              cancelReason={cancelReason}
              onCancelReasonChange={setCancelReason}
              onCloseCancel={() => { setShowCancelModal(false); setCancelReason(''); }}
              onConfirmCancel={handleCancelOrder}
              onApproveOrder={handleApproveOrder}
              onEmitOrder={handleEmitOrder}
              cancelling={cancelling}
              formatPOReference={formatPOReference}
              getStatusBadge={getStatusBadge}
            />
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden animate-in fade-in duration-150">
            {quickPOBanner && (
                <div className="mx-6 mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shrink-0">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Acción rápida</p>
                            <p className="font-black uppercase">Crear OC rápida</p>
                            <p className="text-xs font-bold mt-1">Producto sugerido: {quickPOBanner.product_name}</p>
                        </div>
                        <button onClick={() => setQuickPOBanner(null)} className="text-emerald-500 hover:text-emerald-700 font-black text-lg leading-none">×</button>
                    </div>
                </div>
            )}
    	    <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
                <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('list')}>Órdenes de Compra</span>
                    <ChevronRight size={12} className="mx-1" />
                    <span className="text-[#4C3073]">Nuevo Documento de Pedido</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                    <div className="flex gap-2">
                        <button onClick={handleCreatePO} disabled={saving} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm uppercase italic">
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            {saving ? 'Guardando...' : 'Enviar a aprobación'}
                        </button>
                        <button onClick={discardPurchaseOrderDraft} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">
                            Descartar
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-6xl mx-auto bg-white border border-gray-200 shadow-xl rounded-sm overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-6">
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 items-center">
                                <label className="text-[11px] font-black text-gray-400 uppercase text-right pr-6 tracking-widest">Folio</label>
                                <div className="col-span-2 flex items-center">
                                    <span className="bg-gray-100 border border-gray-200 text-gray-500 font-bold px-3 py-1.5 rounded-sm text-[10px] tracking-wider uppercase">Generado Automáticamente</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 items-center">
                                <label className="text-[11px] font-black text-gray-400 uppercase text-right pr-6 tracking-widest">Proveedor</label>
                                <div className="col-span-2">
                                    <SearchableSelect 
                                        options={suppliers.map(s => ({ value: s.id, label: s.legal_name || s.name, subLabel: `RUT: ${s.rut || s.tax_id || ''}` }))}
                                        value={currentPO.supplier_id}
                                        onChange={(val) => {
                                            const selectedSup = suppliers.find(s => s.id === val);
                                            setCurrentPO({
                                                ...currentPO, 
                                                supplier_id: val,
                                                payment_terms_days: selectedSup?.payment_terms_days || 0
                                            });
                                        }}
                                        placeholder="Seleccionar proveedor..."
                                        className="shadow-none border-gray-200"
                                    />
                                    {currentPO.supplier_id && (
                                        <div className="mt-1 text-[10px] font-bold text-[#4C3073] flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-sm w-fit border border-indigo-100">
                                            <ClipboardList size={10} />
                                            Condición de Pago: {currentPO.payment_terms_days} días
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 items-center">
                                <label className="text-[11px] font-black text-gray-400 uppercase text-right pr-6 tracking-widest">Entrega Esperada</label>
                                <div className="col-span-2 relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                    <input type="date" value={currentPO.expected_delivery_date} onChange={e => setCurrentPO({...currentPO, expected_delivery_date: e.target.value})} className="w-full rounded-sm border-gray-300 border pl-10 pr-3 py-2 text-xs font-bold focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all" />
                                </div>
                            </div>
                        </div>
                        
                        <div className="md:col-span-2 grid grid-cols-[1fr_minmax(0,5fr)] sm:grid-cols-[1fr_minmax(0,5fr)] items-start">
                            <label className="text-[11px] font-black text-gray-400 uppercase text-right pr-8 tracking-widest pt-2">Observaciones Técnicas</label>
                            <div className="col-span-1 border-l-4 border-l-[#4C3073] rounded-l-sm overflow-hidden">
                                <textarea 
                                    rows="2"
                                    placeholder="Ej: Mantener cadena de frío, documentación ISP requerida..."
                                    value={currentPO.observation_notes}
                                    onChange={e => setCurrentPO({...currentPO, observation_notes: e.target.value})}
                                    className="w-full rounded-r-sm border border-gray-300 border-l-0 px-4 py-2 text-xs font-medium focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none transition-all resize-y"
                                ></textarea>
                            </div>
                        </div>
                    </div>

                    <div className="px-10 border-b border-gray-200 bg-[#fcfcfc]">
                        <div className="inline-block border-b-2 border-[#4C3073] text-[#4C3073] px-6 py-3 font-black text-[11px] uppercase tracking-widest">
                            Detalle de Productos
                        </div>
                    </div>

                    <div className="p-0">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-[#f8f9fa] border-b border-gray-200">
                                <tr>
                                    <th className="px-10 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Producto</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-40 text-right">Cantidad</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-48 text-right">Costo Unit.</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-48 text-right">Subtotal</th>
                                    <th className="px-6 py-3 w-16 text-center text-gray-300"><Trash2 size={16}/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {currentPO.items.map((it, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors group border-b border-gray-100 last:border-0">
                                        <td className="px-10 py-4">
                                            <div className="font-bold text-gray-800 uppercase tracking-tight">{it.name}</div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                                                <span className="font-semibold uppercase tracking-wider">Unidad compra</span>
                                                <input
                                                    type="text"
                                                    value={it.purchase_uom || ''}
                                                    onChange={(e) => updateItem(idx, 'purchase_uom', e.target.value)}
                                                    placeholder="Ej: Caja clínica"
                                                    className="w-28 rounded-sm border border-gray-200 bg-white px-2 py-1 text-center font-bold text-[#4C3073] shadow-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
                                                />
                                                <span>×</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={Number(it.conversion_factor) > 0 ? Number(it.conversion_factor) : 1}
                                                    onChange={(e) => updateItem(idx, 'conversion_factor', e.target.value)}
                                                    className="w-16 text-center border border-gray-200 bg-white rounded-sm focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] outline-none py-1 font-bold text-[#4C3073] shadow-sm transition-all [&::-webkit-inner-spin-button]:appearance-none"
                                                />
                                                <span>unidades por embalaje</span>
                                                <span className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-gray-600">Venta: {it.sale_uom || 'UNIDAD'}</span>
                                                <span className="ml-2 font-mono text-[#4C3073] bg-purple-50 px-2 py-1 rounded-sm border border-purple-100 font-bold flex items-center gap-1">
                                                    {it.quantity || 0} Solicitadas × {Number(it.conversion_factor) > 0 ? Number(it.conversion_factor) : 1} Tasa = {(it.quantity || 0) * (Number(it.conversion_factor) > 0 ? Number(it.conversion_factor) : 1)} Unidades de Venta
                                                </span>
                                                <span className="w-full text-[10px] text-gray-400">Referencia: caja clínica, blister, frasco, ampolla.</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 align-middle"><input type="number" min="1" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="w-full text-right bg-transparent border-b border-transparent group-hover:border-gray-200 focus:border-[#4C3073] outline-none py-1 font-bold text-gray-900 [&::-webkit-inner-spin-button]:appearance-none" /></td>
                                        <td className="px-4 py-4 align-middle"><input type="number" min="0" value={it.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} className="w-full text-right bg-transparent border-b border-transparent group-hover:border-gray-200 focus:border-[#4C3073] outline-none py-1 font-bold text-gray-900 [&::-webkit-inner-spin-button]:appearance-none" /></td>
                                        <td className="px-4 py-4 align-middle text-right font-black text-[#4C3073] tabular-nums">${Number(it.quantity * it.unit_cost).toLocaleString('es-CL')}</td>
                                        <td className="px-6 py-4 align-middle text-center"><button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition-colors"><X size={16}/></button></td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50/50 cursor-pointer">
                                    <td className="px-10 py-4" colSpan="5">
                                        <SearchableSelect 
                                            options={products.map(p => ({ value: p.id, label: p.name, subLabel: `DCI: ${p.dci || p.active_ingredient || ''} | Stock local: ${stockMap[p.id] ?? 0} un` }))}
                                            value=""
                                            onChange={handleAddItem}
                                            placeholder="Haga clic para buscar y agregar fármacos al pedido..."
                                            className="shadow-none border-none bg-transparent"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="p-10 flex justify-end">
                            <div className="w-80 space-y-3 bg-[#f8f9fa] p-8 rounded-lg border border-gray-100">
                                <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                    <span>Subtotal Neto</span>
                                    <span className="text-gray-700">${calculateNet().toLocaleString('es-CL')}</span>
                                </div>
                                <div className="flex justify-between text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                    <span>IVA (19%)</span>
                                    <span className="text-gray-700">${calculateTax().toLocaleString('es-CL')}</span>
                                </div>
                                <div className="pt-4 border-t border-gray-200 flex justify-between items-end">
                                    <span className="text-sm font-black text-gray-900 uppercase italic">Total Orden</span>
                                    <span className="text-2xl font-black text-[#4C3073]">${calculateTotal().toLocaleString('es-CL')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
