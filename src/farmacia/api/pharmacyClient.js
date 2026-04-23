import { supabase } from '../../api/supabaseClient';

// Helper para apuntar siempre al esquema 'pharmacy'
export const getPharmacySchema = () => supabase.schema('pharmacy');

/**
 * Obtiene el ID de la compañía vinculada al usuario autenticado.
 * Busca en la tabla public.company_users.
 */
export const getMyCompanyId = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Usuario no autenticado");

  const { data, error } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    console.error("Error obteniendo company_id:", error);
    return null;
  }
  return data.company_id;
};

// Función base para obtener productos del inventario médico
export const fetchPharmacyProducts = async () => {
  return await getPharmacySchema().from('products').select('*');
};

// Obtener catálogo de pacientes
export const fetchPharmacyPatients = async () => {
  return await getPharmacySchema().from('patients').select('*').order('created_at', { ascending: false });
};

// Obtener todas las recetas médicas
export const fetchPrescriptions = async () => {
  return await getPharmacySchema().from('prescriptions').select('*, patient:patient_id(*)').order('created_at', { ascending: false });
};

// Crear una nueva receta médica con items (Transaccional con Inyección de Company ID)
export const createPrescriptionWithItems = async (prescriptionData, items) => {
  const schema = getPharmacySchema();
  
  // 1. Obtener Company ID para cumplir con RLS
  const companyId = await getMyCompanyId();
  if (!companyId) {
    return { error: { message: "No se pudo determinar el Company ID del colaborador activo." } };
  }

  // 2. Inyectar Company ID en la cabecera
  const finalHeaderData = {
    ...prescriptionData,
    company_id: companyId
  };

  // 3. Insertar Cabecera
  const { data: headerData, error: headerError } = await schema
    .from('prescriptions')
    .insert([finalHeaderData])
    .select()
    .single();

  if (headerError) return { error: headerError };

  // 4. Preparar Items
  const itemsWithHeaderId = items.map(item => ({
    ...item,
    prescription_id: headerData.id
  }));

  // 5. Insertar Items
  const { data: itemsData, error: itemsError } = await schema
    .from('prescription_items')
    .insert(itemsWithHeaderId);

  if (itemsError) return { error: itemsError, headerId: headerData.id };

  return { data: { header: headerData, items: itemsData }, error: null };
};

export const fetchPrescriptionItems = async (prescriptionId) => {
  return await getPharmacySchema()
    .from('prescription_items')
    .select('*, product:product_id(*)')
    .eq('prescription_id', prescriptionId);
};

// --- OPERACIONES DE VENTA (POS) ---
export const createSaleWithItems = async (saleHeader, items) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Acceso denegado: No se encontró vinculación con una empresa.");

  const finalHeader = {
    ...saleHeader,
    company_id: companyId,
    sale_date: new Date().toISOString()
  };

  const { data: header, error: headerError } = await schema
    .from('sales')
    .insert([finalHeader])
    .select()
    .single();

  if (headerError) throw headerError;

  const itemsWithSale = items.map(item => ({
    ...item,
    sale_id: header.id,
    company_id: companyId
  }));

  const { error: itemsError } = await schema
    .from('sale_items')
    .insert(itemsWithSale);

  if (itemsError) throw itemsError;

  if (saleHeader.prescription_id) {
    await schema
      .from('prescriptions')
      .update({ status: 'DISPENSED' })
      .eq('id', saleHeader.prescription_id);
  }

  return header;
};

export const findPendingPrescription = async (folio) => {
  const { data, error } = await getPharmacySchema()
    .from('prescriptions')
    .select('*, patient:patient_id(*)')
    .eq('folio', folio)
    .eq('status', 'PENDING')
    .single();

  if (error) return null;
  return data;
};

// --- ÓRDENES DE COMPRA (LOGÍSTICA) ---
export const fetchSuppliers = async () => {
  // Ahora los proveedores pertenecen al esquema 'pharmacy' (aislamiento del módulo)
  return await getPharmacySchema().from('suppliers').select('*').order('created_at', { ascending: false });
};

export const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
};

export const fetchPurchaseOrders = async () => {
  return await getPharmacySchema()
    .from('purchase_orders')
    .select('*, supplier:supplier_id(*)')
    .order('created_at', { ascending: false });
};

export const fetchPurchaseOrderItems = async (purchaseOrderId) => {
  return await getPharmacySchema()
    .from('purchase_order_items')
    .select('*, product:product_id(*)')
    .eq('po_id', purchaseOrderId);
};

export const fetchOrderReceipts = async (poId) => {
  return await getPharmacySchema()
    .from('inventory_receipts')
    .select('id, document_type, document_number, received_date, notes, created_at')
    .eq('po_id', poId)
    .order('created_at', { ascending: false });
};

export const receivePurchaseOrder = async (poId, batchesData, receiptData) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No se pudo obtener el ID de la compañía.");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No se pudo obtener el usuario actual.");

  // 1. Get QUARANTINE location
  const { data: locData, error: locError } = await schema
    .from('locations')
    .select('id')
    .eq('company_id', companyId)
    .eq('location_type', 'QUARANTINE')
    .limit(1)
    .maybeSingle();

  if (locError) throw new Error("Error obteniendo ubicación QUARANTINE: " + locError.message);
  if (!locData) throw new Error("No se encontró la ubicación de Cuarentena para esta empresa. Contacte a soporte.");
  const locationId = locData.id;

  const itemUpdates = {};
  const batchesToInsert = [];

  // 2. Iterate batchesData to prepare inserts and group updates
  for (const batch of batchesData) {
    const factor = Number(batch.conversion_factor) || 1;
    const fractionatedQty = Number(batch.entered_quantity) * factor;

    batchesToInsert.push({
      company_id: companyId,
      product_id: batch.product_id,
      location_id: locationId,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      initial_quantity: fractionatedQty,
      current_quantity: fractionatedQty,
      po_id: poId
    });

    if (!itemUpdates[batch.po_item_id]) {
      itemUpdates[batch.po_item_id] = { entered_total: 0, product_id: batch.product_id, fractionated_total: 0 };
    }
    itemUpdates[batch.po_item_id].entered_total += Number(batch.entered_quantity);
    itemUpdates[batch.po_item_id].fractionated_total += fractionatedQty;
  }

  // Perform Inserts
  if (batchesToInsert.length > 0) {
    // 0. Insert Receipt (Header)
    const { data: receipt, error: receiptErr } = await schema
      .from('inventory_receipts')
      .insert([{
        company_id: companyId,
        po_id: poId,
        supplier_id: receiptData.supplier_id,
        document_type: receiptData.document_type,
        document_number: receiptData.document_number,
        notes: receiptData.notes,
        created_by: userId
      }])
      .select()
      .single();

    if (receiptErr) throw receiptErr;

    // 1. Insert Batches and get the generated IDs
    const { data: insertedBatches, error: batchErr } = await schema
      .from('inventory_batches')
      .insert(batchesToInsert)
      .select();

    if (batchErr) throw batchErr;

    // 2. Prepare Movements using the inserted batch IDs
    const movementsToInsert = insertedBatches.map((insertedBatch, index) => {
      // Correlate with original data for unit_cost
      const originalBatch = batchesData[index];

      return {
        company_id: companyId,
        product_id: insertedBatch.product_id,
        batch_id: insertedBatch.id,
        batch_number: insertedBatch.batch_number,
        from_location_id: null,
        to_location_id: locationId,
        movement_type: 'IN_PURCHASE',
        quantity: insertedBatch.initial_quantity,
        unit_cost: originalBatch?.unit_cost || 0,
        receipt_id: receipt.id,
        notes: `Lote ${insertedBatch.batch_number} - OC ${poId}`
      };
    });

    const { error: movErr } = await schema
      .from('inventory_movements')
      .insert(movementsToInsert);

    if (movErr) throw movErr;
  }

  // 3. Update purchase_order_items & products
  for (const poItemId of Object.keys(itemUpdates)) {
    const updateData = itemUpdates[poItemId];

    const { data: poItem, error: poItemErr } = await schema
      .from('purchase_order_items')
      .select('quantity_received')
      .eq('id', poItemId)
      .single();
    if (poItemErr) throw poItemErr;

    const newQtyReceived = Number(poItem.quantity_received || 0) + updateData.entered_total;

    const { error: updPoItemErr } = await schema
      .from('purchase_order_items')
      .update({ quantity_received: newQtyReceived, updated_by: userId })
      .eq('id', poItemId);
    if (updPoItemErr) throw updPoItemErr;

    const { data: product, error: prodErr } = await schema
      .from('products')
      .select('stock_quantity')
      .eq('id', updateData.product_id)
      .single();
    if (prodErr) throw prodErr;

    const newStock = Number(product.stock_quantity || 0) + updateData.fractionated_total;
    const { error: updProdErr } = await schema
      .from('products')
      .update({ stock_quantity: newStock, updated_by: userId })
      .eq('id', updateData.product_id);
    if (updProdErr) throw updProdErr;
  }

  // 4. Evaluate PO status
  const { data: allItems, error: allItemsErr } = await schema
    .from('purchase_order_items')
    .select('quantity, quantity_received')
    .eq('po_id', poId);

  if (allItemsErr) throw allItemsErr;

  let allReceived = true;
  for (const it of allItems) {
    if (Number(it.quantity_received || 0) < Number(it.quantity)) {
      allReceived = false;
      break;
    }
  }

  const newStatus = allReceived ? 'RECEIVED' : 'PARTIAL';
  const { data: header, error: headerError } = await schema
    .from('purchase_orders')
    .update({ status: newStatus, updated_by: userId })
    .eq('id', poId)
    .select()
    .single();

  if (headerError) throw headerError;

  return { data: header, error: null };
};

export const createPurchaseOrderWithItems = async (headerData, items) => {
  const schema = getPharmacySchema();
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("No se pudo obtener el ID de la compañía.");

  // Omitimos enviar `po_number` porque la BD lo generará con su Trigger.
  // Pero sí incluimos los notes del frontend, y las llaves the RLS.
  const { data: header, error: headerError } = await schema
    .from('purchase_orders')
    .insert([{
      ...headerData, // notes, created_by, total_amount, etc...
      company_id: companyId,
      status: 'PENDING',
      issue_date: new Date().toISOString()
    }])
    .select()
    .single();

  if (headerError) throw headerError;

  const detailItems = items.map(item => ({
    po_id: header.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    total_cost: item.quantity * item.unit_cost
  }));

  const { error: itemsError } = await schema
    .from('purchase_order_items')
    .insert(detailItems);

  if (itemsError) throw itemsError;

  return header;
};
