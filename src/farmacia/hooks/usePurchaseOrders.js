import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../api/supabaseClient';
import {
  fetchPharmacyProducts,
  fetchSuppliers,
  fetchPurchaseOrders,
  fetchPurchaseOrderItems,
  createPurchaseOrderWithItems,
  updatePurchaseOrderDraft,
  fetchLastPurchaseUnitCost,
  cancelPurchaseOrder,
  approvePurchaseOrder,
  emitPurchaseOrder,
  receivePurchaseOrder,
  fetchOrderReceipts,
  fetchWarehouses,
  logAuditEvent,
  getMyCompanyId,
} from '../api/pharmacyClient';
import { calculatePurchaseOrderTotals } from '../utils/purchaseOrders/calculateTotals';
import { formatPurchaseOrderReference } from '../utils/purchaseOrders/formatPurchaseOrder';
import { getPurchaseOrderStatusMeta } from '../utils/purchaseOrders/purchaseOrderStatus';

const initialPurchaseOrder = () => ({
  supplier_id: '',
  expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  observation_notes: '',
  payment_terms_days: 0,
  items: [],
});

const initialReceiptData = {
  document_type: 'GUIA_DESPACHO',
  document_number: '',
  notes: '',
  warehouse_id: '',
};

export default function usePurchaseOrders({ activeWarehouse, quickPO, draftPurchaseOrderId }) {
  const appliedQuickPOKeyRef = useRef(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [view, setView] = useState('list');
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPO, setCurrentPO] = useState(initialPurchaseOrder());
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [orderReceipts, setOrderReceipts] = useState([]);
  const [receiveItems, setReceiveItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [receiptData, setReceiptData] = useState(initialReceiptData);
  const [modalLoading, setModalLoading] = useState(false);
  const [quickPOBanner, setQuickPOBanner] = useState(null);
  const [draftEditor, setDraftEditor] = useState(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const quickPOKey = quickPO ? JSON.stringify({
    product_id: quickPO.product_id || null,
    product_name: quickPO.product_name || null,
    quantity: Number(quickPO.quantity || 0),
    unit_cost: Number(quickPO.unit_cost || 0),
    conversion_factor: quickPO.conversion_factor ?? null,
    observation_notes: quickPO.observation_notes || null,
  }) : null;

  const fetchInitialData = useCallback(async () => {
    if (!activeWarehouse?.id) return;

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      if (view === 'list') {
        const [poRes, whRes] = await Promise.all([
          fetchPurchaseOrders(activeWarehouse.id),
          fetchWarehouses(),
        ]);
        setPurchaseOrders(poRes.data || []);
        setWarehouses(whRes.data || []);
      } else {
        const [supRes, prodRes, batchRes] = await Promise.all([
          fetchSuppliers(),
          fetchPharmacyProducts(),
          supabase
            .schema('pharmacy')
            .from('inventory_batches')
            .select('product_id, current_quantity, location:location_id!inner(warehouse_id, location_type)')
            .eq('location.warehouse_id', activeWarehouse.id),
        ]);

        setSuppliers(supRes.data || []);
        setProducts(prodRes.data || []);

        const newStockMap = {};
        (batchRes.data || []).forEach((b) => {
          const activeQty = b.location?.location_type === 'QUARANTINE' ? 0 : Math.max(0, Number(b.current_quantity || 0));
          newStockMap[b.product_id] = (newStockMap[b.product_id] || 0) + activeQty;
        });
        setStockMap(newStockMap);
      }
    } catch (error) {
      console.error('Error cargando datos de OC:', error);
    } finally {
      setLoading(false);
    }
  }, [activeWarehouse?.id, view]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (!quickPO || !activeWarehouse?.id || loading) return;
    if (appliedQuickPOKeyRef.current === quickPOKey) return;

    setQuickPOBanner(quickPO);
    setView('form');
    setCurrentPO((prev) => ({
      ...prev,
      observation_notes: quickPO.observation_notes || prev.observation_notes,
      items: quickPO.product_id ? [{
        product_id: quickPO.product_id,
        name: quickPO.product_name,
        quantity: Number(quickPO.quantity || 1),
        unit_cost: Number(quickPO.unit_cost || 0),
        purchase_uom: quickPO.purchase_uom || '',
        sale_uom: quickPO.sale_uom || '',
        conversion_factor: Number(quickPO.conversion_factor) > 0 ? Number(quickPO.conversion_factor) : null,
      }] : prev.items,
    }));
    appliedQuickPOKeyRef.current = quickPOKey;
  }, [quickPO, activeWarehouse?.id, loading, quickPOKey]);

  const openOrderDetail = useCallback(async (po) => {
    try {
      setLoading(true);
      setSelectedOrder(po);
      const [resItems, resReceipts] = await Promise.all([
        fetchPurchaseOrderItems(po.id),
        fetchOrderReceipts(po.id),
      ]);
      const items = resItems.data || [];
      let draftItems = items;
      if (po.status === 'DRAFT') {
        draftItems = await Promise.all(items.map(async (item) => {
          const { data: historicalCost } = await fetchLastPurchaseUnitCost(po.warehouse_id || activeWarehouse?.id, item.product_id);
          return { ...item, last_purchase_unit_cost: Number(historicalCost || 0) };
        }));
      }

      setSelectedOrderItems(draftItems);
      setOrderReceipts(resReceipts.data || []);
      if (po.status === 'DRAFT') {
      setDraftEditor({
          supplier_id: po.supplier_id || '',
          expected_delivery_date: po.expected_delivery_date || '',
          observation_notes: po.observation_notes || '',
          payment_terms_days: Number(po.payment_terms_days || 0),
          items: draftItems.map((item) => ({
            product_id: item.product_id,
            name: item.product?.name || item.name,
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.unit_cost || 0),
            last_purchase_unit_cost: Number(item.last_purchase_unit_cost || 0),
            conversion_factor: Number(item.conversion_factor || item.product?.conversion_factor || 0) > 0 ? Number(item.conversion_factor || item.product?.conversion_factor) : null,
            purchase_uom: item.purchase_uom || item.product?.purchase_uom || '',
            sale_uom: item.product?.sale_uom || 'UNIDAD',
          })),
        });
      } else {
        setDraftEditor(null);
      }
      setView('detail');
    } catch (error) {
      console.error('Error cargando detalles de OC:', error);
      alert('No se pudieron cargar los detalles de la orden.');
    } finally {
      setLoading(false);
    }
  }, [activeWarehouse?.id]);

  useEffect(() => {
    if (!draftPurchaseOrderId || !activeWarehouse?.id || loading || view !== 'list') return;

    const draftOrder = purchaseOrders.find((order) => order.id === draftPurchaseOrderId);
    if (draftOrder) openOrderDetail(draftOrder);
  }, [draftPurchaseOrderId, activeWarehouse?.id, loading, view, purchaseOrders, openOrderDetail]);

  const openReceiveModal = useCallback(async (po) => {
    try {
      setModalLoading(true);
      setSelectedOrder(po);
      const res = await fetchPurchaseOrderItems(po.id);
      const items = (res.data || []).map((item) => ({ ...item, batches: [{ entered_quantity: '', batch_number: '', expiry_date: '' }] }));
      setReceiveItems(items);
      setReceiptData({
        document_type: 'GUIA_DESPACHO',
        document_number: '',
        notes: '',
        supplier_id: po.supplier_id,
        warehouse_id: activeWarehouse?.id || '',
      });
      setView('receive');
    } catch (error) {
      console.error('Error cargando orden para recepción:', error);
      alert('No se pudieron cargar los datos de recepción.');
    } finally {
      setModalLoading(false);
    }
  }, [activeWarehouse?.id]);

  const addBatchToItem = useCallback((itemIndex) => {
    setReceiveItems((prev) => {
      const newItems = [...prev];
      const updatedBatches = [...newItems[itemIndex].batches, { entered_quantity: '', batch_number: '', expiry_date: '' }];
      newItems[itemIndex] = { ...newItems[itemIndex], batches: updatedBatches };
      return newItems;
    });
  }, []);

  const removeBatchFromItem = useCallback((itemIndex, batchIndex) => {
    setReceiveItems((prev) => {
      const newItems = [...prev];
      const updatedBatches = [...newItems[itemIndex].batches];
      updatedBatches.splice(batchIndex, 1);
      newItems[itemIndex] = { ...newItems[itemIndex], batches: updatedBatches };
      return newItems;
    });
  }, []);

  const updateBatch = useCallback((itemIndex, batchIndex, field, value) => {
    setReceiveItems((prev) => {
      const newItems = [...prev];
      const updatedBatches = [...newItems[itemIndex].batches];
      updatedBatches[batchIndex] = { ...updatedBatches[batchIndex], [field]: value };
      newItems[itemIndex] = { ...newItems[itemIndex], batches: updatedBatches };
      return newItems;
    });
  }, []);

  const receiveOrder = useCallback(async () => {
    if (!receiptData.warehouse_id) return alert('Debe seleccionar una bodega de destino.');
    if (!receiptData.document_number) return alert('Ingrese el Número de Documento.');

    const batchesData = [];
    for (const item of receiveItems) {
      for (const b of item.batches) {
        if (b.entered_quantity || b.batch_number || b.expiry_date) {
          if (!b.entered_quantity || !b.batch_number || !b.expiry_date) {
            alert('Complete todos los campos del lote para el producto: ' + (item.product?.name || item.name));
            return;
          }
          batchesData.push({
            product_id: item.product_id,
            po_item_id: item.id,
            entered_quantity: Number(b.entered_quantity),
            unit_cost: item.unit_cost,
            batch_number: b.batch_number,
            expiry_date: b.expiry_date,
            conversion_factor: item.conversion_factor || item.product?.conversion_factor || 1,
          });
        }
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
  }, [receiptData, receiveItems, selectedOrder, openOrderDetail]);

  const handleAddItem = useCallback(async (productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const { data: lastPurchaseCost } = await fetchLastPurchaseUnitCost(activeWarehouse.id, product.id);

    setCurrentPO((prev) => {
      const existingItem = prev.items.find((i) => i.product_id === product.id);
      if (existingItem) {
        return {
          ...prev,
          items: prev.items.map((i) => (i.product_id === product.id ? { ...i, quantity: Number(i.quantity) + 1 } : i)),
        };
      }
      return {
        ...prev,
        items: [...prev.items, {
          product_id: product.id,
          name: product.name,
          quantity: 1,
          unit_cost: Number(lastPurchaseCost || 0),
          purchase_uom: product.purchase_uom || '',
          sale_uom: product.sale_uom || '',
          conversion_factor: Number(product.conversion_factor) > 0 ? Number(product.conversion_factor) : null,
        }],
      };
    });
  }, [activeWarehouse?.id, products]);

  const updateItem = useCallback((index, field, value) => {
    setCurrentPO((prev) => {
      const newItems = [...prev.items];
      const parsedValue = (field === 'purchase_uom' || field === 'sale_uom') ? String(value).toUpperCase() : value;
      newItems[index] = {
        ...newItems[index],
        [field]: (field === 'purchase_uom' || field === 'sale_uom') ? parsedValue : (field === 'conversion_factor' ? (Number(value) > 0 ? Number(value) : null) : Number(value)),
      };
      return { ...prev, items: newItems };
    });
  }, []);

  const removeItem = useCallback((idx) => {
    setCurrentPO((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }, []);

  const updateDraftHeader = useCallback((field, value) => {
    setDraftEditor((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const updateDraftItem = useCallback((index, field, value) => {
    setDraftEditor((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[index] = {
        ...items[index],
        [field]: field === 'name' || field === 'purchase_uom' || field === 'sale_uom' ? String(value).toUpperCase() : (field === 'conversion_factor' ? (Number(value) > 0 ? Number(value) : null) : Number(value)),
      };
      return { ...prev, items };
    });
  }, []);

  const removeDraftItem = useCallback((index) => {
    setDraftEditor((prev) => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : prev));
  }, []);

  const addDraftProduct = useCallback(async (productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const { data: lastPurchaseCost } = await fetchLastPurchaseUnitCost(activeWarehouse?.id, product.id);

    setDraftEditor((prev) => {
      if (!prev) return prev;
      const existing = prev.items.find((item) => item.product_id === product.id);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((item) => (item.product_id === product.id ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item)),
        };
      }

      return {
        ...prev,
        items: [...prev.items, {
          product_id: product.id,
          name: product.name,
          quantity: 1,
          unit_cost: Number(lastPurchaseCost || 0),
          conversion_factor: Number(product.conversion_factor) > 0 ? Number(product.conversion_factor) : null,
          purchase_uom: product.purchase_uom || '',
          sale_uom: product.sale_uom || '',
        }],
      };
    });
  }, [activeWarehouse?.id, products]);

  const saveDraftOrder = useCallback(async (emit = false) => {
    if (!selectedOrder || !draftEditor) return;
    if (!draftEditor.items.length) {
      alert('Debe mantener al menos una línea en la orden.');
      return;
    }

    setDraftSaving(true);
    try {
      const payload = {
        supplier_id: draftEditor.supplier_id || null,
        expected_delivery_date: draftEditor.expected_delivery_date || null,
        observation_notes: draftEditor.observation_notes || null,
        payment_terms_days: draftEditor.payment_terms_days || 0,
        items: draftEditor.items.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity || 0),
          unit_cost: Number(item.unit_cost || 0),
          conversion_factor: Number(item.conversion_factor || 0) > 0 ? Number(item.conversion_factor) : 1,
          purchase_uom: item.purchase_uom || null,
        })),
        emit,
      };

      const { data, error } = await updatePurchaseOrderDraft(selectedOrder.id, payload);
      if (error) throw error;

      const companyId = await getMyCompanyId();
      const productUpdates = draftEditor.items
        .filter((item) => item.product_id)
        .map((item) => ({
          product_id: item.product_id,
          purchase_uom: item.purchase_uom || '',
          conversion_factor: Number(item.conversion_factor || 0) > 0 ? Number(item.conversion_factor) : 1,
        }))
        .filter((item) => item.purchase_uom || item.conversion_factor);

      await Promise.all(productUpdates.map(async (item) => {
        const current = selectedOrderItems.find((line) => line.product_id === item.product_id);
        const currentPurchaseUom = current?.product?.purchase_uom || current?.purchase_uom || '';
        const currentConversionFactor = Number(current?.product?.conversion_factor || current?.conversion_factor || 0);
        const shouldUpdate = item.purchase_uom !== currentPurchaseUom || Number(item.conversion_factor) !== currentConversionFactor;
        if (!shouldUpdate) return;

        const { error: productError } = await supabase
          .schema('pharmacy')
          .from('products')
          .update({ purchase_uom: item.purchase_uom || null, conversion_factor: item.conversion_factor })
          .eq('company_id', companyId)
          .eq('id', item.product_id);

        if (!productError) {
          await logAuditEvent('PRODUCT_PURCHASE_UOM_UPDATED', 'Unidad de compra actualizada desde pre-orden', {
            product_id: item.product_id,
            purchase_order_id: selectedOrder.id,
            purchase_uom: item.purchase_uom || null,
            conversion_factor: item.conversion_factor,
          });
        }
      }));

      alert(emit ? 'Orden enviada a aprobación.' : 'Borrador guardado correctamente.');
      await openOrderDetail({ ...selectedOrder, status: data?.status || (emit ? 'WAITING_APPROVAL' : 'DRAFT') });
      await fetchInitialData();
    } catch (error) {
      console.error('Error guardando borrador:', error);
      alert('Error: ' + error.message);
    } finally {
      setDraftSaving(false);
    }
  }, [draftEditor, fetchInitialData, openOrderDetail, selectedOrder, selectedOrderItems]);

  const discardPurchaseOrderDraft = useCallback(() => {
    appliedQuickPOKeyRef.current = quickPOKey;
    setQuickPOBanner(null);
    setCurrentPO(initialPurchaseOrder());
    setView('list');
  }, [quickPOKey]);

  const handleCancelOrder = useCallback(async () => {
    if (!selectedOrder) return;
    if (!cancelReason.trim()) {
      alert('Debe indicar un motivo de anulación.');
      return;
    }

    setCancelling(true);
    try {
      const { data, error } = await cancelPurchaseOrder(selectedOrder.id, cancelReason);
      if (error) throw error;

      alert('Orden anulada correctamente.');
      setShowCancelModal(false);
      setCancelReason('');
      await openOrderDetail({ ...selectedOrder, status: data?.status || 'CANCELLED' });
      await fetchInitialData();
    } catch (error) {
      console.error('Error anulando orden:', error);
      alert('Error: ' + error.message);
    } finally {
      setCancelling(false);
    }
  }, [cancelReason, fetchInitialData, openOrderDetail, selectedOrder]);

  const handleApproveOrder = useCallback(async () => {
    if (!selectedOrder) return;

    setSaving(true);
    try {
      const { data, error } = await approvePurchaseOrder(selectedOrder.id);
      if (error) throw error;

      alert('Orden aprobada correctamente.');
      await openOrderDetail({ ...selectedOrder, status: data?.status || 'APPROVED' });
      await fetchInitialData();
    } catch (error) {
      console.error('Error aprobando orden:', error);
      alert('Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  }, [fetchInitialData, openOrderDetail, selectedOrder]);

  const handleEmitOrder = useCallback(async () => {
    if (!selectedOrder) return;

    setSaving(true);
    try {
      const { data, error } = await emitPurchaseOrder(selectedOrder.id);
      if (error) throw error;

      alert('Orden emitida correctamente.');
      await openOrderDetail({ ...selectedOrder, status: data?.status || 'PENDING' });
      await fetchInitialData();
    } catch (error) {
      console.error('Error emitiendo orden:', error);
      alert('Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  }, [fetchInitialData, openOrderDetail, selectedOrder]);

  const handleCreatePurchaseOrder = useCallback(async () => {
    if (!currentPO.supplier_id || currentPO.items.length === 0) {
      alert('Debe seleccionar un proveedor y al menos un producto.');
      return;
    }

    setSaving(true);
    try {
      const totals = calculatePurchaseOrderTotals(currentPO.items);
      const headerData = {
        supplier_id: currentPO.supplier_id,
        expected_delivery_date: currentPO.expected_delivery_date,
        observation_notes: currentPO.observation_notes,
        total_net: totals.net,
        tax_amount: totals.tax,
        total_amount: totals.total,
        status: 'WAITING_APPROVAL',
        payment_terms_days: currentPO.payment_terms_days,
        warehouse_id: activeWarehouse.id,
        created_by: userId,
      };

      await createPurchaseOrderWithItems(headerData, currentPO.items);

      alert('Orden enviada a aprobación.');
      setView('list');
      setCurrentPO(initialPurchaseOrder());
    } catch (error) {
      console.error('Error al crear OC:', error);
      alert('Error: ' + error.message);
    } finally {
      setSaving(false);
    }
  }, [activeWarehouse?.id, currentPO, userId]);

  const filteredOrders = useMemo(() => purchaseOrders.filter((o) => {
    const supplierLabel = (o.supplier?.commercial_name || o.supplier?.legal_name || '').toLowerCase();
    const poNumber = String(o.po_number || '').toLowerCase();
    return supplierLabel.includes(searchTerm.toLowerCase()) || poNumber.includes(searchTerm.toLowerCase()) || String(o.status || '').toLowerCase().includes(searchTerm.toLowerCase());
  }), [purchaseOrders, searchTerm]);

  const isDraftOrder = selectedOrder?.status === 'DRAFT';
  const hasReceiptActivity = orderReceipts.length > 0 || selectedOrderItems.some((item) => Number(item.quantity_received || 0) > 0);
  const isCancelableOrder = selectedOrder?.status === 'DRAFT' || (selectedOrder?.status === 'PENDING' && !hasReceiptActivity);
  const isCancelledOrder = selectedOrder?.status === 'CANCELLED';
  const currentPOTotals = calculatePurchaseOrderTotals(currentPO.items);

  return {
    purchaseOrders,
    suppliers,
    products,
    loading,
    userId,
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
    setDraftEditor,
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
    receiveOrder,
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
    createPurchaseOrder: handleCreatePurchaseOrder,
    formatPOReference: formatPurchaseOrderReference,
    getStatusBadge: (status) => {
      const meta = getPurchaseOrderStatusMeta(status);
      return meta;
    },
    discardPurchaseOrderDraft,
  };
}
