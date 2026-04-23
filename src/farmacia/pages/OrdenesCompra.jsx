import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { 
  Plus, Package, Search, X, Check, ArrowLeft, Loader2, 
  Trash2, Box, Eye, Send, ChevronRight, FileText, 
  ClipboardList, Calendar, DollarSign, Truck, PackageCheck
} from 'lucide-react';
import { 
  fetchPharmacyProducts, 
  fetchSuppliers, 
  fetchPurchaseOrders, 
  fetchPurchaseOrderItems,
  createPurchaseOrderWithItems,
  receivePurchaseOrder,
  fetchOrderReceipts
} from '../api/pharmacyClient';
import SearchableSelect from '../components/SearchableSelect';

const BRAND_PRIMARY = '#4C3073';

export default function OrdenesCompra() {
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState(null);

    const [view, setView] = useState('list');
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [currentPO, setCurrentPO] = useState({
        supplier_id: '',
        expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        observation_notes: '',
        payment_terms_days: 0,
        items: []
    });
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedOrderItems, setSelectedOrderItems] = useState([]);
    const [orderReceipts, setOrderReceipts] = useState([]);
    const [receiveItems, setReceiveItems] = useState([]);
    
    const [receiptData, setReceiptData] = useState({ document_type: 'GUIA_DESPACHO', document_number: '', notes: '' });
    
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);

    const fetchInitialData = useCallback(async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUserId(user.id);

            if (view === 'list') {
                const res = await fetchPurchaseOrders();
                setPurchaseOrders(res.data || []);
            } else {
                const [supRes, prodRes] = await Promise.all([
                    fetchSuppliers(),
                    fetchPharmacyProducts()
                ]);
                setSuppliers(supRes.data || []);
                setProducts(prodRes.data || []);
            }
        } catch (error) {
            console.error('Error cargando datos de OC:', error);
        } finally {
            setLoading(false);
        }
    }, [view]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    const getStatusBadge = (status) => {
        const styles = {
            'PENDING': 'bg-indigo-50 text-indigo-700 border-indigo-100',
            'RECEIVED': 'bg-green-50 text-green-700 border-green-100',
            'CANCELLED': 'bg-red-50 text-red-700 border-red-100'
        };
        const labels = {
            'PENDING': 'Emitida',
            'RECEIVED': 'Recibida',
            'CANCELLED': 'Cancelada'
        };
        return (
            <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border ${styles[status]}`}>
                {labels[status] || status}
            </span>
        );
    };

    const formatPOReference = (poNumber) => {
        if (!poNumber) return 'OC-00000';
        const raw = String(poNumber).replace(/^OC-/, '');
        return `OC-${raw.padStart(5, '0')}`;
    };

    const openOrderDetail = async (po) => {
        try {
            setLoading(true);
            setSelectedOrder(po);
            const [resItems, resReceipts] = await Promise.all([
                fetchPurchaseOrderItems(po.id),
                fetchOrderReceipts(po.id)
            ]);
            setSelectedOrderItems(resItems.data || []);
            setOrderReceipts(resReceipts.data || []);
            setView('detail');
        } catch (error) {
            console.error('Error cargando detalles de OC:', error);
            alert('No se pudieron cargar los detalles de la orden.');
        } finally {
            setLoading(false);
        }
    };

    const openReceiveModal = async (po) => {
        try {
            setModalLoading(true);
            setSelectedOrder(po);
            const res = await fetchPurchaseOrderItems(po.id);
            const items = (res.data || []).map(item => ({
                ...item,
                batches: [{ entered_quantity: '', batch_number: '', expiry_date: '' }]
            }));
            setReceiveItems(items);
            setReceiptData({ document_type: 'GUIA_DESPACHO', document_number: '', notes: '', supplier_id: po.supplier_id });
            setView('receive');
        } catch (error) {
            console.error('Error cargando orden para recepción:', error);
            alert('No se pudieron cargar los datos de recepción.');
        } finally {
            setModalLoading(false);
        }
    };

    const addBatchToItem = (itemIndex) => {
        setReceiveItems(prev => {
            const newItems = [...prev];
            newItems[itemIndex].batches.push({ entered_quantity: '', batch_number: '', expiry_date: '' });
            return newItems;
        });
    };

    const removeBatchFromItem = (itemIndex, batchIndex) => {
        setReceiveItems(prev => {
            const newItems = [...prev];
            newItems[itemIndex].batches.splice(batchIndex, 1);
            return newItems;
        });
    };

    const updateBatch = (itemIndex, batchIndex, field, value) => {
        setReceiveItems(prev => {
            const newItems = [...prev];
            newItems[itemIndex].batches[batchIndex][field] = value;
            return newItems;
        });
    };

    const handleReceiveOrder = async () => {
        if (!receiptData.document_number) return alert('Ingrese el Número de Documento.');

        const batchesData = [];
        for (const item of receiveItems) {
            const receivedHist = Number(item.quantity_received || 0);
            const pending = item.quantity - receivedHist;
            let totalEntered = 0;
            
            for (const b of item.batches) {
                if (b.entered_quantity || b.batch_number || b.expiry_date) {
                    if (!b.entered_quantity || !b.batch_number || !b.expiry_date) {
                        alert('Complete todos los campos del lote para el producto: ' + (item.product?.name || item.name));
                        return;
                    }
                    totalEntered += Number(b.entered_quantity);
                    batchesData.push({
                        product_id: item.product_id,
                        po_item_id: item.id,
                        entered_quantity: Number(b.entered_quantity),
                        unit_cost: item.unit_cost,
                        batch_number: b.batch_number,
                        expiry_date: b.expiry_date,
                        conversion_factor: item.product?.conversion_factor || 1
                    });
                }
            }
            if (totalEntered > pending) {
                alert(`La cantidad a ingresar (${totalEntered}) supera la cantidad pendiente (${pending}) para el producto: ${item.product?.name || item.name}`);
                return;
            }
        }

        if (!batchesData.length) {
            alert('No hay lotes ingresados para recibir.');
            return;
        }

        setSaving(true);
        try {
            await receivePurchaseOrder(selectedOrder.id, batchesData, receiptData);
            alert('Recepción registrada correctamente.');
            openOrderDetail(selectedOrder);
        } catch (error) {
            console.error('Error recepcionando OC:', error);
            alert('Error al registrar la recepción: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleAddItem = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        setCurrentPO(prev => {
            const existingItem = prev.items.find(i => i.product_id === product.id);
            if (existingItem) {
                return {
                    ...prev,
                    items: prev.items.map(i =>
                        i.product_id === product.id
                            ? { ...i, quantity: Number(i.quantity) + 1 }
                            : i
                    )
                };
            }
            return {
                ...prev,
                items: [...prev.items, {
                    product_id: product.id,
                    name: product.name,
                    quantity: 1,
                    unit_cost: product.unit_price ?? product.cost_price ?? 0
                }]
            };
        });
    };

    const updateItem = (index, field, value) => {
        setCurrentPO(prev => {
            const newItems = [...prev.items];
            newItems[index] = {
                ...newItems[index],
                [field]: Number(value)
            };
            return { ...prev, items: newItems };
        });
    };

    const removeItem = (idx) => {
        setCurrentPO(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
    };

    const calculateNet = () => currentPO.items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
    const calculateTax = () => calculateNet() * 0.19;
    const calculateTotal = () => calculateNet() + calculateTax();

    const handleCreatePO = async () => {
        if (!currentPO.supplier_id || currentPO.items.length === 0) {
            alert("Debe seleccionar un proveedor y al menos un producto.");
            return;
        }
        
        setSaving(true);
        try {
            const totals = {
                net: calculateNet(),
                tax: calculateTax(),
                total: calculateTotal()
            };

            const headerData = {
                supplier_id: currentPO.supplier_id,
                expected_delivery_date: currentPO.expected_delivery_date,
                observation_notes: currentPO.observation_notes,
                total_net: totals.net,
                tax_amount: totals.tax,
                total_amount: totals.total,
                status: 'PENDING',
                payment_terms_days: currentPO.payment_terms_days,
                created_by: userId
            };

            await createPurchaseOrderWithItems(headerData, currentPO.items);
            
            alert("Orden de Compra generada con éxito");
            setView('list');
            setCurrentPO({
                supplier_id: '',
                expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                observation_notes: '',
                payment_terms_days: 0,
                items: []
            });
        } catch (error) {
            console.error("Error al crear OC:", error);
            alert("Error: " + error.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredOrders = purchaseOrders.filter(o => {
        const supplierLabel = (o.supplier?.commercial_name || o.supplier?.legal_name || '').toLowerCase();
        const poNumber = String(o.po_number || '').toLowerCase();
        return (
            supplierLabel.includes(searchTerm.toLowerCase()) ||
            poNumber.includes(searchTerm.toLowerCase()) ||
            String(o.status || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    if (view === 'receive' && selectedOrder) {
        return (
            <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60] animate-in slide-in-from-right duration-300">
                {/* Control Panel Superior */}
                <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
                    <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        <span className="hover:text-gray-900 cursor-pointer" onClick={() => { setView('list'); fetchInitialData(); }}>Órdenes de Compra</span>
                        <ChevronRight size={12} className="mx-1" />
                        <span className="hover:text-gray-900 cursor-pointer" onClick={() => setView('detail')}>{formatPOReference(selectedOrder.po_number)}</span>
                        <ChevronRight size={12} className="mx-1" />
                        <span className="text-[#4C3073]">Recepción de Mercadería</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <div className="flex gap-2">
                            <button onClick={() => setView('detail')} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                                <ArrowLeft size={16} /> Volver
                            </button>
                        </div>
                        <div>
                           <button onClick={handleReceiveOrder} disabled={saving} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
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
                                        <h1 className="text-xl font-black text-[#4C3073] tracking-tight">Recepción para {formatPOReference(selectedOrder.po_number)}</h1>
                                        <p className="text-gray-500 font-medium mt-1">{selectedOrder.supplier?.commercial_name || selectedOrder.supplier?.legal_name || 'Sin proveedor'}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-x-10 gap-y-4 text-xs text-gray-600 mb-6 bg-white p-6 shadow-sm rounded-sm border border-gray-200">
                                    <div className="grid grid-cols-3 items-center">
                                        <label className="text-gray-500 font-bold text-[11px] text-right pr-4 uppercase tracking-tighter">Tipo Documento</label>
                                        <select 
                                            value={receiptData.document_type}
                                            onChange={e => setReceiptData({...receiptData, document_type: e.target.value})}
                                            className="col-span-2 w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
                                        >
                                            <option value="GUIA_DESPACHO">Guía de Despacho</option>
                                            <option value="FACTURA">Factura de Compra</option>
                                            <option value="BOLETA">Boleta</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 items-center">
                                        <label className="text-gray-500 font-bold text-[11px] text-right pr-4 uppercase tracking-tighter">N° Documento</label>
                                        <input 
                                            type="text"
                                            placeholder="Folio..."
                                            value={receiptData.document_number}
                                            onChange={e => setReceiptData({...receiptData, document_number: e.target.value.toUpperCase()})}
                                            className="col-span-2 w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] font-bold italic text-[#4C3073]"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-start col-span-2">
                                        <label className="text-gray-500 font-bold text-[11px] text-right pr-4 pt-1 uppercase tracking-tighter">Observaciones</label>
                                        <textarea 
                                            rows="2"
                                            value={receiptData.notes}
                                            onChange={e => setReceiptData({...receiptData, notes: e.target.value})}
                                            className="col-span-2 w-full rounded-sm border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073] resize-none"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-sm border border-gray-200 bg-white p-6 shadow-sm">
                                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-4 border-b pb-2">Líneas de Recepción</h4>
                                    <div className="space-y-4">
                                        {receiveItems.map((item, idx) => {
                                            const receivedHist = Number(item.quantity_received || 0);
                                            const pending = item.quantity - receivedHist;
                                            const uom = item.product?.purchase_uom || 'Unidad';

                                            return (
                                                <div key={idx} className="rounded-md border border-gray-100 bg-gray-50 p-4">
                                                    <div className="mb-3 flex justify-between items-center border-b border-gray-200 pb-2">
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-800">{item.product?.name || item.name}</p>
                                                            <p className="text-xs text-gray-500">
                                                                Pedida: <b>{item.quantity}</b> | Recibida: <b>{receivedHist}</b> | Pendiente: <b className="text-red-500">{pending}</b> | Costo: <b>${Number(item.unit_cost || 0).toLocaleString('es-CL')}</b>
                                                            </p>
                                                        </div>
                                                        {pending > 0 && (
                                                            <button onClick={() => addBatchToItem(idx)} className="text-xs bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-3 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                                                <Plus size={14} /> Añadir Lote
                                                            </button>
                                                        )}
                                                    </div>
                                                    
                                                    {pending === 0 ? (
                                                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider bg-emerald-50 inline-block px-2 py-1 rounded">Línea completada</p>
                                                    ) : (
                                                        <div className="space-y-3 mt-4">
                                                            {item.batches.map((batch, bIdx) => (
                                                                <div key={bIdx} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end bg-white p-3 rounded-md border border-gray-200 shadow-sm relative">
                                                                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500">
                                                                        Cantidad a Ingresar
                                                                        <span className="block text-[9px] text-[#4C3073] font-normal normal-case mb-1">Cantidad (en {uom})</span>
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            value={batch.entered_quantity}
                                                                            onChange={e => updateBatch(idx, bIdx, 'entered_quantity', e.target.value)}
                                                                            className="w-full rounded-sm border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
                                                                            placeholder="Ej: 10"
                                                                        />
                                                                    </label>
                                                                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500">
                                                                        N° de Lote
                                                                        <span className="block text-[9px] text-transparent mb-1">-</span>
                                                                        <input
                                                                            type="text"
                                                                            value={batch.batch_number}
                                                                            onChange={e => updateBatch(idx, bIdx, 'batch_number', e.target.value)}
                                                                            className="w-full rounded-sm border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
                                                                            placeholder="Lote"
                                                                        />
                                                                    </label>
                                                                    <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500">
                                                                        Fecha de Vencimiento
                                                                        <span className="block text-[9px] text-transparent mb-1">-</span>
                                                                        <input
                                                                            type="date"
                                                                            value={batch.expiry_date}
                                                                            onChange={e => updateBatch(idx, bIdx, 'expiry_date', e.target.value)}
                                                                            className="w-full rounded-sm border border-gray-300 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[#4C3073] focus:ring-1 focus:ring-[#4C3073]"
                                                                        />
                                                                    </label>
                                                                    <button onClick={() => removeBatchFromItem(idx, bIdx)} className="mb-2 text-gray-400 hover:text-red-500 p-1.5 bg-gray-50 rounded-full shadow-sm border border-gray-200 ml-2 transition-colors" title="Quitar Lote">
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === 'list') {
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
                                onClick={() => setView('form')} 
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
                                onChange={e => setSearchTerm(e.target.value)} 
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
                                {filteredOrders.map(po => (
                                    <tr key={po.id} className="hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => openOrderDetail(po)}>
                                        <td className="px-4 py-4 font-bold text-[#4C3073]">{formatPOReference(po.po_number)}</td>
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
                                        <td className="px-4 py-4 text-center">{getStatusBadge(po.status)}</td>
                                        <td className="px-4 py-4 text-center">
                                            {po.status === 'PENDING' || po.status === 'PARTIAL' ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); openReceiveModal(po); }}
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

    if (view === 'detail' && selectedOrder) {
        return (
            <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60] animate-in slide-in-from-right duration-300">
                {/* Control Panel Superior */}
                <div className="border-b border-gray-200 px-6 py-3 bg-white flex flex-col gap-2 shadow-sm shrink-0">
                    <div className="flex items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        <span className="hover:text-gray-900 cursor-pointer" onClick={() => { setView('list'); fetchInitialData(); }}>Órdenes de Compra</span>
                        <ChevronRight size={12} className="mx-1" />
                        <span className="text-[#4C3073]">{formatPOReference(selectedOrder.po_number)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <div className="flex gap-2">
                            {(selectedOrder.status === 'PENDING' || selectedOrder.status === 'PARTIAL') && (
                                <button onClick={() => openReceiveModal(selectedOrder)} className="bg-[#4C3073] hover:bg-[#3d265c] text-white px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2">
                                    <Truck size={16} /> Recibir Mercadería
                                </button>
                            )}
                            <button onClick={() => { setView('list'); fetchInitialData(); }} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-2">
                                <ArrowLeft size={16} /> Volver
                            </button>
                        </div>
                        <div>{getStatusBadge(selectedOrder.status)}</div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-6xl mx-auto space-y-6">
                        
                        {/* Cabecera */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-sm p-8 flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-black text-[#4C3073] tracking-tight">{formatPOReference(selectedOrder.po_number)}</h1>
                                <p className="text-gray-500 font-medium mt-1">{selectedOrder.supplier?.commercial_name || selectedOrder.supplier?.legal_name || 'Sin proveedor'}</p>
                            </div>
                            <div className="text-right text-xs space-y-1">
                                <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Fecha Emisión:</span> <span className="font-mono">{new Date(selectedOrder.created_at).toLocaleDateString()}</span></p>
                                <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Entrega Esperada:</span> <span className="font-mono">{new Date(selectedOrder.expected_delivery_date).toLocaleDateString()}</span></p>
                                <p><span className="text-gray-400 font-bold uppercase tracking-widest mr-2">Condición Pago:</span> <span className="font-mono">{selectedOrder.payment_terms_days} días</span></p>
                            </div>
                        </div>

                        {/* Recepciones (Inventory Receipts) */}
                        {orderReceipts.length > 0 && (
                            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
                                <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Documentos de Recepción</h3>
                                </div>
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                                        <tr>
                                            <th className="px-6 py-3">Tipo</th>
                                            <th className="px-6 py-3">N° Documento</th>
                                            <th className="px-6 py-3">Fecha</th>
                                            <th className="px-6 py-3">Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {orderReceipts.map(r => (
                                            <tr key={r.id} className="hover:bg-gray-50/50">
                                                <td className="px-6 py-3">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-sm text-[9px] font-black border uppercase ${
                                                        r.document_type === 'FACTURA' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                                                    }`}>
                                                        {r.document_type === 'FACTURA' ? 'Factura' : r.document_type === 'GUIA_DESPACHO' ? 'Guía Despacho' : r.document_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 font-mono font-bold text-[#4C3073]">{r.document_number}</td>
                                                <td className="px-6 py-3 font-mono text-gray-500">{new Date(r.received_date || r.created_at).toLocaleDateString()}</td>
                                                <td className="px-6 py-3 text-gray-400 italic truncate max-w-xs">{r.notes || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Detalle de Productos */}
                        <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
                            <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Detalle de Productos</h3>
                            </div>
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                                    <tr>
                                        <th className="px-6 py-3">Producto</th>
                                        <th className="px-6 py-3 text-right">Pedido</th>
                                        <th className="px-6 py-3 text-right">Recibido</th>
                                        <th className="px-6 py-3 text-right">Costo Unit.</th>
                                        <th className="px-6 py-3 text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {selectedOrderItems.map(item => {
                                        const isComplete = Number(item.quantity_received || 0) >= Number(item.quantity);
                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50/50">
                                                <td className="px-6 py-4 font-bold text-gray-800 uppercase tracking-tight">
                                                    {item.product?.name || item.name}
                                                    {item.product?.barcode && <span className="block text-[9px] font-normal text-gray-400 mt-0.5 font-mono">SKU: {item.product.barcode}</span>}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-gray-600">{item.quantity}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={`font-mono font-bold ${isComplete ? 'text-green-600' : 'text-gray-400'}`}>
                                                        {item.quantity_received || 0}
                                                    </span>
                                                </td>
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
                                        return (
                                            <>
                                                <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                                    <span>Subtotal Neto:</span>
                                                    <span className="text-gray-700 font-mono">${receivedSubtotal.toLocaleString('es-CL')}</span>
                                                </div>
                                                <div className="flex justify-between text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                                    <span>IVA (19%):</span>
                                                    <span className="text-gray-700 font-mono">${receivedTax.toLocaleString('es-CL')}</span>
                                                </div>
                                                <div className="flex justify-between pt-3 mt-3 border-t border-gray-300">
                                                    <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Total Recibido:</span>
                                                    <span className="text-lg font-black text-[#4C3073] font-mono">${receivedTotal.toLocaleString('es-CL')}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-800 text-sm overflow-hidden absolute inset-0 z-[60] animate-in slide-in-from-right duration-300">
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
                            {saving ? 'Guardando...' : 'Emitir Orden'}
                        </button>
                        <button onClick={() => setView('list')} className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">
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
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-10 py-3 font-bold text-gray-700 uppercase tracking-tight">{it.name}</td>
                                        <td className="px-4 py-3"><input type="number" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="w-full text-right bg-transparent border-b border-transparent group-hover:border-gray-200 focus:border-[#4C3073] outline-none py-1 font-bold text-gray-900" /></td>
                                        <td className="px-4 py-3"><input type="number" value={it.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} className="w-full text-right bg-transparent border-b border-transparent group-hover:border-gray-200 focus:border-[#4C3073] outline-none py-1 font-bold text-gray-900" /></td>
                                        <td className="px-4 py-3 text-right font-black text-[#4C3073] tabular-nums">${Number(it.quantity * it.unit_cost).toLocaleString('es-CL')}</td>
                                        <td className="px-6 py-3 text-center"><button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500"><X size={16}/></button></td>
                                    </tr>
                                ))}
                                <tr className="bg-gray-50/50 cursor-pointer">
                                    <td className="px-10 py-4" colSpan="5">
                                        <SearchableSelect 
                                            options={products.map(p => ({ value: p.id, label: p.name, subLabel: `DCI: ${p.dci || p.active_ingredient || ''} | Stock: ${p.stock_quantity || 0}` }))}
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
